import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { NavItem } from '../nav-builder';
import { icon } from '../icons';

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
      border-left-color: var(--mui-accent, #ff8c2f);
      color: var(--text-primary);
      font-weight: 600;
    }
    .icon {
      width: 18px; height: 18px; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--text-secondary);
    }
    :host([active]) .icon { color: var(--mui-accent, #ff8c2f); }
    .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chevron {
      width: 16px; height: 16px;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--text-secondary);
      transition: transform 120ms;
    }
    :host([expanded]) .chevron { transform: rotate(90deg); }
    .children { padding-left: 20px; }
    :host([active][child]) a { font-weight: 500; }
    :host-context(body.modernui-shell-collapsed) .label,
    :host-context(body.modernui-shell-collapsed) .chevron,
    :host-context(body.modernui-shell-collapsed) .children {
      display: none;
    }
    :host-context(body.modernui-shell-collapsed) a,
    :host-context(body.modernui-shell-collapsed) > button {
      justify-content: center;
      padding: 10px 0;
    }
  `;

  @property({ attribute: false }) item!: NavItem;
  @property({ type: String, attribute: 'current-path' }) currentPath = '/';
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true }) expanded = false;

  willUpdate(changed: Map<string, unknown>): void {
    if (!this.item) return;
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
    // In collapsed mode the children dropdown is display:none, so a plain
    // expand-toggle gives the user no feedback - the click looks broken.
    // Navigate to the group's primary destination instead (first child with
    // a URL — e.g. Storage → /Main).
    const collapsed = document.body.classList.contains('modernui-shell-collapsed');
    if (collapsed && this.item.children) {
      const dest = this.item.children.find((c) => c.url)?.url;
      if (dest) {
        window.location.href = dest;
        return;
      }
    }
    this.expanded = !this.expanded;
  }

  render() {
    const { item } = this;
    // Nested child items (under Storage / Other) don't repeat the parent's icon —
    // the indent already communicates the relationship.
    const iconName = this.hasAttribute('child') ? '' : (item.icon || '');
    const iconEl = iconName ? html`<span class="icon">${icon(iconName)}</span>` : '';
    if (item.children && item.children.length > 0) {
      return html`
        <button type="button" title=${item.label} @click=${this._toggle}>
          ${iconEl}
          <span class="label">${item.label}</span>
          <span class="chevron">${icon('chevron-right', 14)}</span>
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
      <a href=${item.url || '#'} title=${item.label}>
        ${iconEl}
        <span class="label">${item.label}</span>
      </a>
    `;
  }
}
