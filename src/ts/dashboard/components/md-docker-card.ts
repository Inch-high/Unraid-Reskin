import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { DockerState, DockerContainer } from '../types';
import './md-card';

type Filter = 'all' | 'running' | 'stopped';

function stateColor(s: DockerContainer['state']): string {
  if (s === 'started') return 'var(--success)';
  if (s === 'stopped') return 'var(--danger)';
  if (s === 'paused')  return 'var(--warning)';
  return 'var(--text-muted)';
}

@customElement('md-docker-card')
export class MdDockerCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .filters {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    .chip {
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--bg-elevated);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 120ms cubic-bezier(0.2, 0, 0, 1),
                  color 120ms cubic-bezier(0.2, 0, 0, 1),
                  border-color 120ms cubic-bezier(0.2, 0, 0, 1);
    }
    .chip:hover { color: var(--text-primary); }
    .chip[data-active] {
      background: var(--mui-accent-muted);
      color: var(--mui-accent);
      border-color: var(--mui-accent);
    }
    .folder-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      margin: 16px 0 8px;
      display: flex;
      justify-content: space-between;
    }
    .folder-label:first-of-type { margin-top: 0; }
    .container-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }
    .container-tile {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      font-size: 12px;
      color: var(--text-primary);
      transition: border-color 120ms cubic-bezier(0.2, 0, 0, 1);
      overflow: hidden;
    }
    .container-tile:hover { border-color: var(--mui-accent); }
    .container-tile img {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-xs);
      flex-shrink: 0;
    }
    .container-tile .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .container-tile .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .summary {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }
    .summary .total {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .summary .total .big {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .summary .total .small {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .summary .counts {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .summary .counts .count {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
    }
    .summary .counts .count .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .summary .counts .count .num {
      color: var(--text-primary);
      font-weight: 600;
    }
    .summary-bar {
      display: flex;
      height: 6px;
      background: var(--border-default);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .summary-bar > span {
      display: block;
      height: 100%;
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
    }
    .summary-bar > span.started { background: var(--success); }
    .summary-bar > span.stopped { background: var(--danger); }
    .summary-bar > span.paused  { background: var(--warning); }
    .summary-bar > span.unknown { background: var(--text-muted); }
  `;

  @property({ type: Object }) state: DockerState = {
    kind: 'docker', folders: [], ungrouped: [], totalRunning: 0, totalCount: 0,
  };

  @state() private _filter: Filter = 'all';

  private _filtered(containers: DockerContainer[]): DockerContainer[] {
    if (this._filter === 'all') return containers;
    if (this._filter === 'running') return containers.filter((c) => c.state === 'started');
    return containers.filter((c) => c.state === 'stopped' || c.state === 'paused');
  }

  private _renderTile(c: DockerContainer) {
    return html`
      <div class="container-tile">
        ${c.imgUrl
          ? html`<img src="${c.imgUrl}" alt="">`
          : html`<span style="width:24px;height:24px;background:var(--bg-elevated);border-radius:var(--radius-xs)"></span>`}
        <span class="name">${c.name}</span>
        <span class="dot" style="background: ${stateColor(c.state)}"></span>
      </div>
    `;
  }

  render() {
    const { folders, ungrouped, totalRunning, totalCount } = this.state;

    // Derive the four state counts from folders + ungrouped. totalRunning
    // already exists on DockerState; the others we count here so we don't
    // touch the extractor's state shape.
    const allContainers = [...ungrouped, ...folders.flatMap((f) => f.containers)];
    const stopped = allContainers.filter((c) => c.state === 'stopped').length;
    const paused  = allContainers.filter((c) => c.state === 'paused').length;
    const unknown = allContainers.filter((c) => c.state === 'unknown').length;

    const meta = totalCount > 0 ? `${totalRunning} / ${totalCount} running` : '';

    return html`
      <md-card cardTitle="Docker Containers" meta=${meta}>
        ${totalCount > 0 ? html`
          <div class="summary">
            <div class="total">
              <span class="big">${totalCount}</span>
              <span class="small">container${totalCount === 1 ? '' : 's'}</span>
            </div>
            <div class="counts">
              <span class="count">
                <span class="dot" style="background: var(--success)"></span>
                <span class="num">${totalRunning}</span> started
              </span>
              <span class="count">
                <span class="dot" style="background: var(--danger)"></span>
                <span class="num">${stopped}</span> stopped
              </span>
              <span class="count">
                <span class="dot" style="background: var(--warning)"></span>
                <span class="num">${paused}</span> paused
              </span>
              ${unknown > 0 ? html`
                <span class="count">
                  <span class="dot" style="background: var(--text-muted)"></span>
                  <span class="num">${unknown}</span> unknown
                </span>
              ` : ''}
            </div>
            <div class="summary-bar">
              <span class="started" style="width: ${(totalRunning / totalCount) * 100}%"></span>
              <span class="stopped" style="width: ${(stopped / totalCount) * 100}%"></span>
              <span class="paused"  style="width: ${(paused  / totalCount) * 100}%"></span>
              ${unknown > 0 ? html`<span class="unknown" style="width: ${(unknown / totalCount) * 100}%"></span>` : ''}
            </div>
          </div>
        ` : html`
          <div class="summary">
            <div class="total">
              <span class="big">0</span>
              <span class="small">containers</span>
            </div>
          </div>
        `}

        ${totalCount > 0 ? html`
          <div class="filters">
            <span class="chip" ?data-active=${this._filter === 'all'}
                  @click=${() => (this._filter = 'all')}>All</span>
            <span class="chip" ?data-active=${this._filter === 'running'}
                  @click=${() => (this._filter = 'running')}>Running</span>
            <span class="chip" ?data-active=${this._filter === 'stopped'}
                  @click=${() => (this._filter = 'stopped')}>Stopped</span>
          </div>
          ${folders.map((f) => {
            const visible = this._filtered(f.containers);
            if (visible.length === 0) return '';
            return html`
              <div class="folder-label">
                <span>${f.name}</span>
                <span>${f.runningCount} / ${f.totalCount}</span>
              </div>
              <div class="container-grid">
                ${visible.map((c) => this._renderTile(c))}
              </div>
            `;
          })}
          ${ungrouped.length > 0 ? html`
            <div class="folder-label"><span>Ungrouped</span></div>
            <div class="container-grid">
              ${this._filtered(ungrouped).map((c) => this._renderTile(c))}
            </div>
          ` : ''}
        ` : ''}
      </md-card>
    `;
  }
}
