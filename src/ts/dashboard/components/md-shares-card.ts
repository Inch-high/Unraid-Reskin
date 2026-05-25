import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ShareSecurity, SharesState } from '../types';
import './md-card';

function securityPill(s: ShareSecurity) {
  const map: Record<ShareSecurity, { text: string; color: string }> = {
    public:  { text: 'Public',  color: 'var(--success)' },
    private: { text: 'Private', color: 'var(--danger)' },
    secure:  { text: 'Secure',  color: 'var(--warning)' },
    hidden:  { text: 'Hidden',  color: 'var(--text-muted)' },
  };
  const { text, color } = map[s];
  return html`<span style="
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    background: ${color}26; color: ${color};
  ">${text}</span>`;
}

@customElement('md-shares-card')
export class MdSharesCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .head, .row {
      display: grid;
      grid-template-columns: 2fr 3fr 1fr 0.5fr;
      gap: 8px;
      align-items: center;
    }
    .head {
      padding: 4px 0 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-subtle);
    }
    .row {
      padding: 6px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
    }
    .row:last-child { border-bottom: none; }
    .name { color: var(--mui-accent); font-weight: 500; }
    .desc { color: var(--text-secondary); }
    .streams {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }
  `;

  @property({ type: Object }) state: SharesState = {
    kind: 'shares',
    shares: [],
    totalCount: 0,
    publicSmbCount: 0,
    publicNfsCount: 0,
  };

  render() {
    const { shares, totalCount, publicSmbCount, publicNfsCount } = this.state;
    const meta = totalCount === 0
      ? ''
      : `${totalCount} · ${publicSmbCount + publicNfsCount} public`;

    return html`
      <md-card cardTitle="Shares" meta=${meta}>
        <div class="head">
          <span>Name</span>
          <span>Description</span>
          <span>Security</span>
          <span class="streams">Streams</span>
        </div>
        ${shares.map((s) => html`
          <div class="row">
            <span class="name">${s.name}</span>
            <span class="desc">${s.description === '' ? '—' : s.description}</span>
            <span>${securityPill(s.security)}</span>
            <span class="streams">${s.streams ?? '—'}</span>
          </div>
        `)}
      </md-card>
    `;
  }
}
