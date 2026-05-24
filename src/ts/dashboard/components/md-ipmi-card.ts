import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { IpmiState, IpmiSensor } from '../types';
import './md-card';

function orbColor(s: IpmiSensor['status']): string {
  switch (s) {
    case 'green':  return 'var(--success)';
    case 'yellow': return 'var(--warning)';
    case 'red':    return 'var(--danger)';
    case 'blue':   return 'var(--info)';
    default:       return 'var(--text-muted)';
  }
}

@customElement('md-ipmi-card')
export class MdIpmiCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .group-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      margin: 12px 0 6px;
    }
    .group-label:first-of-type { margin-top: 0; }
    .sensor {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sensor:last-child { border-bottom: none; }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .name { color: var(--text-secondary); }
    .reading {
      color: var(--text-primary);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .empty {
      padding: 12px 0;
      color: var(--text-muted);
      font-size: 13px;
      font-style: italic;
    }
  `;

  @property({ type: Object }) state: IpmiState = { kind: 'ipmi', sensors: [] };

  render() {
    const { sensors } = this.state;
    if (sensors.length === 0) {
      return html`
        <md-card cardTitle="IPMI" meta="0 sensors">
          <div class="empty">No IPMI sensors configured.</div>
        </md-card>
      `;
    }

    const groups: Array<['temperature' | 'fan' | 'voltage' | 'other', string]> = [
      ['temperature', 'Temperatures'],
      ['fan', 'Fans'],
      ['voltage', 'Voltages'],
      ['other', 'Other'],
    ];

    return html`
      <md-card cardTitle="IPMI" meta="${sensors.length} sensor${sensors.length === 1 ? '' : 's'}">
        ${groups.map(([group, label]) => {
          const items = sensors.filter((s) => s.group === group);
          if (items.length === 0) return '';
          return html`
            <div class="group-label">${label}</div>
            ${items.map((s) => html`
              <div class="sensor">
                <span class="dot" style="background: ${orbColor(s.status)}"></span>
                <span class="name">${s.name}</span>
                <span class="reading">${s.reading}</span>
              </div>
            `)}
          `;
        })}
      </md-card>
    `;
  }
}
