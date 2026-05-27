// Container actions — thin wrappers around Unraid's existing endpoints.
// We do not own the imperative side; we POST to Events.php exactly like the
// stock UI does. State changes propagate back through the nchan stream.

import type { DockerContainerFull, DockerFolder, DockerTag, DockerFoldersFile, DockerTagsFile } from './types';

export type DockerAction = 'start' | 'stop' | 'restart' | 'pause' | 'resume' | 'remove' | 'update';

const EVENTS_ENDPOINT = '/plugins/dynamix.docker.manager/include/Events.php';
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
  await postUrlEncoded(EVENTS_ENDPOINT, { action, container });
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

export async function fetchSnapshot(): Promise<DockerSnapshot> {
  const res = await fetch('/plugins/unraid-modernui/include/docker-state.php', {
    credentials: 'same-origin',
  });
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
