import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { CURATED_NAV, type NavItem } from '../nav-builder';
import { icon } from '../icons';

interface SearchHit {
  label: string;
  url: string;
  group?: string; // "Storage" / "Other" — surfaced as a dim suffix in the row
}

function flattenNav(tree: NavItem[], parent?: string, acc: SearchHit[] = []): SearchHit[] {
  for (const node of tree) {
    if (node.url) acc.push({ label: node.label, url: node.url, group: parent });
    if (node.children?.length) flattenNav(node.children, node.label, acc);
  }
  return acc;
}

function readStockAnchors(): SearchHit[] {
  // Pick up plugin-added entries on Unraid 7.3 (#menu) and 7.2 (<nav class=tabs>).
  const nav = document.querySelector('#menu, nav.tabs');
  if (!nav) return [];
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const a of nav.querySelectorAll('a[href]')) {
    const href = (a as HTMLAnchorElement).getAttribute('href') || '';
    if (!href || !href.startsWith('/') || seen.has(href)) continue;
    seen.add(href);
    const label = (a.textContent || '').trim() || href;
    out.push({ label, url: href });
  }
  return out;
}

@customElement('shell-search')
export class ShellSearch extends LitElement {
  static styles = css`
    :host { position: relative; }
    .trigger {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 6px;
    }
    .trigger:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .popover {
      position: absolute; top: calc(100% + 6px); right: 0;
      /* Clamp to viewport so the popover never overflows a narrow phone
         screen. 16px of breathing room at each edge stops it from kissing
         the viewport edge on rotation. */
      width: min(340px, calc(100vw - 32px));
      max-width: calc(100vw - 16px);
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      display: none;
      z-index: 100;
      overflow: hidden;
    }
    :host([open]) .popover { display: block; }
    .input-wrap {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
    }
    input {
      flex: 1; min-width: 0;
      background: transparent; border: 0;
      color: var(--text-primary);
      font: inherit; font-size: 13px;
      outline: none;
    }
    .list { max-height: 360px; overflow-y: auto; }
    .row {
      display: flex; align-items: baseline; gap: 8px;
      padding: 8px 12px;
      color: var(--text-primary); text-decoration: none;
      font-size: 13px;
      cursor: pointer;
    }
    .row:hover, .row.selected {
      background: var(--bg-elev-1, rgba(255,255,255,0.04));
    }
    .row.selected { border-left: 2px solid var(--mui-accent, #ff8c2f); padding-left: 10px; }
    .row .group {
      color: var(--text-secondary);
      font-size: 11px;
      margin-left: auto;
    }
    .empty { padding: 24px 12px; color: var(--text-secondary); font-size: 12px; text-align: center; }
    .hint { padding: 6px 12px; color: var(--text-secondary); font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.04)); }
    .hint kbd {
      background: var(--bg-elev-1, rgba(255,255,255,0.06));
      padding: 1px 4px; border-radius: 3px; font-size: 10px;
      font-family: var(--font-mono, ui-monospace, monospace);
    }
  `;

  @state() private _open = false;
  @state() private _query = '';
  @state() private _selectedIdx = 0;
  @state() private _items: SearchHit[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._refreshItems();
    document.addEventListener('keydown', this._onGlobalKey);
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onGlobalKey);
    document.removeEventListener('click', this._onOutside);
  }

  private _refreshItems(): void {
    const seen = new Set<string>();
    const merged: SearchHit[] = [];
    for (const h of [...flattenNav(CURATED_NAV), ...readStockAnchors()]) {
      if (!h.url || seen.has(h.url)) continue;
      seen.add(h.url);
      merged.push(h);
    }
    this._items = merged;
  }

  /** Cmd/Ctrl+K and "/" open search globally. Esc closes. */
  private _onGlobalKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    const inField =
      target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this._toggleOpen(true);
      return;
    }
    if (e.key === '/' && !inField && !this._open) {
      e.preventDefault();
      this._toggleOpen(true);
      return;
    }
    if (e.key === 'Escape' && this._open) {
      e.preventDefault();
      this._toggleOpen(false);
    }
  };

  private _onOutside = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node) && !this.shadowRoot?.contains(e.target as Node)) {
      this._toggleOpen(false);
    }
  };

  private _toggleOpen(force?: boolean): void {
    const next = force === undefined ? !this._open : force;
    if (next === this._open) return;
    this._open = next;
    this.toggleAttribute('open', next);
    if (next) {
      this._refreshItems();
      this._selectedIdx = 0;
      // Focus the input after the popover is in the DOM.
      requestAnimationFrame(() => {
        this.shadowRoot?.querySelector('input')?.focus();
      });
    } else {
      this._query = '';
    }
  }

  private _onTrigger = (e: MouseEvent): void => {
    e.stopPropagation();
    this._toggleOpen();
  };

  private _onInput = (e: Event): void => {
    this._query = (e.target as HTMLInputElement).value;
    this._selectedIdx = 0;
  };

  private _onInputKey = (e: KeyboardEvent): void => {
    const matches = this._filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._selectedIdx = Math.min(this._selectedIdx + 1, matches.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._selectedIdx = Math.max(this._selectedIdx - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = matches[this._selectedIdx];
      if (hit) this._navigate(hit);
    }
  };

  private _filtered(): SearchHit[] {
    const q = this._query.trim().toLowerCase();
    if (!q) return this._items.slice(0, 30);
    return this._items
      .filter((it) => it.label.toLowerCase().includes(q) || it.url.toLowerCase().includes(q))
      .slice(0, 30);
  }

  private _navigate(hit: SearchHit): void {
    this._toggleOpen(false);
    window.location.href = hit.url;
  }

  render() {
    const matches = this._filtered();
    return html`
      <button class="trigger" type="button" aria-label="Search" title="Search (Ctrl+K or /)" @click=${this._onTrigger}>${icon('search', 18)}</button>
      <div class="popover" role="dialog">
        <div class="input-wrap">
          ${icon('search', 14)}
          <input
            type="text"
            placeholder="Jump to page…"
            .value=${this._query}
            @input=${this._onInput}
            @keydown=${this._onInputKey}
          />
        </div>
        <div class="list">
          ${
            matches.length === 0
              ? html`<div class="empty">No matching pages</div>`
              : matches.map(
                  (hit, i) => html`
                <div
                  class="row ${i === this._selectedIdx ? 'selected' : ''}"
                  @click=${() => this._navigate(hit)}
                  @mouseenter=${() => {
                    this._selectedIdx = i;
                  }}
                >
                  <span>${hit.label}</span>
                  ${hit.group ? html`<span class="group">${hit.group}</span>` : ''}
                </div>
              `,
                )
          }
        </div>
        <div class="hint">
          <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close
        </div>
      </div>
    `;
  }
}
