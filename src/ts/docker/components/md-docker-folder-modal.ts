import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { DockerContainerFull, DockerFolder } from '../types';
import { icon, FOLDER_ICONS, type IconName } from '../icons';

// Modal for CRUD of docker folders. The page component owns the data store
// and persistence — this component renders + emits a single 'docker-save-folders'
// event with the next folders array when the user clicks Save.

const COLOR_SWATCHES = [
  '#ff8c2f', '#3b82f6', '#22c55e', '#a78bfa',
  '#ef4444', '#f59e0b', '#14b8a6', '#6b7280',
];

@customElement('md-docker-folder-modal')
export class MdDockerFolderModal extends LitElement {
  static styles = css`
    :host { display: contents; }
    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: grid; place-items: center;
      z-index: 100;
    }
    .modal {
      width: min(960px, 92vw);
      max-height: 88vh;
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,.5);
    }
    .head {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex; align-items: center; justify-content: space-between;
    }
    .head h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .head p { margin: 0; color: var(--text-secondary); font-size: 12px; }
    .head .icon-btn {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid transparent;
      color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer;
    }
    .head .icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }

    .body { display: grid; grid-template-columns: 280px 1fr; min-height: 0; flex: 1; }
    /* Mobile: the two-pane layout would compress the aside into useless
       width. Stack aside above editor; cap aside height so the editor stays
       reachable without scrolling past a long folder list. */
    @media (max-width: 720px) {
      .body {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(140px, 35vh) 1fr;
      }
      .aside { border-right: 0; border-bottom: 1px solid var(--border-subtle); }
    }
    .aside {
      border-right: 1px solid var(--border-subtle);
      display: flex; flex-direction: column;
      background: var(--bg-base);
      overflow-y: auto;
    }
    .aside h3 {
      font: 600 10px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      padding: 14px 16px 6px;
      margin: 0;
    }
    .aside-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; margin: 2px 8px;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .aside-row:hover { background: var(--bg-elevated); }
    .aside-row[data-active] { background: var(--mui-accent-muted); color: var(--mui-accent); }
    .swatch {
      width: 24px; height: 24px;
      border-radius: var(--radius-sm);
      display: inline-flex; align-items: center; justify-content: center;
    }
    .count { color: var(--text-muted); font-size: 12px; margin-left: auto; font-variant-numeric: tabular-nums; }
    .aside-add {
      margin: 8px 12px 12px 12px;
      display: flex; align-items: center; gap: 6px;
      padding: 8px 10px;
      background: transparent;
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      cursor: pointer;
      font: 500 12px var(--font-sans);
      justify-content: center;
    }
    .aside-add:hover { color: var(--mui-accent); border-color: var(--mui-accent); }

    .main { padding: 20px; overflow-y: auto; }
    .field { margin-bottom: 16px; }
    .field label {
      display: block;
      font: 600 11px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .field input[type="text"] {
      width: 100%;
      height: 36px;
      padding: 0 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font: inherit;
      box-sizing: border-box;
    }
    .field input[type="text"]:focus { outline: 0; border-color: var(--mui-accent); box-shadow: 0 0 0 3px var(--mui-accent-muted); }

    .swatch-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .swatch-pick {
      width: 28px; height: 28px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 2px solid transparent;
    }
    .swatch-pick[data-selected] { border-color: var(--text-primary); transform: scale(1.08); }

    .icon-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .icon-pick {
      width: 36px; height: 36px;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      cursor: pointer;
      color: var(--text-secondary);
    }
    .icon-pick[data-selected] { border-color: var(--mui-accent); color: var(--mui-accent); background: var(--mui-accent-muted); }

    .members {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 12px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      background: var(--bg-base);
      padding: 12px;
    }
    .members h4 {
      margin: 0 0 8px 0;
      font: 600 11px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      display: flex; align-items: center; justify-content: space-between;
    }
    .members-list {
      list-style: none; margin: 0; padding: 0;
      max-height: 320px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 2px;
    }
    .member {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
    }
    .member:hover { border-color: var(--mui-accent); }
    .mini-icon {
      width: 20px; height: 20px;
      border-radius: var(--radius-xs);
      background: var(--bg-elevated);
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0; overflow: hidden;
    }
    .mini-icon img { width: 100%; height: 100%; object-fit: contain; padding: 2px; box-sizing: border-box; }
    .member .name { font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .dot-success { background: var(--success); }
    .dot-danger  { background: var(--danger); }
    .dot-warning { background: var(--warning); }
    .dot-muted   { background: var(--text-muted); }

    .foot {
      padding: 12px 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px;
    }
    .foot .right { display: flex; gap: 8px; }
    .hint { color: var(--text-muted); font-size: 12px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 32px; padding: 0 12px;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      font: 500 13px var(--font-sans);
      cursor: pointer;
    }
    .btn-primary { background: var(--mui-accent); color: #fff; }
    .btn-primary:hover { background: var(--mui-accent-hover); }
    .btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-default); }
    .btn-ghost:hover { background: var(--bg-elevated); color: var(--text-primary); }
    .btn-ghost.danger { color: var(--danger); }
  `;

