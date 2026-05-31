// Visibility-aware nchan subscription for the /Main page.
//
// Unlike the docker stream (one channel of cpu/mem deltas), /Main listens on
// several signal channels — most just mean "state changed, resync"; mymonitor
// carries a busy int (0 idle / 1 parity / 2 mover / 3 btrfs). So this helper is
// channel-oriented: each channel gets a handler, messages are dropped while the
// tab is hidden, and becoming visible triggers a one-shot resync.
//
// Mirrors the invariant from unraid/webgui#2641: no processing while hidden.

interface NchanLike {
  on(event: string, fn: (...args: unknown[]) => void): void;
  start(): void;
  stop(): void;
}
type NchanCtor = new (url: string, opts?: Record<string, unknown>) => NchanLike;

export interface MainChannel {
  url: string;
  /** Handle one raw payload (only called while the tab is visible). */
  handle: (raw: string) => void;
}

export interface MainLiveOptions {
  channels: MainChannel[];
  /** Called once each time the tab becomes visible after being hidden. */
  resync: () => void | Promise<void>;
  doc?: Document;
}

export interface MainLiveSubscription {
  stop(): void;
  /** Test hook: messages processed since the last visibility flip to visible. */
  readonly processedSinceVisible: number;
}

export function createMainLive(opts: MainLiveOptions): MainLiveSubscription {
  const doc = opts.doc ?? document;
  const Ctor = (window as unknown as { NchanSubscriber?: NchanCtor }).NchanSubscriber;
  if (!Ctor) {
    // nchan not loaded (unusual on Unraid) — no live updates, but the page
    // still works via the initial snapshot + action-driven resyncs.
    return { stop: () => undefined, processedSinceVisible: 0 };
  }

  let processed = 0;
  const subs: NchanLike[] = [];

  for (const ch of opts.channels) {
    const sub = new Ctor(ch.url, { subscriber: 'websocket' });
    sub.on('message', ((raw: unknown) => {
      if (doc.hidden) return; // drop silently while hidden
      if (typeof raw !== 'string') return;
      processed++;
      ch.handle(raw);
    }) as (...a: unknown[]) => void);
    sub.start();
    subs.push(sub);
  }

  const onVisibility = (): void => {
    if (doc.hidden) {
      processed = 0;
      return;
    }
    Promise.resolve(opts.resync()).catch(() => undefined);
  };
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    stop() {
      for (const s of subs) s.stop();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
    get processedSinceVisible() {
      return processed;
    },
  };
}

// Parse a /sub/mymonitor payload ("0".."3") into the busy enum. Returns null
// for anything unexpected so the caller can ignore it.
export function parseBusy(raw: string): 0 | 1 | 2 | 3 | null {
  const n = Number.parseInt(raw.trim(), 10);
  return n === 0 || n === 1 || n === 2 || n === 3 ? n : null;
}
