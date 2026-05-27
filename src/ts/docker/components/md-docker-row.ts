import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DockerContainerFull, DockerTag } from '../types';
import { icon } from '../icons';
import { formatBytes, formatPercent, formatMac } from '../format';

// Single container row. Stateless — the parent owns selection state and
// dispatches actions via the bubbling 'docker-action' / 'docker-toggle-select'
// custom events.

export interface DockerRowActionDetail {
  container: string;
  action: 'start' | 'stop' | 'restart' | 'pause' | 'resume' | 'remove' | 'update' | 'webui' | 'logs' | 'console' | 'edit';
}

@customElement('md-docker-row')
export class MdDockerRow extends LitElement {
  static styles = css`
    :host { display: contents; }
    .row {
      display: grid;
      grid-template-columns: 28px 40px minmax(220px, 1.4fr) minmax(140px, 1fr) minmax(120px, 0.8fr) 80px 110px 110px;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-top: 1px solid var(--border-subtle);
      transition: background var(--duration-fast, 120ms) var(--ease-out, cubic-bezier(0.2,0,0,1));
    }
    .row:hover { background: var(--bg-elevated); }
    .row[data-selected] { background: var(--mui-accent-muted); }
    .row[data-stopped] .name { color: var(--text-secondary); }
    /* 3px accent down the left edge when an update is available.
       Inset box-shadow (not border-left) so grid alignment stays put — a real
       border would shift every column 3px right on update rows only. */
    .row[data-update] {
      box-shadow: inset 3px 0 0 var(--mui-accent);
    }

    input[type="checkbox"] {
      appearance: none;
      width: 16px; height: 16px;
      border: 1.5px solid var(--border-default);
      border-radius: var(--radius-xs);
      background: var(--bg-base);
      cursor: pointer;
      position: relative;
      margin: 0;
    }
    input[type="checkbox"]:checked {
      background: var(--mui-accent);
      border-color: var(--mui-accent);
    }
    input[type="checkbox"]:checked::after {
      content: ""; position: absolute; left: 4px; top: 1px;
      width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    .icon {
      width: 40px; height: 40px;
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      display: inline-flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .icon img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
    .icon-fallback {
      font: 600 12px var(--font-sans);
      color: var(--text-muted);
      background: var(--bg-elevated);
    }

    .main { min-width: 0; }
    .name {
      font-weight: 500;
      color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .image {
      font-size: 12px;
      color: var(--text-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .badge-update {
      display: inline-block;
      font: 600 9px var(--font-sans);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--info);
      background: rgba(59,130,246,.15);
      padding: 1px 6px;
      border-radius: var(--radius-full);
      margin-left: 4px;
      vertical-align: middle;
    }

    /* Stats line — only visible when showStats=true. Sits below the image
       inside .main so columns remain stable; mono font for tabular alignment. */
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 3px;
      font-family: ui-monospace, "JetBrains Mono", "SF Mono", Consolas, monospace;
      font-size: 11px;
      color: var(--text-muted);
    }
    .stats .stat strong {
      color: var(--text-secondary);
      font-weight: 500;
      font-family: var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
      margin-right: 4px;
    }
    .stats .stat.mac { letter-spacing: -0.02em; }

    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag {
      display: inline-flex; align-items: center;
      font: 600 10px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      border-radius: var(--radius-full);
    }

    .ports, .uptime {
      font-family: ui-monospace, "JetBrains Mono", "SF Mono", Consolas, monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .state-badge {
      display: inline-flex; align-items: center; gap: 6px;
      font: 600 11px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 10px;
      border-radius: var(--radius-full);
    }
    .state-started { background: rgba(34,197,94,.15); color: var(--success); }
    .state-stopped { background: rgba(239,68,68,.15); color: var(--danger); }
    .state-paused  { background: rgba(245,158,11,.15); color: var(--warning); }
    .state-unknown { background: var(--bg-elevated); color: var(--text-muted); }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-success { background: var(--success); }
    .dot-danger  { background: var(--danger); }
    .dot-warning { background: var(--warning); }
    .dot-muted   { background: var(--text-muted); }

    .actions { display: flex; gap: 2px; justify-content: flex-end; position: relative; }
    .icon-btn {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background var(--duration-fast, 120ms),
                  color var(--duration-fast, 120ms),
                  border-color var(--duration-fast, 120ms);
    }
    .icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); border-color: var(--border-default); }
    .icon-btn-success:hover { color: var(--success); border-color: rgba(34,197,94,.4); }
    .icon-btn-warn:hover    { color: var(--warning); border-color: rgba(245,158,11,.4); }

    /* Action menu popover */
    .menu {
      position: absolute;
      top: 36px; right: 0;
      min-width: 180px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 4px;
      z-index: 5;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
    }
    .menu button {
      display: flex; align-items: center; gap: 8px;
      width: 100%;
      padding: 6px 10px;
      background: transparent; border: 0;
      color: var(--text-secondary);
      font: 500 13px var(--font-sans);
      cursor: pointer;
      border-radius: var(--radius-sm);
      text-align: left;
    }
    .menu button:hover { background: var(--bg-base); color: var(--text-primary); }
    .menu button.danger:hover { color: var(--danger); }
    .menu .divider { height: 1px; background: var(--border-subtle); margin: 4px 0; }

    @media (max-width: 1100px) {
      .row { grid-template-columns: 28px 40px 1.5fr 1fr 80px 110px 110px; }
      .ports { display: none; }
    }
    @media (max-width: 860px) {
      .row { grid-template-columns: 28px 40px 1fr 110px 90px; }
      .tags, .uptime { display: none; }
    }
    /* Mobile: drop the state pill column (the icon already carries the
       running/stopped color cue via the dot we add inside .icon below), keep
       the actions narrow. Reduces row to checkbox + icon + name/image +
       compact actions — the bare-minimum touchable layout. */
    @media (max-width: 540px) {
      .row {
        grid-template-columns: 24px 36px 1fr auto;
        gap: 8px;
        padding: 10px 10px;
      }
      .state-badge { display: none; }
      .icon { width: 36px; height: 36px; }
      /* The "more" kebab is enough on a phone — webui/restart/start can ride
         in the menu. Show only the kebab when space is tight. */
      .actions .icon-btn:not(:last-child) { display: none; }
      .menu { right: 0; min-width: 200px; }
    }
  `;

