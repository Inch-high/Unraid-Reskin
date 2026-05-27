import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { DashboardStore } from '../store';
import type {
  WidgetState,
  UnknownWidget,
  ArrayState,
  CacheState,
  ParityState,
  DisklocationState,
  ProcessorState,
  MemoryState,
  GpuState,
  IpmiState,
  DockerState,
  VmsState,
  InterfaceState,
  UpsState,
  IdentityState,
  MotherboardState,
  SharesState,
  UsersState,
} from '../types';
import './md-section';
import './md-plugin-card';
import './md-array-card';
import './md-cache-card';
import './md-parity-card';
import './md-disklocation-card';
import './md-processor-card';
import './md-memory-card';
import './md-gpu-card';
import './md-ipmi-card';
import './md-docker-card';
import './md-vms-card';
import './md-interface-card';
import './md-ups-card';
import './md-identity-card';
import './md-motherboard-card';
import './md-shares-card';
import './md-users-card';
import './md-hero-strip';

@customElement('modernui-dashboard')
export class ModernuiDashboard extends LitElement {
  static styles = css`
    :host {
      display: block;
      /* Full bleed so the host covers the stock dashboard's wider grid behind it
         (dashboard-overlay.scss stacks both in the same CSS Grid cell). */
      width: 100%;
      background: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-sans);
    }
    .content {
      /* Fill the available frame. dashboard-overlay.scss overrides
         Unraid's 1900px frame cap so this picks up the wider viewport on
         ultrawide monitors. */
      width: 100%;
      max-width: 2400px;
      margin: 0 auto;
      padding: 16px 24px 48px;
      box-sizing: border-box;
    }
    .layout {
      /* Default single-column flow (mobile / narrow viewports). On wide
         viewports a media query promotes us to a sticky sidebar + main grid. */
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      align-items: start;
    }
    .sidebar { min-width: 0; }
    .main { min-width: 0; }
    @media (min-width: 1400px) {
      .layout {
        grid-template-columns: minmax(380px, 28%) 1fr;
      }
      .sidebar {
        /* Pin Processor & Memory to the viewport so it stays visible while
           the rest of the dashboard scrolls. 16px matches the .content
           top padding so it doesn't bump against the top edge. */
        position: sticky;
        top: 16px;
      }
    }

    /* Initial-load skeleton. Renders the moment our overlay mounts so the
       user sees the dashboard's shape immediately, instead of staring at
       a blank/stock dashboard while Unraid's Vue chrome and per-tile JS
       finish their first paint. Replaced as extractors populate the store. */
    .sk {
      background: linear-gradient(90deg, var(--bg-elevated) 0%, var(--border-subtle) 50%, var(--bg-elevated) 100%);
      background-size: 200% 100%;
      border-radius: var(--radius-sm);
      animation: dashboard-shimmer 1.2s ease-in-out infinite;
    }
    .sk-hero-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 0 0 16px;
    }
    .sk-hero {
      height: 140px;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sk-hero .sk-label { width: 50px; height: 11px; }
    .sk-hero .sk-big   { width: 110px; height: 28px; margin-top: 8px; }
    .sk-hero .sk-sub   { width: 80px;  height: 12px; }
    @media (max-width: 1199px) { .sk-hero-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 767px)  { .sk-hero-grid { grid-template-columns: 1fr; } }

    .sk-section {
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      padding: 16px;
      margin-bottom: 16px;
    }
    .sk-section .sk-section-title { width: 90px; height: 13px; margin-bottom: 12px; }
    .sk-section .sk-row { height: 18px; margin: 8px 0; }
    .sk-section .sk-row:nth-child(2) { width: 90%; }
    .sk-section .sk-row:nth-child(3) { width: 70%; }
    .sk-section .sk-row:nth-child(4) { width: 80%; }

    @keyframes dashboard-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;

  private _store: DashboardStore | null = null;
  private _unsubscribe: (() => void) | null = null;

  @state() private _widgets: WidgetState[] = [];

  setStore(store: DashboardStore): void {
    this._unsubscribe?.();
    this._store = store;
    this._unsubscribe = store.subscribe(() => this._sync());
    this._sync();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
  }

  private _sync(): void {
    if (!this._store) return;
    const all: WidgetState[] = [];
    for (const id of this._store.keys()) {
      const v = this._store.get(id);
      if (v) all.push(v);
    }
    this._widgets = all;
  }

  /** True while we have no widgets in the store yet. Used to show a
   *  full-layout skeleton at first paint. Flips false as soon as the first
   *  extract pass writes anything (the modernui shell does the same dance). */
  private _isInitialLoading(): boolean {
    return this._widgets.length === 0;
  }

  private _renderInitialSkeleton() {
    return html`
      <div class="content" aria-busy="true" aria-live="polite">
        <div class="sk-hero-grid">
          ${[0, 1, 2, 3].map(() => html`
            <div class="sk-hero">
              <div class="sk sk-label"></div>
              <div class="sk sk-big"></div>
              <div class="sk sk-sub"></div>
            </div>
          `)}
        </div>
        <div class="layout">
          <aside class="sidebar">
            <div class="sk-section">
              <div class="sk sk-section-title"></div>
              <div class="sk sk-row"></div>
              <div class="sk sk-row"></div>
              <div class="sk sk-row"></div>
            </div>
          </aside>
          <div class="main">
            <div class="sk-section">
              <div class="sk sk-section-title"></div>
              <div class="sk sk-row"></div>
              <div class="sk sk-row"></div>
              <div class="sk sk-row"></div>
            </div>
            <div class="sk-section">
              <div class="sk sk-section-title"></div>
              <div class="sk sk-row"></div>
              <div class="sk sk-row"></div>
              <div class="sk sk-row"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (this._isInitialLoading()) return this._renderInitialSkeleton();

