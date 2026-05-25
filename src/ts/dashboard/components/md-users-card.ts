import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UsersState, UserRow } from '../types';
import './md-card';

@customElement('md-users-card')
export class MdUsersCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .empty { color: var(--text-muted); font-size: 13px; }
    .user-list { display: grid; gap: 6px; }
    .row {
      display: grid;
      grid-template-columns: 2fr 3fr 0.7fr 0.7fr;
      gap: 8px;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
    }
    .row:last-child { border-bottom: none; }
    .row.head {
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .name { color: var(--accent); font-weight: 500; }
    .desc {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge {
      justify-self: end;
      min-width: 28px;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      background: var(--bg-base);
      color: var(--text-primary);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .badge.empty-cell {
      background: transparent;
      color: var(--text-muted);
    }
  `;

  @property({ type: Object }) state: UsersState = {
    kind: 'users', users: [], totalCount: 0, unprotectedCount: 0,
  };

  private _badge(value: number | null) {
    if (value === null) return html`<span class="badge empty-cell">—</span>`;
    return html`<span class="badge">${value}</span>`;
  }

  private _renderRow(u: UserRow) {
    return html`
      <div class="row">
        <span class="name">${u.name}</span>
        <span class="desc">${u.description ? u.description : html`<span style="color: var(--text-muted)">—</span>`}</span>
        ${this._badge(u.writeCount)}
        ${this._badge(u.readCount)}
      </div>
    `;
  }

  render() {
    const { users, totalCount, unprotectedCount } = this.state;
    const meta = totalCount === 0
      ? ''
      : unprotectedCount === 0
        ? `${totalCount}`
        : `${totalCount} · ${unprotectedCount} unprotected`;

    return html`
      <md-card cardTitle="Users" meta=${meta}>
        ${users.length === 0
          ? html`<div class="empty">No users configured</div>`
          : html`
            <div class="user-list">
              <div class="row head">
                <span>Name</span>
                <span>Description</span>
                <span style="justify-self: end">Write</span>
                <span style="justify-self: end">Read</span>
              </div>
              ${users.map((u) => this._renderRow(u))}
            </div>
          `}
      </md-card>
    `;
  }
}
