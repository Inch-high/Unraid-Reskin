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
  @property({ type: Array }) cacheStates: CacheState[] = [];
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
    const totalCap = pools.reduce((s, c) => s + (c.totalGB ?? 0), 0);
    const pct = totalCap > 0 ? Math.round((totalUsed / totalCap) * 100) : 0;
    const used =
      totalUsed >= 1024 ? `${(totalUsed / 1024).toFixed(1)} TB` : `${totalUsed.toFixed(0)} GB`;
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
    const vmsHas = !!v && v.totalCount > 0;
    const dockerLoading = !!d?.loading;
    const vmsLoading = !!v?.loading;
    // Reserve the slot with a skeleton when the underlying tbody exists but
    // Unraid's JS hasn't injected tiles yet. Without this the card pops in
    // ~1-3s after first paint.
    if (!dockerHas && !vmsHas && (dockerLoading || vmsLoading)) {
      return html`<md-hero-card label="Workloads" loading></md-hero-card>`;
    }
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
        >
          ${this._dockerIcon('left-icon')}
          ${this._vmIcon('right-icon')}
        </md-hero-card>
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
    // Spinner placeholders still up — show a skeleton instead of the
    // misleading "—" / "UPS status unknown" card.
    if (u.loading) {
      return html`<md-hero-card label="Power" loading></md-hero-card>`;
    }
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
    if (u.runtimeMinutes !== null) battParts.push(`${u.runtimeMinutes} min`);
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
    dockerStarted: number | null,
    dockerTotal: number | null,
    vmStarted: number | null,
    vmTotal: number | null,
  ) {
    return html`
      <div class="dots-stack">
        ${dockerTotal !== null ? this._dotsRow(dockerStarted ?? 0, dockerTotal, 'CT') : ''}
        ${vmTotal !== null ? this._dotsRow(vmStarted ?? 0, vmTotal, 'VM') : ''}
      </div>
    `;
  }

  // Inline SVGs sit in the light DOM with a `slot=...` so md-hero-card's
  // named slots project them. SVGs use currentColor so the parent's color
  // rule (--mui-accent on twin slotted SVGs) wins.

  private _dockerIcon(slot: string) {
    // Official Docker brand mark (Moby whale + stacked containers).
    // Path from simpleicons.org docker.svg (CC0 brand asset).
    return html`
      <svg slot="${slot}" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.371 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z"/>
      </svg>
    `;
  }

  private _vmIcon(slot: string) {
    // Computer monitor + stand (virtual machine).
    return html`
      <svg slot="${slot}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
           xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="4" width="20" height="13" rx="1.5"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
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
    const cards = [
      this._arrayCard(),
      this._cacheCard(),
      this._workloadsCard(),
      this._powerCard(),
    ].filter((c) => c !== '');
    if (cards.length === 0) return html``;
    return html`<div class="grid">${cards}</div>`;
  }
}
