// Update-progress store. Subscribes to the `/sub/docker` nchan channel — the
// same stream stock Unraid's update_container script publishes to — and turns
// its custom NUL-delimited message protocol into a reactive snapshot the
// right-side panel can render.
//
// Stock protocol (from dynamix.docker.manager/scripts/update_container.php):
//
//   addLog\0<HTML>           — log line. <legend>…</legend> identifies the
//                              current phase, e.g.:
//                                "Pulling image: linuxserver/plex:latest"
//                                "Stopping container: plex"
//                                "Removing container: plex"
//                                "Command execution" (docker run)
//   addToID\0<id>\0<status>  — new layer entry. Ignored — we wait for the
//                              progress message to actually account for bytes.
//   progress\0<id>\0<text>   — layer progress. `text` is " 45% of 200 MB" when
//                              the total is known; "45 MB" alone for chunked
//                              downloads with no total.
//   show_Wait/stop_Wait\0…   — spinner toggles. Ignored.
//   _DONE_                   — terminator. Whole batch is complete.
//
// We aggregate per-layer percent/total into a single % across all layers, and
// infer download speed from byte deltas across a rolling 2.5s window. The
// pull script doesn't emit speed itself, so this is the best we can do without
// modifying stock Unraid.
//
// Only one container is processed at a time (script does pull → stop → remove
// → run, then loops). When we see a new "Pulling image: …" log we treat the
// previous container as finished and start fresh.

type Listener = () => void;

// Per-layer state harvested from progress messages. `percent` may exist
// without `total` (chunked downloads) and vice-versa for layers that emit
// "Pulling fs layer" before any progress.
interface Layer {
  percent?: number;   // 0–100
  total?: number;     // bytes; parsed from " X% of <size>" suffix
}

// One byte-rate sample. We keep a short window of these to estimate speed —
// instantaneous "delta since last message" jitters wildly because docker
// emits dozens of progress messages per second across multiple layers.
interface Sample { at: number; bytes: number }

const SPEED_WINDOW_MS = 2500;

// sessionStorage key + TTL for cross-navigation persistence. Without this,
// navigating away from /Docker and back wipes the progress session, so the
// panel — which still sees in-flight updating entries from the docker store
// (those persist via their own localStorage probe) — would render them all
// as "Queued" until the next "Pulling image:" log re-establishes the active
// session. With persistence, we restore image+phase+layers and the next
// progress message updates from where we left off.
const PROGRESS_STORAGE_KEY = 'modernui-docker-update-progress';
// 5 min matches UPDATE_TIMEOUT_MS in store.ts — same watchdog the
// updating-set itself uses, so they expire together.
const PROGRESS_TTL_MS = 5 * 60_000;

interface Persisted {
  activeName: string | null;
  image: string;
  phase: UpdatePhase;
  // Layers serialized as entries — Map doesn't JSON-encode directly.
  layers: [string, Layer][];
  savedAt: number;
}

function loadFromStorage(): { active: Internal; activeName: string | null } | null {
  try {
    const raw = sessionStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Persisted>;
    if (!data || typeof data !== 'object') return null;
    if (typeof data.savedAt !== 'number' || Date.now() - data.savedAt > PROGRESS_TTL_MS) {
      sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
      return null;
    }
    if (!Array.isArray(data.layers)) return null;
    const active: Internal = {
      // Speed samples are NOT restored — old timestamps are meaningless after
      // a navigation gap; let the estimator rebuild from the next message.
      samples: [],
      layers: new Map(data.layers as [string, Layer][]),
      image: typeof data.image === 'string' ? data.image : '',
      phase: data.phase === 'recreating' ? 'recreating' : 'pulling',
    };
    return { active, activeName: typeof data.activeName === 'string' ? data.activeName : null };
  } catch { return null; }
}

function saveToStorage(active: Internal | null, activeName: string | null): void {
  try {
    if (!active) {
      sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
      return;
    }
    const data: Persisted = {
      activeName,
      image: active.image,
      phase: active.phase,
      layers: Array.from(active.layers.entries()),
      savedAt: Date.now(),
    };
    sessionStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota / private mode — silent best-effort */ }
}

export type UpdatePhase = 'pulling' | 'recreating';

