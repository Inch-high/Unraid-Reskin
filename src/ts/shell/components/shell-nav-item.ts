import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { NavItem } from '../nav-builder';

@customElement('shell-nav-item')
export class ShellNavItem extends LitElement {
  static styles = css`
    :host { display: block; }
    a, button {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      color: var(--text-primary);
      text-decoration: none;
      font-size: 14px;
      width: 100%;
      box-sizing: border-box;
      background: transparent;
      border: 0;
      border-left: 3px solid transparent;
      cursor: pointer;
      text-align: left;
      font: inherit;
    }
    a:hover, button:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    :host([active]) a, :host([active]) > button {
      border-left-color: var(--accent, #ff8c2f);
      color: var(--text-primary);
      font-weight: 600;
    }
    .icon {
      width: 18px; height: 18px; flex-shrink: 0;
      background: currentColor;
      mask-size: contain; -webkit-mask-size: contain;
      opacity: 0.7;
    }
    .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chevron { font-size: 10px; opacity: 0.6; transition: transform 120ms; }
    :host([expanded]) .chevron { transform: rotate(90deg); }
    .children { padding-left: 20px; }
    :host([active][child]) a { font-weight: 500; }
  `;

  @property({ attribute: false }) item!: NavItem;
  @property({ type: String, attribute: 'current-path' }) currentPath = '/';
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true }) expanded = false;

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('item') || changed.has('currentPath')) {
      this.active = this._isActive(this.item, this.currentPath);
      // Auto-expand a group whose child matches the current path.
      if (this.item.children?.some((c) => c.url === this.currentPath)) {
        this.expanded = true;
      }
    }
  }

  private _isActive(item: NavItem, path: string): boolean {
    if (item.url && item.url === path) return true;
    if (item.children) return item.children.some((c) => c.url === path);
    return false;
  }

  private _toggle(): void {
    this.expanded = !this.expanded;
  }

  render() {
    const { item } = this;
    if (item.children && item.children.length > 0) {
      return html`
        <button type="button" @click=${this._toggle}>
          <span class="label">${item.label}</span>
          <span class="chevron">▶</span>
        </button>
        ${this.expanded ? html`
          <div class="children">
            ${item.children.map((c) => html`
              <shell-nav-item child .item=${c} current-path=${this.currentPath}></shell-nav-item>
            `)}
          </div>
        ` : ''}
      `;
    }
    return html`
      <a href=${item.url || '#'}>
        <span class="label">${item.label}</span>
      </a>
    `;
  }
}
