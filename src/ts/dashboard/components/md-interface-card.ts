import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { InterfaceState } from '../types';
import './md-card';

@customElement('md-interface-card')
export class MdInterfaceCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .traffic {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 16px;
      margin-bottom: 16px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat .label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat .val {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .arrow-in { color: var(--success); }
    .arrow-out { color: var(--mui-accent); }
    .iface-list {
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--border-subtle);
    }
    .iface-row {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 12px;
      border-radius: var(--radius-sm);
      transition: background 120ms cubic-bezier(0.2, 0, 0, 1);
    }
    .iface-row:last-child { border-bottom: none; }
    .iface-row:hover { background: var(--bg-elevated); }
    .iface-name {
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .iface-main {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .iface-main.empty {
      color: var(--text-muted);
      font-style: italic;
    }
  `;

  @property({ type: Object }) state: InterfaceState = {
    kind: 'interface',
    interfaces: [],
    selectedName: '',
    inboundText: '',
    outboundText: '',
  };

  render() {
    const s = this.state;
    const meta = s.selectedName;
    return html`
      <!-- Pull Unraid's Font Awesome ::before glyph rules into this shadow
           root. FontAwesome font itself is loaded at document level, but the
           .fa-arrow-down::before { content } rule is document-scoped and
           does not cross the shadow boundary. -->
      <link rel="stylesheet" href="/webGui/styles/font-awesome.css">
      <md-card cardTitle="Network" meta=${meta}>
        <div class="traffic">
          <div class="stat">
            <span class="label">
              <i class="fa fa-arrow-down arrow-in"></i>
              Inbound
            </span>
            <span class="val">${s.inboundText || '—'}</span>
          </div>
          <div class="stat">
            <span class="label">
              <i class="fa fa-arrow-up arrow-out"></i>
              Outbound
            </span>
            <span class="val">${s.outboundText || '—'}</span>
          </div>
        </div>
        <div class="iface-list">
          ${s.interfaces.map((iface) => html`
            <div class="iface-row">
              <span class="iface-name">${iface.name}</span>
              <span class="iface-main ${iface.mainText ? '' : 'empty'}">${iface.mainText || '—'}</span>
            </div>
          `)}
        </div>
      </md-card>
    `;
  }
}