export interface UpdateProgress {
  // Container name once correlated (image → name lookup via resolveNameByImage).
  // Null until the first "Pulling image:" log lands AND we find a matching container.
  name: string | null;
  // Image string from the most recent "Pulling image: <image>" log.
  image: string;
  // Aggregate percentage across layers — mean of layer percents we've seen.
  // 100 once all layers have status != Downloading (i.e. pull complete).
  percent: number;
  // Sum of declared layer totals (best-effort — some layers lack a total).
  totalBytes: number;
  // Sum of bytes downloaded across layers (total * percent / 100 per layer).
  downloadedBytes: number;
  // Bytes per second over the last ~2.5s. null until we have two samples
  // spaced > 0.5s apart.
  speedBps: number | null;
  // 'pulling' covers the image pull; 'recreating' covers stop+remove+run.
  // No percent during recreating — the script doesn't emit progress for it.
  phase: UpdatePhase;
}

interface Internal {
  layers: Map<string, Layer>;
  samples: Sample[];
  image: string;
  phase: UpdatePhase;
}

export interface UpdateProgressStore {
  /** Snapshot of the currently-active container's update progress, or null
   *  when no update is in flight. */
  getActive(): UpdateProgress | null;
  /** Process one raw nchan payload from /sub/docker. Recovers gracefully from
   *  payloads in unexpected shapes (returns silently). */
  handleMessage(raw: unknown): void;
  /** Force-reset (e.g. when the page detects updates cleared via the snapshot
   *  but the _DONE_ marker was missed because the tab was hidden). */
  reset(): void;
  subscribe(fn: Listener): () => void;
}

// Format-string parser shared across the impl. Matches "X.Y UNIT" where UNIT
// is one of the docker / Unraid formatBytes outputs.
const BYTES_RX = /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)/i;
const MULTIPLIERS: Record<string, number> = {
  B: 1,
  KB: 1000, KIB: 1024,
  MB: 1_000_000, MIB: 1024 ** 2,
  GB: 1_000_000_000, GIB: 1024 ** 3,
  TB: 1e12, TIB: 1024 ** 4,
};

export function parseBytesField(s: string): number {
  const m = BYTES_RX.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  return n * (MULTIPLIERS[u] ?? 1);
}

// Pull the value out of "<legend>...prefix: VALUE</legend>" — used to identify
// the current step's target. We don't anchor on the prefix because i18n could
// change "Pulling image" to "Imagen extrayendo" etc; the colon separator is
// stable across locales (stock script literally writes ": " in PHP).
function legendValue(html: string): string | null {
  const m = /<legend>[^<]*?:\s*([^<]+?)<\/legend>/i.exec(html);
  return m ? m[1].trim() : null;
}

function isLegendOf(html: string, ...prefixes: string[]): boolean {
  const m = /<legend>([^<]*)<\/legend>/i.exec(html);
  if (!m) return false;
  const text = m[1];
  return prefixes.some((p) => text.includes(p));
}

