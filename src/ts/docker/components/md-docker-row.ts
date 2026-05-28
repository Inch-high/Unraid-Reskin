import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { DockerContainerFull, DockerTag } from '../types';
import { icon } from '../icons';
import { formatBytes, formatPercent, formatMac } from '../format';

// Single container row. Stateless — the parent owns selection state and
// dispatches actions via the bubbling 'docker-action' / 'docker-toggle-select'
// custom events.

export interface DockerRowActionDetail {
  container: string;
  action: 'start' | 'stop' | 'restart' | 'pause' | 'resume' | 'remove' | 'update' | 'webui' | 'logs' | 'console' | 'edit' | 'autostart-on' | 'autostart-off';
}

@customElement('md-docker-row')
export class MdDockerRow extends LitElement {
  static styles = css`
    :host { display: contents; }
    .row {
      display: grid;
      grid-template-columns: 28px 40px minmax(220px, 1.4fr) minmax(140px, 1fr) minmax(120px, 0.8fr) 80px 110px 144px;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-top: 1px solid var(--border-subtle);
      transition: background var(--duration-fast, 120ms) var(--ease-out, cubic-bezier(0.2,0,0,1));
    }
    .row:hover { background: var(--bg-elevated); }
    .row[data-selected] { background: var(--mui-accent-muted); }
    .row[data-stopped] .name { color: var(--text-secondary); }
    /* Update available: 4px accent bar + warm tint across the row.
       Inset box-shadow (not border-left) so grid alignment stays put — a real
       border would shift every column 4px right on update rows only.
       Background is layered behind hover/selected via linear-gradient so all
       three visual states compose cleanly. */
    .row[data-update] {
      background: linear-gradient(90deg, rgba(255,140,47,.10) 0%, rgba(255,140,47,.04) 38%, transparent 100%);
      box-shadow: inset 4px 0 0 var(--mui-accent);
    }
    .row[data-update]:hover {
      background: linear-gradient(90deg, rgba(255,140,47,.14) 0%, rgba(255,140,47,.06) 38%, var(--bg-elevated) 100%);
    }
    /* Updating: blue info accent bar + subtle pulsing tint so the in-flight
       row reads as distinct from "update is available but not started yet". */
    .row[data-updating] {
      background: linear-gradient(90deg, rgba(59,130,246,.10) 0%, rgba(59,130,246,.04) 38%, transparent 100%);
      box-shadow: inset 4px 0 0 var(--info);
      animation: md-docker-row-pulse 1.6s ease-in-out infinite;
    }
    .row[data-updating]:hover {
      background: linear-gradient(90deg, rgba(59,130,246,.14) 0%, rgba(59,130,246,.06) 38%, var(--bg-elevated) 100%);
    }
    @keyframes md-docker-row-pulse {
      0%, 100% { box-shadow: inset 4px 0 0 var(--info); }
      50%      { box-shadow: inset 4px 0 0 rgba(59,130,246,.55); }
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
    /* "Update available" inline pill — sits beside the image text. Uses the
       brand accent (orange) so it visually ties to the row's left bar; the
       small icon helps the user spot it without reading the text. */
    .badge-update {
      display: inline-flex; align-items: center; gap: 4px;
      font: 600 10px var(--font-sans);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--mui-accent);
      background: var(--mui-accent-muted);
      border: 1px solid rgba(255,140,47,.4);
      padding: 1px 7px 1px 5px;
      border-radius: var(--radius-full);
      margin-left: 6px;
      vertical-align: middle;
    }
    .badge-update svg { width: 11px; height: 11px; }
    /* "Updating…" inline pill — replaces the update-available badge while the
       update is in flight. Spinner conveys progress; info color reuses the
       row's blue accent so the pill matches the left bar. */
    .badge-updating {
      display: inline-flex; align-items: center; gap: 5px;
      font: 600 10px var(--font-sans);
      letter-spacing: 0.04em;
      color: var(--info);
      background: rgba(59,130,246,.15);
      border: 1px solid rgba(59,130,246,.4);
      padding: 1px 8px 1px 6px;
      border-radius: var(--radius-full);
      margin-left: 6px;
      vertical-align: middle;
    }
    .badge-updating .sp {
      width: 10px; height: 10px;
      border: 1.5px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: md-docker-row-sp 0.7s linear infinite;
    }
    @keyframes md-docker-row-sp { to { transform: rotate(360deg); } }

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
    /* In-flight update — uses --info to match the row's pulse accent. The
       spinner takes the place of the colored dot used by other states. */
    .state-updating { background: rgba(59,130,246,.18); color: var(--info); }
    /* "Starting" optimistic state — green-tinted with a spinner. Matches the
       success palette so it reads as "almost there" rather than a problem. */
    .state-starting { background: rgba(34,197,94,.15); color: var(--success); }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-success { background: var(--success); }
    .dot-danger  { background: var(--danger); }
    .dot-warning { background: var(--warning); }
    .dot-muted   { background: var(--text-muted); }
    .state-badge .sp {
      width: 10px; height: 10px;
      border: 1.5px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: md-docker-row-sp 0.7s linear infinite;
      flex-shrink: 0;
    }

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
    /* Autostart pin: filled accent when enabled, muted outline when disabled.
       Click toggles. Title/tooltip clarifies the on/off state for users who
       don't recognize the icon. */
    .pin-btn[data-on] { color: var(--mui-accent); }
    .pin-btn:not([data-on]) { color: var(--text-muted); }
    .pin-btn:hover { color: var(--mui-accent); border-color: rgba(255,140,47,.4); }
    .icon-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .icon-btn:disabled:hover { background: transparent; color: var(--text-secondary); border-color: transparent; }

    /* Action menu popover. position:fixed (rather than absolute) lets the
       menu escape the folder section's overflow:hidden clipping — without
       this, opening the menu on the last row of a folder would crop it. We
       compute viewport coordinates from the kebab button's bounding rect in
       _toggleMenu and flip upward when there isn't room below. */
    .menu {
      position: fixed;
      min-width: 180px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 4px;
      z-index: 50;
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
    .menu button:disabled { opacity: 0.45; cursor: not-allowed; }
    .menu button:disabled:hover { background: transparent; color: var(--text-secondary); }
    .menu .divider { height: 1px; background: var(--border-subtle); margin: 4px 0; }

    @media (max-width: 1100px) {
      .row { grid-template-columns: 28px 40px 1.5fr 1fr 80px 110px 144px; }
      .ports { display: none; }
    }
    @media (max-width: 860px) {
      .row { grid-template-columns: 28px 40px 1fr 110px 120px; }
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
      .menu { min-width: 200px; }
    }
  `;

