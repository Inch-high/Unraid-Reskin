// Container actions — thin wrappers around Unraid's existing endpoints.
// We do not own the imperative side; we POST to Events.php exactly like the
// stock UI does. State changes propagate back through the nchan stream.

import type { DockerContainerFull, DockerFolder, DockerTag, DockerFoldersFile, DockerTagsFile } from './types';

export type DockerAction = 'start' | 'stop' | 'restart' | 'pause' | 'resume' | 'remove' | 'update';

const EVENTS_ENDPOINT = '/plugins/dynamix.docker.manager/include/Events.php';
// Events.php has no `update` case — POSTing action=update there returns
// {"error":"Unknown action 'update'"} and the container is NEVER updated. The
// stock UI bypasses Events.php for update entirely: it shells out to a
// long-running PHP CLI script (`update_container <name1>*<name2>...`) launched
// detached via StartCommand.php. The script stops, pulls a fresh image, and
// recreates the container(s) serially. Output streams over the `docker` nchan
// channel; we ignore it and rely on docker-state.php polling to detect
// completion.
const START_COMMAND_ENDPOINT = '/webGui/include/StartCommand.php';
const SAVE_FOLDERS    = '/plugins/unraid-modernui/include/save-docker-folders.php';
const SAVE_TAGS       = '/plugins/unraid-modernui/include/save-docker-tags.php';

// CSRF token is published by Unraid's auto_prepend onto `window.csrf_token`.
// We read it once per call so the value stays fresh if the page persists.
function csrfToken(): string {
  return (globalThis as { csrf_token?: string }).csrf_token ?? '';
}

async function postUrlEncoded(url: string, body: Record<string, string>): Promise<Response> {
  const params = new URLSearchParams({ csrf_token: csrfToken(), ...body });
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    credentials: 'same-origin',
  });
}

export async function executeContainer(container: string, action: DockerAction): Promise<void> {
  // update_container is a long-running CLI script, not an Events.php verb —
  // route it through the dedicated helper instead of the (404-equivalent)
  // default Events.php path.
  if (action === 'update') {
    await updateContainers([container]);
    return;
  }
  await postUrlEncoded(EVENTS_ENDPOINT, { action, container });
}

// Trigger updates for one or more containers via Unraid's StartCommand.php +
// update_container script. The script splits its single argv[1] on '*', so we
// join the names that way (after URL-encoding each one to survive both the
// form-body decode and the script's rawurldecode()). One detached worker
// processes the full list serially.
//
// IMPORTANT: StartCommand.php pgrep-matches on the script's binary path, not
// its args — so two concurrent POSTs would race and only the first would
// actually start. Always batch into a single call rather than firing one POST
// per container.
//
// Returns the PID string from StartCommand.php (or '0' if no worker was
// started, e.g. another update is already in flight). The page ignores the
// PID and watches docker-state.php for completion signals — kept here for
// future "abort" UX.
export async function updateContainers(names: string[]): Promise<string> {
  if (names.length === 0) return '0';
  const cmd = 'update_container ' + names.map(encodeURIComponent).join('*');
  const res = await postUrlEncoded(START_COMMAND_ENDPOINT, { cmd, start: '0' });
  if (!res.ok) throw new Error(`update_container ${res.status}`);
  return (await res.text()).trim();
}

// Bulk: concurrency-capped to avoid stampeding dockerd on large selections.
// Sequential start/stop is too slow for 30+ containers; unlimited parallel
// can wedge dockerd. 4 in-flight is a defensible middle ground (matches
// docker compose's default parallelism).
export async function executeBulk(
  containers: string[],
  action: DockerAction,
  concurrency = 4,
): Promise<void> {
  const queue = [...containers];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push((async (): Promise<void> => {
      while (queue.length > 0) {
        const name = queue.shift();
        if (!name) return;
        try { await executeContainer(name, action); }
        catch { /* swallow — nchan will reflect the actual state */ }
      }
    })());
  }
  await Promise.all(workers);
}

// =========================================================================
// One-shot snapshot fetch — replaces HTML scraping.
// =========================================================================

export interface DockerSnapshot {
  containers: DockerContainerFull[];
  folders: DockerFolder[];
  tags: DockerTag[];
  tagAssignments: Record<string, string[]>;
}

