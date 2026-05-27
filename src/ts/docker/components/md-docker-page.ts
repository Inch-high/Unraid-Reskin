import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { DockerStore } from '../store';
import { filterContainers, groupContainers, filtersToQuery } from '../store';
import type { DockerFolder, DockerTag } from '../types';
import { icon } from '../icons';
import {
  executeContainer,
  executeBulk,
  saveFolders as saveFoldersRemote,
  saveTags as saveTagsRemote,
  saveSetting,
  checkForUpdates,
  getCheckUpdatesStatus,
  fetchSnapshot,
  openWebUi,
  openLogs,
  openConsole,
  openEdit,
  type DockerAction,
} from '../actions';
import type { DockerRowActionDetail } from './md-docker-row';
import type { BulkAction } from './md-docker-bulk-bar';
import './md-docker-toolbar';
import './md-docker-folder-section';
import './md-docker-bulk-bar';
import './md-docker-folder-modal';
import './md-docker-tag-modal';

@customElement('modernui-docker-page')
export class ModernuiDockerPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      background: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-sans);
    }
    .content {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
      width: 100%;
      box-sizing: border-box;
    }
    /* Mobile: 24px of padding eats nearly 50px of horizontal viewport on a
       phone — tighten to 12px so cards/rows have real estate to breathe. */
    @media (max-width: 640px) {
      .content { padding: 16px 12px; }
      .head { gap: 12px; margin-bottom: 16px; }
      .head h1 { font-size: 20px; }
      .head .sub { font-size: 12px; }
      .actions {
        /* On mobile, action buttons wrap into a row at the top of the
           folder/tag/add stack. Stretch each button to the same width so
           they read as a group rather than mismatched widths from text. */
        width: 100%;
        gap: 6px;
      }
      .actions .btn { flex: 1 1 auto; min-width: 0; justify-content: center; }
    }

    .head {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .head h1 { margin: 0 0 4px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; }
    .head .sub {
      margin: 0;
      display: flex; align-items: center; gap: 8px;
      color: var(--text-secondary);
      font-size: 13px;
      flex-wrap: wrap;
    }
    .head .sub strong { color: var(--text-primary); font-weight: 600; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 2px 10px;
      border-radius: var(--radius-full);
      background: var(--bg-elevated);
      font-size: 12px;
      color: var(--text-secondary);
    }
    .pill .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-success { background: var(--success); }
    .dot-danger  { background: var(--danger); }
    .dot-info    { background: var(--info); }
    .sep { color: var(--text-muted); }

    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 32px; padding: 0 12px;
      background: transparent;
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font: 500 13px var(--font-sans);
    }
    .btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
    .btn:disabled { opacity: 0.6; cursor: progress; }
    .btn:disabled:hover { background: transparent; color: var(--text-secondary); }
    .btn-primary { background: var(--mui-accent); color: #fff; border-color: var(--mui-accent); }
    .btn-primary:hover { background: var(--mui-accent-hover); border-color: var(--mui-accent-hover); color: #fff; }

    /* Skeleton block while the first snapshot is in flight. Three placeholder
       rows of the same shape as a real row, with a soft shimmer. Without this
       the page would briefly show the "No containers" empty state because the
       store starts with containers=[]. */
    .skeleton {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .skeleton .sk-row {
      display: grid;
      grid-template-columns: 28px 40px 1fr 110px 90px;
      gap: 12px;
      padding: 14px 12px;
      align-items: center;
      border-top: 1px solid var(--border-subtle);
    }
    .skeleton .sk-row:first-child { border-top: 0; }
    .skeleton .sk-bar {
      height: 12px;
      background: linear-gradient(90deg, var(--bg-elevated) 0%, var(--border-subtle) 50%, var(--bg-elevated) 100%);
      background-size: 200% 100%;
      border-radius: var(--radius-xs);
      animation: sk-shimmer 1.2s ease-in-out infinite;
    }
    .skeleton .sk-icon {
      width: 28px; height: 28px;
      background: var(--bg-elevated);
      border-radius: var(--radius-sm);
    }
    @keyframes sk-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .empty {
      padding: 48px 20px;
      text-align: center;
      color: var(--text-secondary);
      background: var(--bg-surface);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-md);
    }
    .empty strong { display: block; font-size: 16px; color: var(--text-primary); margin-bottom: 4px; }
  `;

  private _store: DockerStore | null = null;
  private _unsubscribe: (() => void) | null = null;

  @state() private _tick = 0;   // re-render trigger
  @state() private _showFolderModal = false;
  @state() private _showTagModal = false;
  @state() private _checkingUpdates = false;
  private _checkPollHandle: number | null = null;

  setStore(store: DockerStore): void {
    this._unsubscribe?.();
    this._store = store;
    this._unsubscribe = store.subscribe(() => { this._tick++; });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    if (this._checkPollHandle !== null) {
      window.clearTimeout(this._checkPollHandle);
      this._checkPollHandle = null;
    }
  }

  private async _handleAction(e: CustomEvent<DockerRowActionDetail>): Promise<void> {
    if (!this._store) return;
    const { container, action } = e.detail;
    const state = this._store.getState();
    const c = state.containers.find((x) => x.name === container);
    if (!c) return;

    switch (action) {
      case 'webui':   openWebUi(c); return;
      case 'logs':    openLogs(c);  return;
      case 'console': openConsole(c); return;
      case 'edit':    openEdit(c);  return;
      case 'remove':
        if (!confirm(`Remove container "${c.name}"? Templates are kept; you can re-add from Add Container.`)) return;
        await executeContainer(c.name, 'remove');
        return;
      case 'update':
        await executeContainer(c.name, 'update');
        return;
      case 'start':
      case 'stop':
      case 'restart':
      case 'pause':
      case 'resume': {
        const map: Record<string, DockerAction> = {
          start: 'start', stop: 'stop', restart: 'restart',
          pause: 'pause', resume: 'start',
        };
        await executeContainer(c.name, map[action]);
        return;
      }
    }
  }

  private async _handleBulk(e: CustomEvent<{ action: BulkAction }>): Promise<void> {
    if (!this._store) return;
    const selected = Array.from(this._store.getSelection());
    if (selected.length === 0) return;
    const a = e.detail.action;

    if (a === 'clear') { this._store.clearSelection(); return; }

    if (a === 'remove') {
      if (!confirm(`Remove ${selected.length} container${selected.length === 1 ? '' : 's'}? Templates are kept.`)) return;
      await executeBulk(selected, 'remove');
      this._store.clearSelection();
      return;
    }

    const map: Record<Exclude<BulkAction, 'clear' | 'remove'>, DockerAction> = {
      start: 'start', stop: 'stop', restart: 'restart', update: 'update',
    };
    await executeBulk(selected, map[a as Exclude<BulkAction, 'clear' | 'remove'>]);
  }

  private _handleToggleSelect = (e: Event): void => {
    if (!this._store) return;
    const ce = e as CustomEvent<{ container: string }>;
    this._store.toggleSelection(ce.detail.container);
  };

  private _handleFolderSelect = (e: Event): void => {
    if (!this._store) return;
    const ce = e as CustomEvent<{ folderId: string | null; containerNames: string[] }>;
    // Toggle: if all in this folder are selected, deselect all; else select all.
    const sel = this._store.getSelection();
    const allSelected = ce.detail.containerNames.every((n) => sel.has(n));
    for (const n of ce.detail.containerNames) {
      const has = sel.has(n);
      if (allSelected && has) this._store.toggleSelection(n);
      else if (!allSelected && !has) this._store.toggleSelection(n);
    }
  };

  private _handleFilters = (e: Event): void => {
    if (!this._store) return;
    const ce = e as CustomEvent<typeof this._store extends DockerStore ? ReturnType<DockerStore['getFilters']> : never>;
    this._store.setFilters(ce.detail);
    // Sync URL so views are bookmarkable.
    const url = window.location.pathname + filtersToQuery(this._store.getFilters());
    window.history.replaceState(null, '', url);
  };

  private _handleToggleFolder = (e: Event): void => {
    if (!this._store) return;
    const ce = e as CustomEvent<{ folderId: string }>;
    this._store.toggleCollapsed(ce.detail.folderId);
  };

  private _handleFolderDefault = async (e: Event): Promise<void> => {
    if (!this._store) return;
    const ce = e as CustomEvent<{ value: 'expanded' | 'collapsed' }>;
    // Immediate UI update; PHP persistence is best-effort in the background.
    this._store.setCollapseDefault(ce.detail.value);
    document.documentElement.dataset.modernuiDockerFolderDefault = ce.detail.value;
    try { await saveSetting('docker_folder_default', ce.detail.value); }
    catch (err) { console.warn('[modernui-docker] failed to persist folder default:', err); }
  };

  // Kick off the async worker, then poll the status endpoint until it reports
  // not-running. Async because reloadUpdateStatus() walks every image's tag
  // manifest over HTTPS — 10s+ on a 30-container host. Polling beats a
  // dedicated nchan worker here because the event is one-shot (vs. the
  // continuous stats stream that nchan does carry).
  private _runCheckForUpdates = async (): Promise<void> => {
    if (!this._store || this._checkingUpdates) return;
    this._checkingUpdates = true;
    try {
      await checkForUpdates();
      this._pollCheckUpdates();
    } catch (err) {
      this._checkingUpdates = false;
      console.warn('[modernui-docker] check-for-updates failed:', err);
      alert(`Check for updates failed: ${(err as Error).message}`);
    }
  };

  // Poll every 2s. Pauses while the tab is hidden (cheap retries kicked off
  // on visibilitychange would still serve us, but tab-hidden polling burns
  // background CPU on long-lived tabs — see unraid/webgui#2641).
  //
  // Soft 60s cap: the worker is already self-healing — posix_kill(pid, 0) on
  // the lock file cleans stale PIDs, so a crashed worker eventually flips
  // `status.running` to false. But if PHP-FPM dies mid-fork, the lock + status
  // file may stay forever stuck in "running". Bail after ~60s so the button
  // returns to its idle state instead of polling indefinitely.
  private static readonly POLL_INTERVAL_MS = 2000;
  private static readonly POLL_MAX_MS = 60_000;

  private _pollCheckUpdates(): void {
    const startedAt = Date.now();
    const tick = async (): Promise<void> => {
      this._checkPollHandle = null;
      if (Date.now() - startedAt > ModernuiDockerPage.POLL_MAX_MS) {
        // Soft cap reached. Treat as a silent worker failure: still refresh
        // the snapshot once (the worker might have written update-status.json
        // even if it never cleared its lock), warn, release the button.
        console.warn('[modernui-docker] check-for-updates poll exceeded 60s, giving up');
        try {
          const snap = await fetchSnapshot({ withStats: this._store?.getShowStats() ?? false });
          this._store?.setState({
            containers: snap.containers,
            folders: snap.folders,
            tags: snap.tags,
            tagAssignments: snap.tagAssignments,
          });
        } catch { /* snapshot is best-effort here */ }
        this._checkingUpdates = false;
        return;
      }
      if (document.hidden) {
        this._checkPollHandle = window.setTimeout(tick, ModernuiDockerPage.POLL_INTERVAL_MS);
        return;
      }
      try {
        const status = await getCheckUpdatesStatus();
        if (status.running) {
          this._checkPollHandle = window.setTimeout(tick, ModernuiDockerPage.POLL_INTERVAL_MS);
          return;
        }
        if (status.error) {
          console.warn('[modernui-docker] check-for-updates worker error:', status.error);
        }
        const snap = await fetchSnapshot({ withStats: this._store?.getShowStats() ?? false });
        this._store?.setState({
          containers: snap.containers,
          folders: snap.folders,
          tags: snap.tags,
          tagAssignments: snap.tagAssignments,
        });
      } catch (err) {
        console.warn('[modernui-docker] status poll failed:', err);
      } finally {
        this._checkingUpdates = false;
      }
    };
    this._checkPollHandle = window.setTimeout(tick, ModernuiDockerPage.POLL_INTERVAL_MS);
  }

  private _runUpdateSelected = async (): Promise<void> => {
    if (!this._store) return;
    const selected = Array.from(this._store.getSelection());
    if (selected.length === 0) return;
    // Confirm — updating pulls a new image and recreates the container, can be slow.
    if (!confirm(`Update ${selected.length} container${selected.length === 1 ? '' : 's'}? Each will be pulled + recreated.`)) return;
    this._checkingUpdates = true;
    try {
      await executeBulk(selected, 'update');
      // Refresh snapshot — uptime + updateAvailable both should change for updated ones.
      const snap = await fetchSnapshot();
      this._store.setState({
        containers: snap.containers,
        folders: snap.folders,
        tags: snap.tags,
        tagAssignments: snap.tagAssignments,
      });
      this._store.clearSelection();
    } catch (err) {
      console.warn('[modernui-docker] bulk update failed:', err);
    } finally {
      this._checkingUpdates = false;
    }
  };

  private _handleShowStats = async (e: Event): Promise<void> => {
    if (!this._store) return;
    const ce = e as CustomEvent<{ on: boolean }>;
    this._store.setShowStats(ce.detail.on);
    document.documentElement.dataset.modernuiDockerStats = ce.detail.on ? 'on' : 'off';
    // When turning stats ON, refetch with ?stats=1 so VDisk + initial CPU/RAM
    // populate. (Boot skipped them when stats started off.) When turning OFF,
    // we keep last-known values — they just stop being shown.
    if (ce.detail.on) {
      try {
        const snap = await fetchSnapshot({ withStats: true });
        this._store.setState({
          containers: snap.containers,
          folders: snap.folders,
          tags: snap.tags,
          tagAssignments: snap.tagAssignments,
        });
      } catch (err) {
        console.warn('[modernui-docker] stats refetch failed:', err);
      }
    }
    try { await saveSetting('docker_show_stats', ce.detail.on ? 'on' : 'off'); }
    catch (err) { console.warn('[modernui-docker] failed to persist show_stats:', err); }
  };

  private async _saveFolders(e: Event): Promise<void> {
    if (!this._store) return;
    const ce = e as CustomEvent<{ folders: DockerFolder[] }>;
    try {
      await saveFoldersRemote(ce.detail.folders);
      this._store.setFolders(ce.detail.folders);
      this._showFolderModal = false;
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    }
  }

  private async _saveTags(e: Event): Promise<void> {
    if (!this._store) return;
    const ce = e as CustomEvent<{ tags: DockerTag[]; assignments: Record<string, string[]> }>;
    try {
      await saveTagsRemote(ce.detail.tags, ce.detail.assignments);
      this._store.setTags(ce.detail.tags, ce.detail.assignments);
      this._showTagModal = false;
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    }
  }

  render() {
    if (!this._store) return html`<div class="content"><p class="empty">Loading…</p></div>`;
    const state = this._store.getState();
    const filters = this._store.getFilters();
    const selection = this._store.getSelection();

    const filtered = filterContainers(state, filters);
    const groups = groupContainers(filtered, state.folders);

    const total = state.containers.length;
    const running = state.containers.filter((c) => c.state === 'started').length;
    const stopped = total - running;
    const withUpdates = state.containers.filter((c) => c.updateAvailable).length;

    return html`
      <div class="content"
           @docker-action=${(e: CustomEvent<DockerRowActionDetail>) => this._handleAction(e)}
           @docker-toggle-select=${this._handleToggleSelect}
           @docker-select-folder=${this._handleFolderSelect}
           @docker-bulk=${(e: CustomEvent<{ action: BulkAction }>) => this._handleBulk(e)}
           @docker-filters=${this._handleFilters}
           @docker-toggle-folder=${this._handleToggleFolder}
           @docker-folder-default=${this._handleFolderDefault}
           @docker-show-stats=${this._handleShowStats}
           @docker-edit-folder=${() => { this._showFolderModal = true; }}
           @docker-save-folders=${(e: Event) => this._saveFolders(e)}
           @docker-save-tags=${(e: Event) => this._saveTags(e)}
           @docker-modal-close=${() => { this._showFolderModal = false; this._showTagModal = false; }}>

        <header class="head">
          <div>
            <h1>Docker</h1>
            <p class="sub">
              <span><strong>${total}</strong> containers</span>
              <span class="sep">·</span>
              <span class="pill"><span class="dot dot-success"></span> ${running} running</span>
              ${stopped > 0 ? html`<span class="pill"><span class="dot dot-danger"></span> ${stopped} stopped</span>` : nothing}
              ${withUpdates > 0 ? html`<span class="pill"><span class="dot dot-info"></span> ${withUpdates} update${withUpdates === 1 ? '' : 's'} available</span>` : nothing}
            </p>
          </div>
          <div class="actions">
            ${selection.size > 0 ? html`
              <button class="btn" ?disabled=${this._checkingUpdates} @click=${this._runUpdateSelected}>
                ${icon('update')} ${this._checkingUpdates ? 'Updating…' : `Update selected (${selection.size})`}
              </button>
            ` : html`
              <button class="btn" ?disabled=${this._checkingUpdates} @click=${this._runCheckForUpdates}>
                ${icon('update')} ${this._checkingUpdates ? 'Checking…' : 'Check for updates'}
              </button>
            `}
            <button class="btn" @click=${() => { this._showTagModal = true; }}>${icon('tag')} Manage Tags</button>
            <button class="btn" @click=${() => { this._showFolderModal = true; }}>${icon('folder')} Manage Folders</button>
            <a class="btn btn-primary" href="/Docker/AddContainer">${icon('plus')} Add Container</a>
          </div>
        </header>

        <md-docker-toolbar
          .filters=${filters}
          .containers=${state.containers}
          .tags=${state.tags}
          .tagAssignments=${state.tagAssignments}
          .folderDefault=${this._store?.getCollapseDefault() ?? 'expanded'}
          .showStats=${this._store?.getShowStats() ?? false}
        ></md-docker-toolbar>

        ${this._store?.isLoading() ? html`
          <div class="skeleton" aria-live="polite" aria-busy="true">
            ${[0, 1, 2, 3].map(() => html`
              <div class="sk-row">
                <div></div>
                <div class="sk-icon"></div>
                <div class="sk-bar" style="width: 60%"></div>
                <div class="sk-bar" style="width: 70%"></div>
                <div class="sk-bar" style="width: 50%"></div>
              </div>
            `)}
          </div>
        ` : total === 0 ? html`
          <div class="empty">
            <strong>No containers</strong>
            Add one from Community Apps, or use the Add Container button above.
          </div>
        ` : groups.length === 0 ? html`
          <div class="empty">
            <strong>No containers match your filters</strong>
            Clear filters or change the search query.
          </div>
        ` : groups.map((g) => {
          const key = g.folderId ?? 'ungrouped';
          return html`
            <md-docker-folder-section
              .folder=${g.folder}
              .containers=${g.containers}
              .allTags=${state.tags}
              .tagAssignments=${state.tagAssignments}
              .selection=${selection}
              ?collapsed=${this._store?.isCollapsed(key) ?? false}
              ?showStats=${this._store?.getShowStats() ?? false}
            ></md-docker-folder-section>
          `;
        })}

        ${selection.size > 0 ? html`
          <md-docker-bulk-bar .selectedCount=${selection.size}></md-docker-bulk-bar>
        ` : nothing}

        ${this._showFolderModal ? html`
          <md-docker-folder-modal
            .folders=${state.folders}
            .containers=${state.containers}
          ></md-docker-folder-modal>
        ` : nothing}

        ${this._showTagModal ? html`
          <md-docker-tag-modal
            .tags=${state.tags}
            .assignments=${state.tagAssignments}
            .containers=${state.containers}
          ></md-docker-tag-modal>
        ` : nothing}
      </div>
    `;
  }
}