  @property({ type: Object }) container!: DockerContainerFull;
  @property({ type: Array })  tags: DockerTag[] = [];
  @property({ type: Array })  assignedTagIds: string[] = [];
  @property({ type: Boolean }) selected = false;
  @property({ type: Boolean }) menuOpen = false;
  @property({ type: Boolean }) showStats = false;
  // True while the container is being updated (image pulled + recreated).
  // Owned by the page (DockerStore.updating set); the row only renders the UI.
  @property({ type: Boolean }) updating = false;
  // True while the container is in the brief "starting" optimistic window:
  // user clicked Start/Restart, or boot-time autostart is in flight. Cleared
  // when the next snapshot confirms started/paused. Owned by the page.
  @property({ type: Boolean }) starting = false;
  // Viewport coordinates for the menu popover. Recomputed on every open from
  // the kebab button's bounding rect; null when the menu is closed. The menu
  // anchors to the right edge of the button and opens downward by default,
  // flipping above the button when there isn't 240px of space below.
  @state() private _menuStyle: { top: string; right: string } | null = null;

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
    if (this.menuOpen) {
      this._closeMenu();
      return;
    }
    // Compute viewport coordinates from the kebab's bounding rect. Right-anchor
    // to keep the menu's right edge aligned with the button. Flip upward when
    // there isn't enough space below — 240px covers the longest case (8
    // entries + dividers).
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const MENU_HEIGHT_ESTIMATE = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const right = Math.max(8, window.innerWidth - rect.right);
    const top = spaceBelow >= MENU_HEIGHT_ESTIMATE
      ? rect.bottom + 4
      : Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - 4);
    this._menuStyle = { top: `${top}px`, right: `${right}px` };
    this.menuOpen = true;
    // Only attach window scroll/resize listeners while the menu is actually
    // open — avoids carrying 30+ noop listeners on a 30-container page (one
    // per row instance).
    window.addEventListener('scroll', this._closeMenu, { capture: true, passive: true });
    window.addEventListener('resize', this._closeMenu);
  }

  // Close on layout-disturbing events. Without the scroll/resize teardown the
  // fixed-position menu would stay glued in place while the underlying row
  // scrolled away.
  private _closeMenu = (): void => {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this._menuStyle = null;
    window.removeEventListener('scroll', this._closeMenu, { capture: true } as EventListenerOptions);
    window.removeEventListener('resize', this._closeMenu);
  };

  connectedCallback(): void {
    super.connectedCallback();
    // Click-outside to close the action menu
    document.addEventListener('click', this._onDocClick);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocClick);
    // Defensive: if a row is removed while its menu is open, tear down the
    // window listeners we attached in _toggleMenu.
    if (this.menuOpen) this._closeMenu();
  }
  private _onDocClick = (): void => {
    if (!this.menuOpen) return;
    this._closeMenu();
  };

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
    // Precedence: updating > starting > actual state. Updating wins because
    // the container is being torn down + recreated. Starting wins next because
    // the snapshot's "stopped" reading is stale (rc.docker hasn't reached this
    // container yet, or the user just clicked Start).
    const stateClass = this.updating
      ? 'state-badge state-updating'
      : this.starting
        ? 'state-badge state-starting'
        : `state-badge state-${c.state}`;
    const dotClass = c.state === 'started' ? 'dot dot-success'
                   : c.state === 'paused' ? 'dot dot-warning'
                   : c.state === 'stopped' ? 'dot dot-danger'
                   : 'dot dot-muted';
    // Hide the "update available" affordance while the update is mid-flight —
    // it just answered the user's question, so showing it again is noise.
    const showUpdateBadge = c.updateAvailable && !this.updating;
    const autostartLabel = c.autostart
      ? 'Disable start on boot (autostart enabled)'
      : 'Enable start on boot (autostart disabled)';

    return html`
      <div class="row"
           ?data-selected=${this.selected}
           ?data-stopped=${c.state === 'stopped'}
           ?data-update=${showUpdateBadge}
           ?data-updating=${this.updating}>
        <input type="checkbox" .checked=${this.selected} @change=${() => this._toggleSelect()}>

        <span class="icon">
          ${c.iconUrl
            ? html`<img src=${c.iconUrl} alt="" @error=${this._iconError}>`
            : html`<span class="icon-fallback">${(c.name[0] ?? '?').toUpperCase()}</span>`}
        </span>

        <div class="main">
          <div class="name">${c.name}</div>
          <div class="image">${c.image}
            ${this.updating
              ? html`<span class="badge-updating" title="Image pull + container recreate in progress"><span class="sp"></span>Updating…</span>`
              : showUpdateBadge
                ? html`<span class="badge-update" title="A newer image is available — click ⋮ → Update to apply">${icon('update', 11)}Update available</span>`
                : nothing}
          </div>
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

        ${this.updating
          ? html`<span class=${stateClass}><span class="sp"></span> Updating</span>`
          : this.starting
            ? html`<span class=${stateClass}><span class="sp"></span> Starting</span>`
            : html`<span class=${stateClass}><span class=${dotClass}></span> ${c.state}</span>`}

        <div class="actions">
          <button class="icon-btn pin-btn"
                  title=${autostartLabel}
                  ?data-on=${c.autostart}
                  ?disabled=${this.updating}
                  @click=${() => this._emit(c.autostart ? 'autostart-off' : 'autostart-on')}>${icon('power')}</button>
          ${c.webuiUrl ? html`
            <button class="icon-btn" title="Open WebUI" ?disabled=${this.updating} @click=${() => this._emit('webui')}>${icon('external')}</button>
          ` : nothing}
          ${c.state === 'started' ? html`
            <button class="icon-btn icon-btn-warn" title=${this.updating ? 'Update in progress' : 'Restart'} ?disabled=${this.updating || this.starting} @click=${() => this._emit('restart')}>${icon('restart')}</button>
          ` : html`
            <button class="icon-btn icon-btn-success" title=${this.updating ? 'Update in progress' : this.starting ? 'Starting…' : 'Start'} ?disabled=${this.updating || this.starting} @click=${() => this._emit('start')}>${icon('play')}</button>
          `}
          <button class="icon-btn" title="More" @click=${this._toggleMenu}>${icon('kebab')}</button>

          ${this.menuOpen ? html`
            <div class="menu"
                 style=${styleMap(this._menuStyle ?? {})}
                 @click=${(e: Event) => e.stopPropagation()}>
              ${c.state === 'started' ? html`
                <button ?disabled=${this.updating} @click=${() => this._emit('stop')}>${icon('stop')} Stop</button>
                <button ?disabled=${this.updating} @click=${() => this._emit('pause')}>${icon('pause')} Pause</button>
              ` : c.state === 'paused' ? html`
                <button ?disabled=${this.updating || this.starting} @click=${() => this._emit('resume')}>${icon('play')} Resume</button>
                <button ?disabled=${this.updating} @click=${() => this._emit('stop')}>${icon('stop')} Stop</button>
              ` : html`
                <button ?disabled=${this.updating || this.starting} @click=${() => this._emit('start')}>${icon('play')} Start</button>
              `}
              <button ?disabled=${this.updating || this.starting} @click=${() => this._emit('restart')}>${icon('restart')} Restart</button>
              <div class="divider"></div>
              <button @click=${() => this._emit('logs')}>${icon('logs')} Logs</button>
              <button @click=${() => this._emit('console')}>${icon('console')} Console</button>
              <button @click=${() => this._emit('edit')}>${icon('edit')} Edit</button>
              ${c.updateAvailable && !this.updating ? html`<button @click=${() => this._emit('update')}>${icon('update')} Update now</button>` : nothing}
              <div class="divider"></div>
              <button @click=${() => this._emit(c.autostart ? 'autostart-off' : 'autostart-on')}>${icon('power')} ${c.autostart ? 'Disable start on boot' : 'Enable start on boot'}</button>
              <div class="divider"></div>
              <button class="danger" ?disabled=${this.updating} @click=${() => this._emit('remove')}>${icon('trash')} Remove</button>
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