  @property({ type: Object }) container!: DockerContainerFull;
  @property({ type: Array })  tags: DockerTag[] = [];
  @property({ type: Array })  assignedTagIds: string[] = [];
  @property({ type: Boolean }) selected = false;
  @property({ type: Boolean }) menuOpen = false;
  @property({ type: Boolean }) showStats = false;

  private _portsText(): string {
    if (this.container.ports.length === 0) return '—';
    const first = this.container.ports[0];
    const host = first.host && first.host !== '0.0.0.0' ? first.host : '';
    const text = host ? `${host}:${first.hostPort}` : first.hostPort || '—';
    return this.container.ports.length > 1
      ? `${text} +${this.container.ports.length - 1}`
      : text;
  }

  private _emit(action: DockerRowActionDetail['action']): void {
    this.dispatchEvent(new CustomEvent<DockerRowActionDetail>('docker-action', {
      detail: { container: this.container.name, action },
      bubbles: true, composed: true,
    }));
    this.menuOpen = false;
  }

  private _toggleSelect(): void {
    this.dispatchEvent(new CustomEvent('docker-toggle-select', {
      detail: { container: this.container.name },
      bubbles: true, composed: true,
    }));
  }

  private _toggleMenu(e: Event): void {
    e.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Click-outside to close the action menu
    this._onDocClick = this._onDocClick.bind(this);
    document.addEventListener('click', this._onDocClick);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocClick);
  }
  private _onDocClick = (): void => { if (this.menuOpen) this.menuOpen = false; };

  private _renderTagChips() {
    if (this.assignedTagIds.length === 0) return nothing;
    return this.assignedTagIds.map((tid) => {
      const t = this.tags.find((x) => x.id === tid);
      if (!t) return nothing;
      // Inline color so per-tag colors render without a runtime stylesheet.
      const bg = hexToRgba(t.color, 0.15);
      return html`<span class="tag" style="background:${bg};color:${t.color}">${t.name}</span>`;
    });
  }

  render() {
    const c = this.container;
    const stateClass = `state-badge state-${c.state}`;
    const dotClass = c.state === 'started' ? 'dot dot-success'
                   : c.state === 'paused' ? 'dot dot-warning'
                   : c.state === 'stopped' ? 'dot dot-danger'
                   : 'dot dot-muted';

    return html`
      <div class="row" ?data-selected=${this.selected} ?data-stopped=${c.state === 'stopped'} ?data-update=${c.updateAvailable}>
        <input type="checkbox" .checked=${this.selected} @change=${() => this._toggleSelect()}>

        <span class="icon">
          ${c.iconUrl
            ? html`<img src=${c.iconUrl} alt="" @error=${this._iconError}>`
            : html`<span class="icon-fallback">${(c.name[0] ?? '?').toUpperCase()}</span>`}
        </span>

        <div class="main">
          <div class="name">${c.name}</div>
          <div class="image">${c.image}${c.updateAvailable ? html`<span class="badge-update">update</span>` : nothing}</div>
          ${this.showStats ? html`
            <div class="stats">
              ${c.state === 'started' || c.state === 'paused' ? html`
                <span class="stat"><strong>CPU</strong>${formatPercent(c.cpuPct)}</span>
                <span class="stat"><strong>RAM</strong>${formatBytes(c.memBytes)}</span>
              ` : nothing}
              <span class="stat"><strong>VDisk</strong>${formatBytes(c.vdiskBytes)}</span>
              ${c.macAddress ? html`<span class="stat mac"><strong>MAC</strong>${formatMac(c.macAddress)}</span>` : nothing}
            </div>
          ` : nothing}
        </div>

        <div class="tags">${this._renderTagChips()}</div>

        <div class="ports">${this._portsText()}</div>

        <div class="uptime">${c.uptime ?? '—'}</div>

        <span class=${stateClass}><span class=${dotClass}></span> ${c.state}</span>

        <div class="actions">
          ${c.webuiUrl ? html`
            <button class="icon-btn" title="Open WebUI" @click=${() => this._emit('webui')}>${icon('external')}</button>
          ` : nothing}
          ${c.state === 'started' ? html`
            <button class="icon-btn icon-btn-warn" title="Restart" @click=${() => this._emit('restart')}>${icon('restart')}</button>
          ` : html`
            <button class="icon-btn icon-btn-success" title="Start" @click=${() => this._emit('start')}>${icon('play')}</button>
          `}
          <button class="icon-btn" title="More" @click=${this._toggleMenu}>${icon('kebab')}</button>

          ${this.menuOpen ? html`
            <div class="menu" @click=${(e: Event) => e.stopPropagation()}>
              ${c.state === 'started' ? html`
                <button @click=${() => this._emit('stop')}>${icon('stop')} Stop</button>
                <button @click=${() => this._emit('pause')}>${icon('pause')} Pause</button>
              ` : c.state === 'paused' ? html`
                <button @click=${() => this._emit('resume')}>${icon('play')} Resume</button>
                <button @click=${() => this._emit('stop')}>${icon('stop')} Stop</button>
              ` : html`
                <button @click=${() => this._emit('start')}>${icon('play')} Start</button>
              `}
              <button @click=${() => this._emit('restart')}>${icon('restart')} Restart</button>
              <div class="divider"></div>
              <button @click=${() => this._emit('logs')}>${icon('logs')} Logs</button>
              <button @click=${() => this._emit('console')}>${icon('console')} Console</button>
              <button @click=${() => this._emit('edit')}>${icon('edit')} Edit</button>
              ${c.updateAvailable ? html`<button @click=${() => this._emit('update')}>${icon('update')} Check for update</button>` : nothing}
              <div class="divider"></div>
              <button class="danger" @click=${() => this._emit('remove')}>${icon('trash')} Remove</button>
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private _iconError(e: Event): void {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
  }
}

// Local helper — only here. Avoids pulling in a color util just for this.
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,140,47,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}
