import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DockerContainerFull, DockerFilters, DockerTag } from '../types';
import { icon } from '../icons';

@customElement('md-docker-toolbar')
export class MdDockerToolbar extends LitElement {
  static styles = css`
    :host { display: block; margin-bottom: 16px; }
    .bar {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      flex-wrap: wrap;
    }
    .search {
      display: flex; align-items: center; gap: 8px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      flex: 1 1 280px;
      min-width: 240px;
    }
    .search:focus-within { border-color: var(--mui-accent); box-shadow: 0 0 0 3px var(--mui-accent-muted); }
    .search svg { color: var(--text-muted); }
    .search input {
      background: transparent; border: 0; outline: 0;
      color: var(--text-primary); font: inherit; flex: 1;
    }
    .search input::placeholder { color: var(--text-muted); }

    .group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .label {
      font: 600 10px var(--font-sans);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      padding-right: 4px;
    }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      height: 28px; padding: 0 10px;
      border-radius: var(--radius-full);
      background: var(--bg-elevated);
      border: 1px solid transparent;
      color: var(--text-secondary);
      font: 500 12px var(--font-sans);
      cursor: pointer;
    }
    .chip:hover { color: var(--text-primary); }
    .chip[data-active] {
      background: var(--mui-accent-muted);
      color: var(--mui-accent);
      border-color: var(--mui-accent);
    }
    .chip .count {
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      color: var(--text-muted);
      padding-left: 4px;
      border-left: 1px solid var(--border-subtle);
    }
    .chip[data-active] .count { color: var(--mui-accent); border-left-color: rgba(255,140,47,.35); }
    .chip-tag[data-active] { border-color: currentColor; }
    .spacer { flex: 1; }

    /* Segmented pill for the folder-default toggle. Renders as one rounded
       container with two inner pieces — clicking the inactive one switches. */
    .segmented {
      display: inline-flex;
      background: var(--bg-elevated);
      border-radius: var(--radius-full);
      padding: 2px;
      border: 1px solid var(--border-subtle);
    }
    .segmented button {
      display: inline-flex; align-items: center; gap: 6px;
      height: 24px; padding: 0 10px;
      background: transparent;
      border: 0; cursor: pointer;
      border-radius: var(--radius-full);
      color: var(--text-secondary);
      font: 500 12px var(--font-sans);
    }
    .segmented button:hover { color: var(--text-primary); }
    .segmented button[data-active] {
      background: var(--mui-accent);
      color: #fff;
    }
    .segmented button svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; }
  `;

  @property({ type: Object }) filters!: DockerFilters;
  @property({ type: Array }) containers: DockerContainerFull[] = [];
  @property({ type: Array }) tags: DockerTag[] = [];
  @property({ type: Object }) tagAssignments: Record<string, string[]> = {};
  @property({ type: String }) folderDefault: 'expanded' | 'collapsed' = 'expanded';
  @property({ type: Boolean }) showStats = false;

  private _setQuery(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.dispatchEvent(
      new CustomEvent('docker-filters', {
        detail: { ...this.filters, query: v },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _setState(state: DockerFilters['state']): void {
    this.dispatchEvent(
      new CustomEvent('docker-filters', {
        detail: { ...this.filters, state },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _toggleTag(id: string): void {
    const next = this.filters.tagIds.includes(id)
      ? this.filters.tagIds.filter((x) => x !== id)
      : [...this.filters.tagIds, id];
    this.dispatchEvent(
      new CustomEvent('docker-filters', {
        detail: { ...this.filters, tagIds: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _tagCount(id: string): number {
    let n = 0;
    for (const c of this.containers) {
      if ((this.tagAssignments[c.name] ?? []).includes(id)) n++;
    }
    return n;
  }

  private _setFolderDefault(value: 'expanded' | 'collapsed'): void {
    if (value === this.folderDefault) return;
    this.dispatchEvent(
      new CustomEvent<{ value: 'expanded' | 'collapsed' }>('docker-folder-default', {
        detail: { value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _toggleStats(): void {
    this.dispatchEvent(
      new CustomEvent<{ on: boolean }>('docker-show-stats', {
        detail: { on: !this.showStats },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const f = this.filters;
    const total = this.containers.length;
    const running = this.containers.filter((c) => c.state === 'started').length;
    const stopped = total - running;

    return html`
      <div class="bar">
        <label class="search">
          ${icon('search', 14)}
          <input type="text" placeholder="Search containers, images, tags, ports..."
                 .value=${f.query} @input=${this._setQuery}>
        </label>
        <div class="group">
          <span class="label">State</span>
          <button class="chip" ?data-active=${f.state === 'all'} @click=${() => this._setState('all')}>All <span class="count">${total}</span></button>
          <button class="chip" ?data-active=${f.state === 'running'} @click=${() => this._setState('running')}>Running <span class="count">${running}</span></button>
          <button class="chip" ?data-active=${f.state === 'stopped'} @click=${() => this._setState('stopped')}>Stopped <span class="count">${stopped}</span></button>
        </div>
        ${
          this.tags.length > 0
            ? html`
          <div class="group">
            <span class="label">Tag</span>
            ${this.tags.map((t) => {
              const active = f.tagIds.includes(t.id);
              const bg = active ? hexToRgba(t.color, 0.22) : hexToRgba(t.color, 0.12);
              return html`
                <button class="chip chip-tag" ?data-active=${active}
                        style="background:${bg};color:${t.color}"
                        @click=${() => this._toggleTag(t.id)}>
                  ${t.name} <span class="count">${this._tagCount(t.id)}</span>
                </button>
              `;
            })}
          </div>
        `
            : nothing
        }
        <span class="spacer"></span>
        <div class="group">
          <span class="label">Stats</span>
          <button class="chip" ?data-active=${this.showStats} @click=${this._toggleStats}>
            ${this.showStats ? 'On' : 'Off'}
          </button>
        </div>
        <div class="group">
          <span class="label">Folders</span>
          <div class="segmented" role="group" aria-label="Folder default state">
            <button ?data-active=${this.folderDefault === 'expanded'} @click=${() => this._setFolderDefault('expanded')}>
              ${icon('chevron_down', 12)} Expanded
            </button>
            <button ?data-active=${this.folderDefault === 'collapsed'} @click=${() => this._setFolderDefault('collapsed')}>
              ${icon('chevron_right', 12)} Collapsed
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,140,47,${alpha})`;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}
