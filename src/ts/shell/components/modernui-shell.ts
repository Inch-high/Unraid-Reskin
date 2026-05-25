import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './shell-sidebar';
import './shell-topbar';

@customElement('modernui-shell')
export class ModernuiShell extends LitElement {
  @property({ type: Boolean, reflect: true }) collapsed = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('shell-collapsed-changed', (e: Event) => {
      this.collapsed = (e as CustomEvent<{ collapsed: boolean }>).detail.collapsed;
    });
  }

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
    }
    :host([collapsed]) .sidebar { width: var(--shell-sidebar-width-collapsed); }
    :host([collapsed]) .topbar { left: var(--shell-sidebar-width-collapsed); }
  `;

  render() {
    return html`
      <div class="sidebar"><shell-sidebar></shell-sidebar></div>
      <div class="topbar"><shell-topbar></shell-topbar></div>
    `;
  }
}
