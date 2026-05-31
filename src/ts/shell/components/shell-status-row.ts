import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../icons';

@customElement('shell-status-row')
export class ShellStatusRow extends LitElement {
  static styles = css`
    :host { display: block; position: relative; }
    .row {
      display: flex; align-items: center; gap: 8px;
      width: 100%; box-sizing: border-box;
      padding: 6px 16px;
      background: transparent; color: var(--text-primary); border: 0;
      cursor: pointer; font: inherit; text-align: left;
    }
    .row:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: var(--dot-color, var(--text-secondary));
    }
    .status-icon {
      width: 16px; height: 16px;
      flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--dot-color, var(--text-secondary));
    }
    :host-context(body.modernui-shell-collapsed) .row {
      justify-content: center;
      padding: 8px 0;
    }
    :host-context(body.modernui-shell-collapsed) .status-icon {
      width: 20px; height: 20px;
    }
    .label {
      flex: 1; min-width: 0; font-size: 12px; color: var(--text-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .value {
      font-size: 12px; color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 50%;
    }
    .popover {
      position: absolute; left: calc(100% + 8px); bottom: 0;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      min-width: 200px; padding: 12px; font-size: 12px;
      display: none; z-index: 100;
    }
    :host([open]) .popover { display: block; }
    :host-context(body.modernui-shell-collapsed) .label,
    :host-context(body.modernui-shell-collapsed) .value { display: none; }

    /* Skeleton shimmer for rows still being populated by Unraid's plugin
       injection. Keeps the same layout (icon+label+value lanes) so when the
       real row replaces the skeleton, nothing shifts. */
    .sk {
      background: linear-gradient(90deg, var(--bg-elev-1, rgba(255,255,255,0.04)) 0%, var(--border-subtle, rgba(255,255,255,0.12)) 50%, var(--bg-elev-1, rgba(255,255,255,0.04)) 100%);
      background-size: 200% 100%;
      border-radius: 3px;
      animation: status-shimmer 1.2s ease-in-out infinite;
    }
    .sk-dot   { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .sk-label { flex: 1; height: 10px; max-width: 80px; }
    .sk-value { height: 10px; width: 36px; }
    :host-context(body.modernui-shell-collapsed) .sk-label,
    :host-context(body.modernui-shell-collapsed) .sk-value { display: none; }
    @keyframes status-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;

  @property({ type: String }) label = '';
  @property({ type: String }) value = '';
  @property({ type: String, attribute: 'dot-color' }) dotColor = '';
  @property({ type: String, attribute: 'icon-name' }) iconName = '';
  @property({ type: String }) detail = '';
  @property({ type: String, attribute: 'settings-url' }) settingsUrl = '';
  /** Renders a shimmering skeleton row instead of label/value. Used while
   *  the source plugin is still being injected into the bottom bar. */
  @property({ type: Boolean }) loading = false;
  @state() private _open = false;

  private _toggle = (e: MouseEvent): void => {
    e.stopPropagation();
    this._open = !this._open;
    this.toggleAttribute('open', this._open);
  };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onOutside);
  }

  private _onOutside = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node) && !this.shadowRoot?.contains(e.target as Node)) {
      this._open = false;
      this.removeAttribute('open');
    }
  };

  render() {
    if (this.loading) {
      return html`
        <div class="row" aria-busy="true" aria-label="Loading status">
          <span class="sk sk-dot"></span>
          <span class="sk sk-label"></span>
          <span class="sk sk-value"></span>
        </div>
      `;
    }
    return html`
      <button class="row" type="button" @click=${this._toggle} style=${`--dot-color: ${this.dotColor || 'currentColor'}`}>
        ${
          this.iconName
            ? html`<span class="status-icon">${icon(this.iconName, 16)}</span>`
            : html`<span class="dot"></span>`
        }
        <span class="label">${this.label}</span>
        <span class="value">${this.value}</span>
      </button>
      <div class="popover">
        <div>${this.detail || this.label}</div>
        ${this.settingsUrl ? html`<p style="margin:8px 0 0 0;"><a href=${this.settingsUrl}>Settings</a></p>` : ''}
      </div>
    `;
  }
}