// withStats=true opts into the expensive VDisk + `docker stats` fetches on
// the server. We only pass it when the Stats pill is on — otherwise the hot
// snapshot path takes ~1s+ less (no shell-out to `docker stats --no-stream`,
// no `/containers/json?size=true` RW-layer walk). nchan live updates fill in
// CPU/RAM within seconds anyway.
export async function fetchSnapshot(opts: { withStats?: boolean } = {}): Promise<DockerSnapshot> {
  const url = '/plugins/unraid-modernui/include/docker-state.php' + (opts.withStats ? '?stats=1' : '');
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`docker-state.php ${res.status}`);
  return res.json();
}

// =========================================================================
// Folder + tag persistence.
// =========================================================================

export async function saveFolders(folders: DockerFolder[]): Promise<void> {
  const body: DockerFoldersFile = { version: 1, folders };
  const res = await postUrlEncoded(SAVE_FOLDERS, { payload: JSON.stringify(body) });
  if (!res.ok) throw new Error(`save-docker-folders ${res.status}`);
  const json = await res.json() as { ok: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? 'save failed');
}

export async function saveTags(tags: DockerTag[], assignments: Record<string, string[]>): Promise<void> {
  const body: DockerTagsFile = { version: 1, tags, assignments };
  const res = await postUrlEncoded(SAVE_TAGS, { payload: JSON.stringify(body) });
  if (!res.ok) throw new Error(`save-docker-tags ${res.status}`);
  const json = await res.json() as { ok: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? 'save failed');
}

// Trigger Unraid's "check for updates" on every image. The server spawns a
// detached PHP worker (since each image is a serial HTTPS manifest fetch — 10s+
// on a 30-container host) and returns immediately. Caller polls
// getCheckUpdatesStatus() until { running: false } and then re-fetches the
// snapshot to pick up the new `updateAvailable` flags.
export interface CheckUpdatesStart { queued: boolean; running: boolean }
export interface CheckUpdatesStatus { running: boolean; finishedAt: number | null; error: string | null }

const CHECK_UPDATES_URL = '/plugins/unraid-modernui/include/docker-check-updates.php';

export async function checkForUpdates(): Promise<CheckUpdatesStart> {
  const res = await postUrlEncoded(CHECK_UPDATES_URL, {});
  if (!res.ok) throw new Error(`check-updates ${res.status}`);
  const json = await res.json() as { ok: boolean; queued?: boolean; running?: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? 'check failed');
  return { queued: json.queued ?? false, running: json.running ?? true };
}

export async function getCheckUpdatesStatus(): Promise<CheckUpdatesStatus> {
  const res = await fetch(CHECK_UPDATES_URL, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`check-updates status ${res.status}`);
  const json = await res.json() as { running?: boolean; finishedAt?: number | null; error?: string | null };
  return {
    running: json.running ?? false,
    finishedAt: json.finishedAt ?? null,
    error: json.error ?? null,
  };
}

// =========================================================================
// Settings persistence — partial POST to the shared theme save endpoint.
// save.php merges incoming keys over the existing settings.cfg, so we only
// need to send the field we're changing. CSRF token comes from auto_prepend.
// =========================================================================

export async function saveSetting(key: string, value: string): Promise<void> {
  await postUrlEncoded('/plugins/unraid-modernui/include/save.php', { [key]: value });
}

// =========================================================================
// Out-link helpers — to stock UI surfaces we don't replace.
// =========================================================================

export function openWebUi(c: DockerContainerFull): void {
  if (!c.webuiUrl) return;
  window.open(c.webuiUrl, '_blank', 'noopener');
}

export function openLogs(c: DockerContainerFull): void {
  // Match stock popup spec — see DockerContainers.page in the upstream repo.
  const url = `/plugins/dynamix.docker.manager/include/Logging.php?container=${encodeURIComponent(c.name)}`;
  window.open(url, c.name, 'width=868,height=600');
}

export function openConsole(c: DockerContainerFull): void {
  const url = `/plugins/dynamix.docker.manager/include/Exec.php?cmd=${encodeURIComponent(c.shell || 'sh')}&n=${encodeURIComponent(c.name)}&c=${encodeURIComponent(c.id)}`;
  window.open(url, c.name + '_console', 'width=900,height=600');
}

export function openEdit(c: DockerContainerFull): void {
  window.location.href = `/Docker/UpdateContainer?xmlTemplate=edit:${encodeURIComponent(c.templatePath)}`;
}
