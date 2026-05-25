import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ArrayState, CacheState, DockerState, VmsState, UpsState } from '../types';
import './md-hero-card';

@customElement('md-hero-strip')
export class MdHeroStrip extends LitElement {
  static styles = css`
    :host { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 0 0 16px;
    }
    @media (max-width: 1199px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 767px) {
      .grid { grid-template-columns: 1fr; }
    }

    /* Capacity ring used by Array + Cache heroes */
    .ring {
      width: 48px;
      height: 48px;
      position: relative;
    }
    .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 6; }
    .ring .track { stroke: var(--border-default); }
    .ring .fill  { stroke: var(--mui-accent); transition: stroke-dashoffset 240ms cubic-bezier(0.2, 0, 0, 1); }

    /* Battery icon used by Power hero */
    .battery {
      position: relative;
      width: 56px;
      height: 28px;
      border: 2px solid var(--text-primary);
      border-radius: 4px;
      box-sizing: border-box;
    }
    .battery::after {
      content: '';
      position: absolute;
      top: 6px;
      right: -5px;
      width: 3px;
      height: 12px;
      background: var(--text-primary);
      border-radius: 0 1px 1px 0;
    }
    .battery > span {
      display: block;
      height: 100%;
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1), background 120ms;
    }

    /* Dot rows used by Workloads hero */
    .dots-stack {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dots-row {
      display: flex;
      gap: 3px;
      align-items: center;
    }
    .dots-row .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .dots-row .label {
      font-size: 10px;
      color: var(--text-secondary);
      margin-left: 4px;
      font-variant-numeric: tabular-nums;
    }
  `;

  @property({ type: Object }) arrayState: ArrayState | null = null;
  @property({ type: Array })  cacheStates: CacheState[] = [];
  @property({ type: Object }) dockerState: DockerState | null = null;
  @property({ type: Object }) vmsState: VmsState | null = null;
  @property({ type: Object }) upsState: UpsState | null = null;

  private _arrayCard() {
    const s = this.arrayState;
    if (!s) return '';
    if (s.usedTB === null || s.totalTB === null) {
      return html`
        <md-hero-card
          label="Array"
          bigText="—"
          subText="capacity unknown"
          scrollTarget="md-disklocation-card"
          expanderTarget="storage-details"
        ></md-hero-card>
      `;
    }
    const pct = Math.round((s.usedTB / s.totalTB) * 100);
    return html`
      <md-hero-card
        label="Array"
        bigText="${s.usedTB.toFixed(1)} TB"
        subText="${pct}% used · Parity ${s.status}"
        scrollTarget="md-disklocation-card"
        expanderTarget="storage-details"
      >${this._ring(pct)}</md-hero-card>
    `;
  }

  private _cacheCard() {
    const pools = this.cacheStates.filter((c) => c.usedGB !== null && c.totalGB !== null);
    if (pools.length === 0) return '';
    const totalUsed = pools.reduce((s, c) => s + (c.usedGB ?? 0), 0);
    const totalCap  = pools.reduce((s, c) => s + (c.totalGB ?? 0), 0);
    const pct = totalCap > 0 ? Math.round((totalUsed / totalCap) * 100) : 0;
    const used = totalUsed >= 1024 ? `${(totalUsed / 1024).toFixed(1)} TB` : `${totalUsed.toFixed(0)} GB`;
    const status = pools[0].status.toUpperCase();
    return html`
      <md-hero-card
        label="Cache"
        bigText="${used}"
        subText="${pct}% used · ${status}"
        scrollTarget="md-disklocation-card"
        expanderTarget="storage-details"
      >${this._ring(pct)}</md-hero-card>
    `;
  }

