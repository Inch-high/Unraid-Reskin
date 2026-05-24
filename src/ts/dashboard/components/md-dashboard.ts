import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { DashboardStore } from '../store';
import type { WidgetState, UnknownWidget, ArrayState, CacheState, ParityState, DisklocationState, ProcessorState, MemoryState, GpuState, IpmiState, DockerState } from '../types';
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

@customElement('modernui-dashboard')
export class ModernuiDashboard extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 1440px;
      margin: 0 auto;
      padding: 16px 24px 48px;
      color: var(--text-primary);
      font-family: var(--font-sans);
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

  render() {
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
    const unknown = widgets.filter((w): w is UnknownWidget => w.kind === 'unknown');

    return html`
      ${arrays.length > 0 || caches.length > 0 || parities.length > 0 || disklocations.length > 0 ? html`
        <md-section label="Storage">
          ${arrays.map((s) => html`<md-array-card .state=${s}></md-array-card>`)}
          ${caches.map((s) => html`<md-cache-card .state=${s}></md-cache-card>`)}
          ${parities.map((s) => html`<md-parity-card .state=${s}></md-parity-card>`)}
          ${disklocations.map((s) => html`<md-disklocation-card .state=${s}></md-disklocation-card>`)}
        </md-section>
      ` : ''}
      ${(processors.length > 0 || memories.length > 0 || gpus.length > 0 || ipmis.length > 0) ? html`
        <md-section label="Compute">
          ${processors.map((s) => html`<md-processor-card .state=${s}></md-processor-card>`)}
          ${memories.map((s) => html`<md-memory-card .state=${s}></md-memory-card>`)}
          ${gpus.map((s) => html`<md-gpu-card .state=${s}></md-gpu-card>`)}
          ${ipmis.map((s) => html`<md-ipmi-card .state=${s}></md-ipmi-card>`)}
        </md-section>
      ` : ''}
      ${dockers.length > 0 ? html`
        <md-section label="Workloads">
          ${dockers.map((s) => html`<md-docker-card .state=${s} data-wide></md-docker-card>`)}
        </md-section>
      ` : ''}
      ${unknown.length > 0 ? html`
        <md-section label="Plugins (untyped)">
          ${unknown.map((w) => html`<md-plugin-card .state=${w}></md-plugin-card>`)}
        </md-section>
      ` : ''}
    `;
  }
}
