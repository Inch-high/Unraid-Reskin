import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './shell-sidebar';
import './shell-topbar';

@customElement('modernui-shell')
export class ModernuiShell extends LitElement {
  @property({ type: Boolean, reflect: true }) collapsed = false;
  @property({ type: Boolean, reflect: true, attribute: 'drawer-open' }) drawerOpen = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('shell-collapsed-changed', (e: Event) => {
      this.collapsed = (e as CustomEvent<{ collapsed: boolean }>).detail.collapsed;
    });
  }

  private _toggleDrawer = (): void => {
    this.drawerOpen = !this.drawerOpen;
  };

  private _closeDrawer = (): void => {
    this.drawerOpen = false;
  };

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: 100vw;
      pointer-events: none;
      z-index: 1000;
      font-family: var(--font-sans);
      color: var(--text-primary);
    }
    .sidebar {
      pointer-events: auto;
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: var(--shell-sidebar-width);
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      box-sizing: border-box;
      transition: width 180ms cubic-bezier(0.2, 0, 0, 1);
    }
    .topbar {
      pointer-events: auto;
      position: absolute;
      top: 0;
      left: var(--shell-sidebar-width);
      right: 0;
      height: var(--shell-topbar-height);
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      box-sizing: border-box;
      transition: left 180ms cubic-bezier(0.2, 0, 0, 1);
    }
    :host([collapsed]) .sidebar { width: var(--shell-sidebar-width-collapsed); }
    :host([collapsed]) .topbar { left: var(--shell-sidebar-width-collapsed); }
    @media (max-width: 959px) {
      .sidebar {
        transform: translateX(-100%);
        transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
      }
      :host([drawer-open]) .sidebar {
        transform: translateX(0);
        box-shadow: 0 0 24px rgba(0,0,0,0.4);
      }
      .topbar { left: 0; }
      .scrim {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.4);
        pointer-events: auto;
        display: none;
      }
      :host([drawer-open]) .scrim { display: block; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sidebar, .topbar { transition: none; }
    }
  `;

  render() {
    return html`
      <div class="scrim" @click=${this._closeDrawer}></div>
      <div class="sidebar"><shell-sidebar></shell-sidebar></div>
      <div class="topbar"><shell-topbar @shell-toggle-drawer=${this._toggleDrawer}></shell-topbar></div>
    `;
  }
}