export function createUpdateProgressStore(
  // image → container.name resolver. Provided by the caller because the
  // progress store stays decoupled from the docker store. The pull log gives
  // us only the image string ("linuxserver/plex:latest"); the docker store
  // knows the container.name. Return null if no match (rare; some images may
  // pull before the snapshot has it).
  resolveNameByImage: (image: string) => string | null,
  // Fired when the nchan stream emits `_DONE_` — the stock update_container
  // script's end-of-batch marker. Wires up clearing the docker store's
  // updating set + a fresh snapshot fetch so the panel/badges don't sit on
  // stale state when the digest-status cache lags behind the actual update.
  onBatchComplete?: () => void,
): UpdateProgressStore {
  // Hydrate from sessionStorage so navigating away and back doesn't blank
  // the panel mid-update. If nothing's saved (or it's expired), starts empty.
  const restored = loadFromStorage();
  let active: Internal | null = restored?.active ?? null;
  let activeName: string | null = restored?.activeName ?? null;
  const listeners = new Set<Listener>();
  const notify = (): void => {
    // Persist on every state change. Cheap (small payload, sync write) and
    // means we never lose more than the most recent message on a hard nav.
    saveToStorage(active, activeName);
    for (const l of listeners) l();
  };

  function snapshot(): UpdateProgress | null {
    if (!active) return null;
    let percentSum = 0;
    let layerCount = 0;
    let totalSum = 0;
    let downloadedSum = 0;
    for (const layer of active.layers.values()) {
      if (layer.percent !== undefined) {
        percentSum += layer.percent;
        layerCount += 1;
      }
      if (layer.total !== undefined && layer.percent !== undefined) {
        totalSum += layer.total;
        downloadedSum += (layer.total * layer.percent) / 100;
      }
    }
    const percent = active.phase === 'recreating'
      ? 100
      : (layerCount > 0 ? percentSum / layerCount : 0);

    let speedBps: number | null = null;
    if (active.phase === 'pulling' && active.samples.length >= 2) {
      const first = active.samples[0];
      const last = active.samples[active.samples.length - 1];
      const dt = (last.at - first.at) / 1000;
      const db = last.bytes - first.bytes;
      if (dt > 0.5 && db >= 0) speedBps = db / dt;
    }

    return {
      name: activeName,
      image: active.image,
      percent,
      totalBytes: totalSum,
      downloadedBytes: downloadedSum,
      speedBps,
      phase: active.phase,
    };
  }

  function stampSample(downloadedBytes: number, now: number): void {
    if (!active) return;
    active.samples.push({ at: now, bytes: downloadedBytes });
    const cutoff = now - SPEED_WINDOW_MS;
    while (active.samples.length > 1 && active.samples[0].at < cutoff) {
      active.samples.shift();
    }
  }

  function startNew(image: string): void {
    active = { layers: new Map(), samples: [], image, phase: 'pulling' };
    activeName = resolveNameByImage(image);
  }

  return {
    getActive: snapshot,

    handleMessage(raw) {
      if (typeof raw !== 'string' || raw === '') return;

      // End-of-batch marker. Stock script publishes `_DONE_` followed by an
      // empty string (`write('_DONE_','')`); the empty publish is filtered
      // by the typeof guard above. Clearing our session + firing the
      // batch-complete callback lets the page force-clear the docker
      // store's updating set, bypassing the digest-status cache lag that
      // would otherwise keep "Working…" stuck for the full watchdog window.
      if (raw === '_DONE_') {
        active = null;
        activeName = null;
        notify();
        onBatchComplete?.();
        return;
      }

      const idx = raw.indexOf('\0');
      // No \0 → raw HTML log line. Stock script publishes these for whitespace
      // separators; nothing actionable for us.
      if (idx === -1) return;
      const cmd = raw.slice(0, idx);
      const rest = raw.slice(idx + 1);

      if (cmd === 'addLog') {
        // New container's pull starting. The legend is the canonical marker.
        // We match on "image:" / "container:" / "execution" rather than the
        // localized prefix word, so non-English locales still flow correctly.
        if (/<legend>[^<]*image\s*:/i.test(rest)) {
          const img = legendValue(rest);
          if (img) {
            startNew(img);
            notify();
          }
          return;
        }
        // Phase transitions within the same container — stop, remove, run.
        // Switch to 'recreating' so the UI shows an indeterminate state
        // instead of a stale percentage.
        if (isLegendOf(rest, 'container:', 'execution')) {
          if (active && active.phase !== 'recreating') {
            active.phase = 'recreating';
            notify();
          }
        }
        return;
      }

      if (cmd === 'progress') {
        if (!active) return;
        const idx2 = rest.indexOf('\0');
        if (idx2 === -1) return;
        const id = rest.slice(0, idx2);
        const text = rest.slice(idx2 + 1);

        const layer = active.layers.get(id) ?? {};
        const pctM = /(\d+(?:\.\d+)?)\s*%/.exec(text);
        if (pctM) layer.percent = Math.min(100, parseFloat(pctM[1]));
        const ofM = /of\s+(.+)$/i.exec(text);
        if (ofM) {
          const bytes = parseBytesField(ofM[1]);
          if (bytes > 0) layer.total = bytes;
        } else if (layer.percent === undefined) {
          // No "% of" → chunked, total unknown. Best-effort: take the bytes
          // value as both total and progress so it contributes to the speed
          // estimate but doesn't poison the percentage aggregate.
          const bytes = parseBytesField(text);
          if (bytes > 0) {
            layer.total = bytes;
            layer.percent = 100;
          }
        }
        active.layers.set(id, layer);

        // Recompute downloaded bytes and stamp a speed sample.
        let downloadedSum = 0;
        for (const l of active.layers.values()) {
          if (l.total !== undefined && l.percent !== undefined) {
            downloadedSum += (l.total * l.percent) / 100;
          }
        }
        stampSample(downloadedSum, Date.now());
        notify();
        return;
      }

      // Other commands (addToID, show_Wait, stop_Wait) — ignored.
    },

    reset() {
      if (!active && !activeName) return;
      active = null;
      activeName = null;
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn) as unknown as void;
    },
  };
}
