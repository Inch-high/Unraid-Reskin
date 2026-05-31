import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { DockerStore } from '../store';
import type { UpdateProgressStore } from '../update-progress';
import { selectPanelView } from '../update-progress';
import { formatBytes } from '../format';

// Floating right-side panel that surfaces in-flight docker update progress.
// Hidden when nothing's updating; appears the moment store.getUpdating()
// gains an entry. Per active container we render name + overall % + download
// speed; other names in the updating set show as "Queued" (the stock update
// script runs containers serially, so at any moment exactly one is active).
//
// Position: fixed to the viewport so it floats over the page rather than
// pushing content. Mobile-narrow viewports hide it entirely (display:none)
// to avoid stealing space from the row list.

@customElement('md-docker-update-panel')
export class MdDockerUpdatePanel extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      top: 88px;
      right: 24px;
      width: 320px;
      z-index: 40;
      pointer-events: none;
    }
    .panel {
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      box-shadow: 0 12px 32px rgba(0,0,0,.4);
      padding: 14px;
      pointer-events: auto;
    }
    .head {
      display: flex; align-items: center; gap: 8px;
      font: 600 11px var(--font-sans);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--info);
      margin-bottom: 12px;
    }
    .sp {
      width: 12px; height: 12px;
      border: 1.5px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: md-update-sp 0.7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes md-update-sp { to { transform: rotate(360deg); } }

    .card {
      padding: 10px 0;
      border-top: 1px solid var(--border-subtle);
    }
    .card:first-of-type { border-top: 0; padding-top: 0; }
    .card:last-of-type { padding-bottom: 0; }
    .card .name {
      font: 500 13px var(--font-sans);
      color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      margin-bottom: 6px;
    }
    .card .meta {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      font: 500 11px ui-monospace, "JetBrains Mono", "SF Mono", Consolas, monospace;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .card .meta .phase { color: var(--info); }
    .bar {
      height: 4px;
      background: var(--bg-base);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .bar > i {
      display: block;
      height: 100%;
      background: var(--info);
      border-radius: var(--radius-full);
      transition: width 250ms ease-out;
    }
    /* Indeterminate sweep — used during the recreate phase where docker
       emits no percentages. A shimmer keeps the row from looking frozen. */
    .bar.indet { position: relative; }
    .bar.indet > i {
      width: 30% !important;
      background: linear-gradient(90deg, transparent, var(--info), transparent);
      animation: md-update-sweep 1.4s ease-in-out infinite;
    }
    @keyframes md-update-sweep {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(380%); }
    }

    .card[data-queued] .name { color: var(--text-secondary); }
    .card[data-queued] .meta { color: var(--text-muted); }
    .card[data-queued] .bar > i { background: var(--text-muted); width: 0%; }

    /* Narrow viewports — panel would dominate the row list. Hide it; the
       per-row "Updating…" badge still surfaces the same information inline. */
    @media (max-width: 720px) { :host { display: none; } }
  `;

  private _docker: DockerStore | null = null;
  private _progress: UpdateProgressStore | null = null;
  private _unsubDocker: (() => void) | null = null;
  private _unsubProgress: (() => void) | null = null;
  @state() private _tick = 0;

  setStores(docker: DockerStore, progress: UpdateProgressStore): void {
    // Called from the page's updated() after every render. Genuinely
    // idempotent: re-wiring the same store pair would needlessly churn
    // subscriptions, so bail when nothing changed.
    if (this._docker === docker && this._progress === progress) return;
    this._unsubDocker?.();
    this._unsubProgress?.();
    this._docker = docker;
    this._progress = progress;
    this._unsubDocker = docker.subscribe(() => {
      this._tick++;
    });
    this._unsubProgress = progress.subscribe(() => {
      this._tick++;
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubDocker?.();
    this._unsubProgress?.();
  }

  render() {
    if (!this._docker || !this._progress) return nothing;
    const updating = this._docker.getUpdating();
    if (updating.size === 0) return nothing;

    // Reconcile the restored progress session against the live updating set.
    // See selectPanelView for the stale-active + single-container fallback
    // rules (extracted + unit-tested there).
    const { active: renderableActive, queued } = selectPanelView(
      updating,
      this._progress.getActive(),
    );

    return html`
      <div class="panel">
        <!-- Live region scoped to the count line only. The per-card percentages
             change dozens of times a second during a pull; announcing those
             would flood a screen reader. The "Updating N containers" summary
             changes rarely and is the genuinely useful announcement. -->
        <div class="head" role="status" aria-live="polite">
          <span class="sp"></span>
          Updating ${updating.size} container${updating.size === 1 ? '' : 's'}
        </div>
        ${renderableActive ? this._renderActive(renderableActive.name, renderableActive.data) : nothing}
        ${queued.map((n) => this._renderQueued(n))}
      </div>
    `;
  }

  private _renderActive(name: string, p: ReturnType<UpdateProgressStore['getActive']>) {
    // p is null when we're in the fallback path — single container in the
    // updating set, no progress data yet (fresh nav-in before any nchan
    // message has arrived for this session). Render indeterminate so it
    // doesn't look stuck; the next progress message replaces this.
    if (!p) {
      return html`
        <div class="card">
          <div class="name" title=${name}>${name}</div>
          <div class="meta"><span class="phase">Working…</span></div>
          <div class="bar indet"><i></i></div>
        </div>
      `;
    }
    const pct = Math.max(0, Math.min(100, p.percent));
    const indet = p.phase === 'recreating';
    return html`
      <div class="card">
        <div class="name" title=${name}>${name}</div>
        <div class="meta">
          <span class="phase">${indet ? 'Recreating' : `${Math.round(pct)}%`}</span>
          <span>${indet ? '' : p.speedBps !== null ? `${formatBytes(p.speedBps)}/s` : '—'}</span>
        </div>
        <div class="bar ${indet ? 'indet' : ''}"><i style="width:${pct}%"></i></div>
      </div>
    `;
  }

  private _renderQueued(name: string) {
    return html`
      <div class="card" data-queued>
        <div class="name" title=${name}>${name}</div>
        <div class="meta"><span>Queued</span></div>
        <div class="bar"><i></i></div>
      </div>
    `;
  }
}