  private _workloadsCard() {
    const d = this.dockerState;
    const v = this.vmsState;
    const dockerHas = !!d && d.totalCount > 0;
    const vmsHas    = !!v && v.totalCount > 0;
    if (!dockerHas && !vmsHas) return '';

    // Both exist → twin layout so containers and VMs each get their own
    // headline number instead of one being buried in the sub-text.
    if (dockerHas && vmsHas) {
      return html`
        <md-hero-card
          label="Workloads"
          twin
          leftBig="${d!.totalRunning}/${d!.totalCount}"
          leftLabel="Containers"
          rightBig="${v!.totalRunning}/${v!.totalCount}"
          rightLabel="${v!.totalCount === 1 ? 'VM' : 'VMs'}"
          scrollTarget="md-docker-card"
          expanderTarget="container-list"
        ></md-hero-card>
      `;
    }

    // Only one type exists → single big number with dot-row visual
    if (dockerHas) {
      return html`
        <md-hero-card
          label="Workloads"
          bigText="${d!.totalRunning} / ${d!.totalCount}"
          subText="containers running"
          scrollTarget="md-docker-card"
          expanderTarget="container-list"
        >${this._dotsStack(d!.totalRunning, d!.totalCount, null, null)}</md-hero-card>
      `;
    }

    return html`
      <md-hero-card
        label="Workloads"
        bigText="${v!.totalRunning} / ${v!.totalCount}"
        subText="${v!.totalCount === 1 ? 'VM' : 'VMs'} running"
        scrollTarget="md-vms-card"
        expanderTarget=""
      >${this._dotsStack(null, null, v!.totalRunning, v!.totalCount)}</md-hero-card>
    `;
  }

  private _powerCard() {
    const u = this.upsState;
    if (!u) return '';
    if (u.status === 'unknown') {
      return html`
        <md-hero-card
          label="Power"
          bigText="—"
          subText="UPS status unknown"
          scrollTarget="md-ups-card"
          expanderTarget=""
        ></md-hero-card>
      `;
    }
    const watts = u.loadW !== null ? `${Math.round(u.loadW)} W` : '—';
    const battParts: string[] = [];
    if (u.batteryChargePct !== null) battParts.push(`UPS ${Math.round(u.batteryChargePct)}%`);
    if (u.runtimeMinutes !== null)   battParts.push(`${u.runtimeMinutes} min`);
    return html`
      <md-hero-card
        label="Power"
        bigText="${watts}"
        subText="${battParts.join(' · ')}"
        scrollTarget="md-ups-card"
        expanderTarget=""
      >${this._battery(u.batteryChargePct ?? 0)}</md-hero-card>
    `;
  }

  private _ring(pct: number) {
    const r = 20;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - pct / 100);
    return html`
      <div class="ring">
        <svg viewBox="0 0 48 48">
          <circle class="track" cx="24" cy="24" r="${r}"></circle>
          <circle class="fill"  cx="24" cy="24" r="${r}"
                  stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
        </svg>
      </div>
    `;
  }

  private _battery(pct: number) {
    const color = pct >= 30 ? 'var(--success)' : pct >= 15 ? 'var(--warning)' : 'var(--danger)';
    return html`
      <div class="battery">
        <span style="width: ${Math.max(0, Math.min(100, pct))}%; background: ${color}"></span>
      </div>
    `;
  }

  private _dotsStack(
    dockerStarted: number | null, dockerTotal: number | null,
    vmStarted: number | null, vmTotal: number | null,
  ) {
    return html`
      <div class="dots-stack">
        ${dockerTotal !== null ? this._dotsRow(dockerStarted ?? 0, dockerTotal, 'CT') : ''}
        ${vmTotal !== null ? this._dotsRow(vmStarted ?? 0, vmTotal, 'VM') : ''}
      </div>
    `;
  }

  private _dotsRow(running: number, total: number, label: string) {
    if (total > 12) {
      return html`
        <div class="dots-row">
          <span class="label">${running}/${total} ${label}</span>
        </div>
      `;
    }
    const dots = Array.from({ length: total }, (_, i) => i < running);
    return html`
      <div class="dots-row">
        ${dots.map((on) => html`<span class="dot" style="background: ${on ? 'var(--success)' : 'var(--text-muted)'}"></span>`)}
        <span class="label">${label}</span>
      </div>
    `;
  }

  render() {
    const cards = [this._arrayCard(), this._cacheCard(), this._workloadsCard(), this._powerCard()]
      .filter((c) => c !== '');
    if (cards.length === 0) return html``;
    return html`<div class="grid">${cards}</div>`;
  }
}
