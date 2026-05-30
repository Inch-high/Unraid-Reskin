import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MdMainCardBase } from './md-main-card';
import './md-main-device-row';
import type { UnassignedState, UnassignedDisk, UnassignedRemote } from '../types';
import { formatBytes, formatTemp, formatPct } from '../format';
import * as A from '../actions';

// Unassigned Devices card — unassigned disks (+ partitions) and remote
// SMB/NFS/ISO mounts, with inline Mount/Unmount. Advanced operations (format,
// preclear, settings, scripts, add-share) are intentionally out of scope —
// a footer note points to Main: Stock for those.
@customElement('md-main-unassigned-card')
export class MdMainUnassignedCard extends MdMainCardBase {
  static styles = [
    MdMainCardBase.styles,
    css`
      .ud-head { display: grid; grid-template-columns: minmax(140px,1.4fr) minmax(150px,1.6fr) 64px 96px 96px 96px 1fr 96px;
        gap: 10px; padding: 8px 14px; align-items: center; background: var(--bg-elevated);
        font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--text-muted); }
      .ud-row { display: grid; grid-template-columns: minmax(140px,1.4fr) minmax(150px,1.6fr) 64px 96px 96px 96px 1fr 96px;
        gap: 10px; padding: 9px 14px; align-items: center; border-top: 1px solid var(--border-subtle); font-size: 13px; color: var(--text-primary); }
      .name { display: flex; flex-direction: column; min-width: 0; }
      .name .primary { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .name .sub { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mono { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .num { font-variant-numeric: tabular-nums; text-align: right; color: var(--text-secondary); }
      .util { display: flex; align-items: center; gap: 8px; }
      .bar { flex: 1; height: 6px; border-radius: var(--radius-full); background: var(--border-subtle); overflow: hidden; }
      .bar > span { display: block; height: 100%; background: var(--mui-accent); }
      .right { text-align: right; }
      button {
        background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border-default);
        border-radius: var(--radius-sm); padding: 4px 12px; font: inherit; font-size: 12px; cursor: pointer;
      }
      button:hover { border-color: var(--mui-accent); color: var(--mui-accent); }
      .dash { color: var(--text-muted); }
      .subhead { padding: 10px 14px 2px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); }
      .empty { padding: 14px; color: var(--text-muted); font-size: 13px; }
      .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
      .dot.on { background: var(--success); } .dot.off { background: var(--text-muted); }
      .footnote { padding: 10px 14px 12px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border-subtle); }
    `,
  ];

  @property({ type: Object }) state!: UnassignedState;
  @property({ type: String }) csrf = '';
  @property({ attribute: false }) resync: () => void = () => {};

  private async _toggle(device: string, mounted: boolean): Promise<void> {
    if (!device) return;
    await A.submit(mounted ? A.buildUdUmount(device) : A.buildUdMount(device), this.csrf);
    // UD runs mount/unmount via a background script; give it a moment, then resync.
    setTimeout(() => this.resync(), 800);
  }

  private _utilCell(used: number | null, size: number | null, pct: number | null) {
    if (size === null || used === null) return html`<span class="dash">—</span>`;
    const p = pct ?? (size > 0 ? (used / size) * 100 : 0);
    return html`<div class="util"><span class="bar"><span style=${`width:${Math.min(100, p)}%`}></span></span>
      <span class="num">${formatPct(p)}</span></div>`;
  }

  private _diskRows(d: UnassignedDisk) {
    const head = html`
      <div class="ud-row">
        <div class="name"><span class="primary">${d.device}</span><span class="sub">disk</span></div>
        <div class="mono">${d.model || ''}${d.serial ? html` · ${d.serial}` : ''}</div>
        <div class="right">${formatTemp(d.tempC)}</div>
        <div class="num">${formatBytes(d.sizeBytes)}</div>
        <div></div><div></div><div></div><div></div>
      </div>`;
    const parts = d.partitions.map((p) => html`
      <div class="ud-row">
        <div class="name"><span class="primary">${p.device}</span>
          <span class="sub"><span class="dot ${p.mounted ? 'on' : 'off'}"></span>${p.mounted ? 'mounted' : 'not mounted'}</span></div>
        <div class="mono">${p.mountpoint || (p.label ? p.label : html`<span class="dash">—</span>`)}</div>
        <div class="right"><span class="dash">—</span></div>
        <div class="num">${formatBytes(p.sizeBytes)}</div>
        <div class="num">${formatBytes(p.usedBytes)}</div>
        <div class="num">${formatBytes(p.freeBytes)}</div>
        <div>${this._utilCell(p.usedBytes, p.sizeBytes, null)}</div>
        <div class="right"><button @click=${() => this._toggle(p.device, p.mounted)}>${p.mounted ? 'Unmount' : 'Mount'}</button></div>
      </div>`);
    return [head, ...parts];
  }

  private _remoteRow(r: UnassignedRemote) {
    const label = r.protocol === 'root' ? 'iso' : r.protocol;
    return html`
      <div class="ud-row">
        <div class="name"><span class="primary">${r.name || r.share || r.device}</span>
          <span class="sub"><span class="dot ${r.mounted ? 'on' : 'off'}"></span>${label}${r.ip ? ' · ' + r.ip : ''}</span></div>
        <div class="mono">${r.mountpoint || html`<span class="dash">—</span>`}</div>
        <div class="right">${r.alive ? '' : html`<span class="dash" title="host unreachable">offline</span>`}</div>
        <div class="num">${formatBytes(r.sizeBytes)}</div>
        <div class="num">${formatBytes(r.usedBytes)}</div>
        <div class="num">${formatBytes(r.freeBytes)}</div>
        <div>${this._utilCell(r.usedBytes, r.sizeBytes, null)}</div>
        <div class="right"><button @click=${() => this._toggle(r.device, r.mounted)}>${r.mounted ? 'Unmount' : 'Mount'}</button></div>
      </div>`;
  }

  render() {
    const s = this.state;
    if (!s || !s.available) return html``;
    const hasDisks = s.disks.length > 0;
    const hasRemotes = s.remotes.length > 0;
    return html`
      <div class="card">
        <div class="card-head"><div class="title"><h2>Unassigned Devices</h2></div></div>
        <div class="ud-head">
          <span>Device</span><span>Mount point / ID</span><span class="right">Temp</span>
          <span class="right">Size</span><span class="right">Used</span><span class="right">Free</span>
          <span>Utilization</span><span class="right">Action</span>
        </div>
        ${hasDisks ? s.disks.map((d) => this._diskRows(d)) : html`<div class="empty">No unassigned disks.</div>`}
        ${hasRemotes
          ? html`<div class="subhead">Remote shares</div>${s.remotes.map((r) => this._remoteRow(r))}`
          : ''}
        <div class="footnote">Format, preclear, per-device settings, scripts, and adding remote shares:
          use Settings → Theme → <strong>Main: Stock</strong>.</div>
      </div>
    `;
  }
}