    const widgets = this._widgets;
    const arrays = widgets.filter((w): w is ArrayState => w.kind === 'array');
    const caches = widgets.filter((w): w is CacheState => w.kind === 'cache');
    const parities = widgets.filter((w): w is ParityState => w.kind === 'parity');
    const disklocations = widgets.filter((w): w is DisklocationState => w.kind === 'disklocation');
    const processors = widgets.filter((w): w is ProcessorState => w.kind === 'processor');
    const memories = widgets.filter((w): w is MemoryState => w.kind === 'system');
    const gpus = widgets.filter((w): w is GpuState => w.kind === 'gpu');
    const ipmis = widgets.filter((w): w is IpmiState => w.kind === 'ipmi');
    const dockers = widgets.filter((w): w is DockerState => w.kind === 'docker');
    const vms = widgets.filter((w): w is VmsState => w.kind === 'vms');
    const interfaces = widgets.filter((w): w is InterfaceState => w.kind === 'interface');
    const upses = widgets.filter((w): w is UpsState => w.kind === 'ups');
    const identities = widgets.filter((w): w is IdentityState => w.kind === 'identity');
    const motherboards = widgets.filter((w): w is MotherboardState => w.kind === 'motherboard');
    const shares = widgets.filter((w): w is SharesState => w.kind === 'shares');
    const users = widgets.filter((w): w is UsersState => w.kind === 'users');
    const unknown = widgets.filter((w): w is UnknownWidget => w.kind === 'unknown');

    const hasStorage = arrays.length + caches.length + parities.length + disklocations.length > 0;
    const hasCompute = gpus.length + ipmis.length + (processors.length === 0 && memories.length > 0 ? memories.length : 0) > 0;
    const hasWorkloads = dockers.length + vms.length > 0;
    const hasNetwork = interfaces.length > 0;
    const hasPower = upses.length > 0;
    const hasSystem = identities.length + motherboards.length + shares.length + users.length > 0;
    const hasSidebarHero = processors.length > 0;

    return html`
      <div class="content">
        <md-hero-strip
          .arrayState=${arrays[0] ?? null}
          .cacheStates=${caches}
          .dockerState=${dockers[0] ?? null}
          .vmsState=${vms[0] ?? null}
          .upsState=${upses[0] ?? null}
        ></md-hero-strip>
        <div class="layout">
          <aside class="sidebar">
            ${hasSidebarHero ? html`
              <md-section label="Compute">
                <md-processor-card
                  .state=${processors[0]}
                  .memoryState=${memories[0] ?? null}
                ></md-processor-card>
              </md-section>
            ` : ''}
            ${hasNetwork ? html`
              <md-section label="Network">
                ${interfaces.map((s) => html`<md-interface-card .state=${s}></md-interface-card>`)}
              </md-section>
            ` : ''}
          </aside>
          <div class="main">
            ${hasStorage ? html`
              <md-section label="Storage">
                ${disklocations.length > 0 ? html`
                  <md-disklocation-card
                    .state=${disklocations[0]}
                    .arrayState=${arrays[0] ?? null}
                    .cacheStates=${caches}
                    .parityState=${parities[0] ?? null}
                    data-wide
                  ></md-disklocation-card>
                ` : html`
                  ${arrays.map((s) => html`<md-array-card .state=${s}></md-array-card>`)}
                  ${caches.map((s) => html`<md-cache-card .state=${s}></md-cache-card>`)}
                  ${parities.map((s) => html`<md-parity-card .state=${s}></md-parity-card>`)}
                `}
              </md-section>
            ` : ''}
            ${hasCompute ? html`
              <md-section label="Devices">
                ${processors.length === 0 ? memories.map((s) => html`<md-memory-card .state=${s}></md-memory-card>`) : ''}
                ${gpus.map((s) => html`<md-gpu-card .state=${s}></md-gpu-card>`)}
                ${ipmis.map((s) => html`<md-ipmi-card .state=${s}></md-ipmi-card>`)}
              </md-section>
            ` : ''}
            ${hasWorkloads ? html`
              <md-section label="Workloads">
                ${dockers.map((s) => html`<md-docker-card .state=${s} data-wide></md-docker-card>`)}
                ${vms.map((s) => html`<md-vms-card .state=${s}></md-vms-card>`)}
              </md-section>
            ` : ''}
            ${hasPower ? html`
              <md-section label="Power">
                ${upses.map((s) => html`<md-ups-card .state=${s}></md-ups-card>`)}
              </md-section>
            ` : ''}
            ${hasSystem ? html`
              <md-section label="System">
                ${identities.map((s) => html`<md-identity-card .state=${s}></md-identity-card>`)}
                ${motherboards.map((s) => html`<md-motherboard-card .state=${s}></md-motherboard-card>`)}
                ${shares.map((s) => html`<md-shares-card .state=${s}></md-shares-card>`)}
                ${users.map((s) => html`<md-users-card .state=${s}></md-users-card>`)}
              </md-section>
            ` : ''}
            ${unknown.length > 0 ? html`
              <md-section label="Plugins (untyped)">
                ${unknown.map((w) => html`<md-plugin-card .state=${w}></md-plugin-card>`)}
              </md-section>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }
}