  @property({ type: Array }) folders: DockerFolder[] = [];
  @property({ type: Array }) containers: DockerContainerFull[] = [];

  // Working copy so the user can Cancel without persisting partial edits.
  @state() private _draft: DockerFolder[] = [];
  @state() private _activeId: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._draft = this.folders.map((f) => ({ ...f, containerNames: [...f.containerNames] }));
    this._activeId = this._draft[0]?.id ?? null;
  }

  private _active(): DockerFolder | null {
    return this._draft.find((f) => f.id === this._activeId) ?? null;
  }

  private _updateActive(patch: Partial<DockerFolder>): void {
    if (!this._activeId) return;
    this._draft = this._draft.map((f) => f.id === this._activeId ? { ...f, ...patch } : f);
  }

  private _addFolder(): void {
    const id = 'f-' + Math.random().toString(36).slice(2, 10);
    const f: DockerFolder = { id, name: 'New folder', icon: 'folder', color: '#ff8c2f', containerNames: [] };
    this._draft = [...this._draft, f];
    this._activeId = id;
  }

  private _deleteActive(): void {
    if (!this._activeId) return;
    if (!confirm('Delete this folder? Containers in it will move to Ungrouped.')) return;
    this._draft = this._draft.filter((f) => f.id !== this._activeId);
    this._activeId = this._draft[0]?.id ?? null;
  }

  private _toggleMembership(name: string): void {
    if (!this._activeId) return;
    const cur = this._active();
    if (!cur) return;
    const has = cur.containerNames.includes(name);

    // Also remove from other folders if adding here — each container is in at most one folder.
    this._draft = this._draft.map((f) => {
      if (f.id === this._activeId) {
        return {
          ...f,
          containerNames: has ? f.containerNames.filter((n) => n !== name) : [...f.containerNames, name],
        };
      }
      if (!has && f.containerNames.includes(name)) {
        return { ...f, containerNames: f.containerNames.filter((n) => n !== name) };
      }
      return f;
    });
  }

  private _save(): void {
    this.dispatchEvent(new CustomEvent<{ folders: DockerFolder[] }>('docker-save-folders', {
      detail: { folders: this._draft },
      bubbles: true, composed: true,
    }));
  }

  private _close(): void {
    // Cancel/X discards unsaved changes silently — matches "Cancel means cancel"
    // convention in every other Unraid form. Save explicitly to persist.
    this.dispatchEvent(new CustomEvent('docker-modal-close', { bubbles: true, composed: true }));
  }

  render() {
    const active = this._active();
    const allNames = new Set(this.containers.map((c) => c.name));

    return html`
      <div class="backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal" role="dialog" aria-modal="true">

          <header class="head">
            <div>
              <h2>Manage Docker Folders</h2>
              <p>Saved to <code>/boot/config/plugins/unraid-modernui/docker-folders.json</code></p>
            </div>
            <button class="icon-btn" @click=${this._close}>${icon('x')}</button>
          </header>

          <div class="body">
            <aside class="aside">
              <h3>Folders · ${this._draft.length}</h3>
              ${this._draft.map((f) => html`
                <div class="aside-row" ?data-active=${f.id === this._activeId} @click=${() => { this._activeId = f.id; }}>
                  <span class="swatch" style="background:${f.color}2e;color:${f.color}">${icon(f.icon as IconName, 14)}</span>
                  <span>${f.name}</span>
                  <span class="count">${f.containerNames.length}</span>
                </div>
              `)}
              <button class="aside-add" @click=${this._addFolder}>${icon('plus', 12)} New folder</button>
            </aside>

            <div class="main">
              ${active ? html`
                <div class="field">
                  <label>Folder name</label>
                  <input type="text" .value=${active.name}
                         @input=${(e: Event) => this._updateActive({ name: (e.target as HTMLInputElement).value })}>
                </div>

                <div class="field">
                  <label>Color</label>
                  <div class="swatch-row">
                    ${COLOR_SWATCHES.map((c) => html`
                      <span class="swatch-pick" style="background:${c}"
                            ?data-selected=${active.color === c}
                            @click=${() => this._updateActive({ color: c })}></span>
                    `)}
                  </div>
                </div>

                <div class="field">
                  <label>Icon</label>
                  <div class="icon-row">
                    ${FOLDER_ICONS.map((n) => html`
                      <span class="icon-pick" ?data-selected=${active.icon === n}
                            @click=${() => this._updateActive({ icon: n })}>${icon(n, 16)}</span>
                    `)}
                  </div>
                </div>

                <div class="field">
                  <label>Containers · click to add or remove</label>
                  <div class="members">
                    <div>
                      <h4>In ${active.name} <span class="count">${active.containerNames.length}</span></h4>
                      <ul class="members-list">
                        ${active.containerNames.filter((n) => allNames.has(n)).map((n) => {
                          const c = this.containers.find((x) => x.name === n);
                          if (!c) return nothing;
                          return html`
                            <li class="member" @click=${() => this._toggleMembership(n)}>
                              <span class="mini-icon">${c.iconUrl ? html`<img src=${c.iconUrl}>` : (c.name[0] ?? '?').toUpperCase()}</span>
                              <span class="name">${c.name}</span>
                              <span class=${'dot ' + stateDotClass(c.state)}></span>
                            </li>
                          `;
                        })}
                      </ul>
                    </div>
                    <div>
                      <h4>Available <span class="count">${this.containers.length - active.containerNames.length}</span></h4>
                      <ul class="members-list">
                        ${this.containers.filter((c) => !active.containerNames.includes(c.name)).map((c) => html`
                          <li class="member" @click=${() => this._toggleMembership(c.name)}>
                            <span class="mini-icon">${c.iconUrl ? html`<img src=${c.iconUrl}>` : (c.name[0] ?? '?').toUpperCase()}</span>
                            <span class="name">${c.name}</span>
                            <span class=${'dot ' + stateDotClass(c.state)}></span>
                          </li>
                        `)}
                      </ul>
                    </div>
                  </div>
                </div>
              ` : html`<p class="hint">No folder selected. Click "New folder" to create one.</p>`}
            </div>
          </div>

          <footer class="foot">
            <span class="hint">Changes are written atomically with LOCK_EX</span>
            <div class="right">
              ${active ? html`<button class="btn btn-ghost danger" @click=${this._deleteActive}>Delete folder</button>` : nothing}
              <button class="btn btn-ghost" @click=${this._close}>Cancel</button>
              <button class="btn btn-primary" @click=${this._save}>Save</button>
            </div>
          </footer>

        </div>
      </div>
    `;
  }
}

function stateDotClass(s: string): string {
  return s === 'started' ? 'dot-success'
       : s === 'paused' ? 'dot-warning'
       : s === 'stopped' ? 'dot-danger'
       : 'dot-muted';
}
