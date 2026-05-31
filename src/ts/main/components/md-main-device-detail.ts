import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { MainDevice, MainSmartInfo, SmartAttribute } from '../types';
import { icon } from '../../shell/icons';
import { formatBytes, formatTemp } from '../format';
import * as A from '../actions';

const SMART_ENDPOINT = '/plugins/unraid-modernui/include/main-smart.php';
const POLL_MS = 5000;

type Tab = 'health' | 'attributes' | 'selftest' | 'errors' | 'settings';

// Spin-down delay option list — mirrors the stock DeviceInfo select.
const SPINDOWN_OPTS: [string, string][] = [
  ['-1', 'Use default'],
  ['0', 'Never'],
  ['15', '15 minutes'],
  ['30', '30 minutes'],
  ['45', '45 minutes'],
  ['1', '1 hour'],
  ['2', '2 hours'],
  ['3', '3 hours'],
  ['4', '4 hours'],
  ['5', '5 hours'],
  ['6', '6 hours'],
  ['7', '7 hours'],
  ['8', '8 hours'],
  ['9', '9 hours'],
];

// SMART attributes most worth flagging for a failing/aging drive.
const KEY_ATTRS = new Set([5, 187, 188, 197, 198, 199]);

@customElement('md-main-device-detail')
export class MdMainDeviceDetail extends LitElement {
  static styles = css`
    :host { display: contents; }
    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      display: grid; place-items: center; z-index: 100;
    }
    .modal {
      width: min(820px, 94vw); max-height: 90vh;
      background: var(--bg-surface); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); display: flex; flex-direction: column;
      overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.5);
      color: var(--text-primary); font-size: 13px;
    }
    .head { display: flex; align-items: center; gap: 12px; padding: 15px 18px; border-bottom: 1px solid var(--border-subtle); }
    .head .icon { width: 38px; height: 38px; flex: 0 0 auto; border-radius: var(--radius-md); display: grid; place-items: center; background: var(--bg-elevated); color: var(--text-secondary); }
    .head .icon svg { width: 22px; height: 22px; fill: currentColor; }
    .head .id { min-width: 0; flex: 1; }
    .head h2 { margin: 0; font-size: 16px; font-weight: 650; display: flex; align-items: center; gap: 8px; }
    .head .model { font-size: 11.5px; color: var(--text-secondary); font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
    .tag { font-size: 9.5px; font-weight: 700; letter-spacing: .04em; padding: 1px 5px; border-radius: var(--radius-xs); background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border-subtle); text-transform: uppercase; }
    .icon-btn { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer; }
    .icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
    .icon-btn svg { fill: currentColor; }

    .tabs { display: flex; gap: 2px; padding: 8px 12px 0; border-bottom: 1px solid var(--border-subtle); }
    .tabs button { padding: 8px 14px; border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; }
    .tabs button:hover { color: var(--text-primary); }
    .tabs button.active { color: var(--mui-accent); border-bottom-color: var(--mui-accent); }

    .body { padding: 18px; overflow-y: auto; }

    .health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .stat { background: var(--bg-base); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 11px 13px; }
    .stat .k { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
    .stat .v { font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; margin-top: 3px; }

    .verdict { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: var(--radius-full); font-weight: 600; margin-bottom: 14px; }
    .verdict .dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
    .verdict.ok { color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
    .verdict.bad { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
    .verdict.unknown { color: var(--text-secondary); background: var(--bg-elevated); }

    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border-subtle); }
    th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tr.flagged td { color: var(--danger); }
    tr.failed-now td { background: color-mix(in srgb, var(--danger) 10%, transparent); }

    .muted { color: var(--text-muted); }
    .empty { color: var(--text-muted); padding: 14px 2px; }

    .progress { height: 8px; border-radius: var(--radius-full); background: var(--bg-elevated); overflow: hidden; margin: 8px 0; }
    .progress > span { display: block; height: 100%; background: var(--mui-accent); }

    .field { margin-bottom: 15px; }
    .field label { display: block; font: 600 11px var(--font-sans); text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); margin-bottom: 6px; }
    .field select, .field input { width: 100%; height: 34px; padding: 0 10px; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: var(--radius-sm); color: var(--text-primary); font: inherit; box-sizing: border-box; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

    .foot { padding: 12px 18px; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .foot .right { display: flex; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 13px; border-radius: var(--radius-sm); border: 1px solid transparent; font: 500 13px var(--font-sans); cursor: pointer; }
    .btn:disabled { opacity: .5; cursor: default; }
    .btn-primary { background: var(--mui-accent); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--mui-accent-hover); }
    .btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-default); }
    .btn-ghost:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
    .btn-ghost.danger { color: var(--danger); }
    .link { color: var(--text-secondary); font-size: 12px; text-decoration: none; }
    .link:hover { color: var(--mui-accent); text-decoration: underline; }
  `;

  @property({ type: Object }) device!: MainDevice;
  @property({ type: String }) csrf = '';
  @property({ attribute: false }) resync: () => void = () => {};

  @state() private _smart: MainSmartInfo | null = null;
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _tab: Tab = 'health';
  @state() private _busy = false;
  @state() private _draft: Record<string, string> = {};

  private _pollTimer: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopPoll();
  }

  private _url(extra = ''): string {
    return `${SMART_ENDPOINT}?name=${encodeURIComponent(this.device.name)}${extra}`;
  }

  private async _load(wake = false): Promise<void> {
    this._loading = true;
    this._error = '';
    try {
      const r = await fetch(this._url(wake ? '&wake=1' : ''), { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this._smart = (await r.json()) as MainSmartInfo;
      this._seedDraft();
      this._maybePoll();
    } catch (e) {
      this._error = e instanceof Error ? e.message : 'failed to load SMART data';
    } finally {
      this._loading = false;
    }
  }

  private _seedDraft(): void {
    const s = this._smart?.settings;
    this._draft = {
      spindown: this.device.spindownDelay ?? '-1',
      hotTemp: s?.hotTemp ?? '',
      maxTemp: s?.maxTemp ?? '',
      smSelect: s?.smSelect ?? '-1',
      smLevel: s?.smLevel ?? '-1',
    };
  }

  private _maybePoll(): void {
    if (this._smart?.selfTest?.status.inProgress) this._startPoll();
    else this._stopPoll();
  }

  private _startPoll(): void {
    if (this._pollTimer !== null) return;
    this._pollTimer = window.setInterval(() => void this._pollOnce(), POLL_MS);
  }

  private _stopPoll(): void {
    if (this._pollTimer !== null) {
      window.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // Cheap status-only refresh while a self-test runs (never wakes the disk).
  private async _pollOnce(): Promise<void> {
    try {
      const r = await fetch(this._url('&fields=selftest'), { credentials: 'same-origin' });
      if (!r.ok) return;
      const fresh = (await r.json()) as MainSmartInfo;
      if (fresh.standby || !fresh.selfTest?.status.inProgress) {
        // Done (or disk went back to standby) → full refresh, stop polling.
        this._stopPoll();
        void this._load();
        return;
      }
      if (this._smart) this._smart = { ...this._smart, selfTest: fresh.selfTest };
    } catch {
      /* transient; keep polling */
    }
  }

  private async _runTest(action: A.SelfTestAction): Promise<void> {
    this._busy = true;
    try {
      await A.submit(A.buildSelfTest(this.device.name, action), this.csrf);
    } finally {
      this._busy = false;
    }
    // A test wakes the disk; give smartd a beat, then refresh + begin polling.
    window.setTimeout(() => void this._load(true), 1500);
  }

  private async _saveSettings(): Promise<void> {
    this._busy = true;
    try {
      if (
        this.device.idx !== null &&
        this._draft.spindown !== (this.device.spindownDelay ?? '-1')
      ) {
        await A.submit(A.buildSpindownDelay(this.device.idx, this._draft.spindown), this.csrf);
      }
      await A.submit(
        A.buildSmartSettings({
          id: this.device.id,
          hotTemp: this._draft.hotTemp,
          maxTemp: this._draft.maxTemp,
          smSelect: this._draft.smSelect,
          smLevel: this._draft.smLevel,
          // pass through the controller-type config so we don't clobber it
          smType: this._smart?.settings?.smType ?? undefined,
          smCustom: this._smart?.settings?.smCustom ?? undefined,
        }),
        this.csrf,
      );
    } finally {
      this._busy = false;
    }
    this.resync();
    void this._load();
  }

  private _close(): void {
    this.dispatchEvent(new CustomEvent('main-detail-close', { bubbles: true, composed: true }));
  }

  private _set(key: string, v: string): void {
    this._draft = { ...this._draft, [key]: v };
  }

  render() {
    const d = this.device;
    const iconKey =
      d.deviceType === 'nvme'
        ? 'nvme'
        : d.deviceType === 'ssd'
          ? 'ssd'
          : d.deviceType === 'usb'
            ? 'usb'
            : 'harddisk';
    return html`
      <div class="backdrop" @click=${(e: Event) => {
        if (e.target === e.currentTarget) this._close();
      }}>
        <div class="modal" role="dialog" aria-modal="true" aria-label="Drive info: ${d.name}">
          <header class="head">
            <span class="icon">${icon(iconKey, 22)}</span>
            <span class="id">
              <h2>${d.name} <span class="tag">${d.deviceType.toUpperCase()}</span></h2>
              <div class="model" title=${d.model}>${d.model || '—'}${d.serial ? ` · ${d.serial}` : ''}</div>
            </span>
            <button class="icon-btn" aria-label="Close" @click=${this._close}>${icon('close', 18)}</button>
          </header>

          <nav class="tabs">
            ${this._tabButton('health', 'Health')}
            ${this._tabButton('attributes', 'Attributes')}
            ${this._tabButton('selftest', 'Self-test')}
            ${this._tabButton('errors', 'Errors')}
            ${this._tabButton('settings', 'Settings')}
          </nav>

          <div class="body">${this._renderBody()}</div>

          <footer class="foot">
            <a class="link" href=${d.detailHref}>Open stock device page ↗</a>
            <div class="right">
              <button class="btn btn-ghost" @click=${this._close}>Close</button>
            </div>
          </footer>
        </div>
      </div>
    `;
  }

  private _tabButton(tab: Tab, label: string): TemplateResult {
    return html`<button class=${this._tab === tab ? 'active' : ''} @click=${() => {
      this._tab = tab;
    }}>${label}</button>`;
  }

  private _renderBody(): TemplateResult {
    if (this._loading) return html`<p class="empty">Reading SMART data…</p>`;
    if (this._error) return html`<p class="empty">Could not read SMART data: ${this._error}</p>`;
    const s = this._smart;
    if (!s) return html`<p class="empty">No data.</p>`;

    if (s.supported === false) {
      const why =
        s.reason === 'flash'
          ? 'This is the USB boot device — it has no useful SMART data.'
          : 'No device is attached to this slot.';
      return html`<p class="empty">${why}</p>`;
    }
    if (s.standby) {
      return html`
        <p class="empty">This disk is spun down. Viewing SMART data will spin it back up.</p>
        <button class="btn btn-primary" @click=${() => void this._load(true)}>Wake &amp; read SMART</button>
      `;
    }

    switch (this._tab) {
      case 'attributes':
        return this._renderAttributes(s);
      case 'selftest':
        return this._renderSelfTest(s);
      case 'errors':
        return this._renderErrors(s);
      case 'settings':
        return this._renderSettings();
      default:
        return this._renderHealth(s);
    }
  }

  private _renderHealth(s: MainSmartInfo): TemplateResult {
    const v = s.health?.failed ? 'bad' : s.health?.passed ? 'ok' : 'unknown';
    const label = s.health?.failed
      ? 'SMART status: FAILING'
      : s.health?.passed
        ? 'SMART status: Passed'
        : 'SMART status: Unknown';
    const id = s.identity;
    const stat = (k: string, val: string) =>
      html`<div class="stat"><div class="k">${k}</div><div class="v">${val}</div></div>`;
    return html`
      <div class="verdict ${v}"><span class="dot"></span>${label}</div>
      <div class="health-grid">
        ${stat('Temperature', formatTemp(s.temperatureC ?? null))}
        ${stat('Power-on hours', s.powerOnHours != null ? s.powerOnHours.toLocaleString() : '—')}
        ${stat('Power cycles', s.powerCycleCount != null ? s.powerCycleCount.toLocaleString() : '—')}
        ${stat('Capacity', formatBytes(id?.capacityBytes ?? null))}
        ${stat('Type', id && id.rotationRate > 0 ? `${id.rotationRate.toLocaleString()} RPM` : 'Solid state')}
        ${id?.firmware ? stat('Firmware', id.firmware) : nothing}
        ${s.class === 'nvme' && s.nvme?.percentageUsed != null ? stat('NVMe wear', `${s.nvme.percentageUsed}%`) : nothing}
        ${s.class === 'nvme' && s.nvme?.availableSpare != null ? stat('Spare', `${s.nvme.availableSpare}%`) : nothing}
      </div>
    `;
  }

  private _renderAttributes(s: MainSmartInfo): TemplateResult {
    if (s.class === 'nvme') {
      const n = s.nvme;
      if (!n) return html`<p class="empty">No NVMe health data.</p>`;
      const rows: [string, string][] = [
        ['Critical warning', String(n.criticalWarning)],
        ['Available spare', n.availableSpare != null ? `${n.availableSpare}%` : '—'],
        [
          'Spare threshold',
          n.availableSpareThreshold != null ? `${n.availableSpareThreshold}%` : '—',
        ],
        ['Percentage used', n.percentageUsed != null ? `${n.percentageUsed}%` : '—'],
        ['Media errors', n.mediaErrors != null ? n.mediaErrors.toLocaleString() : '—'],
        ['Unsafe shutdowns', n.unsafeShutdowns != null ? n.unsafeShutdowns.toLocaleString() : '—'],
      ];
      return html`<table><tbody>${rows.map(
        ([k, val]) => html`<tr><td>${k}</td><td class="num">${val}</td></tr>`,
      )}</tbody></table>`;
    }
    const attrs = s.attributes ?? [];
    if (attrs.length === 0)
      return html`<p class="empty">No SMART attributes reported (SAS/SCSI or unsupported).</p>`;
    return html`
      <table>
        <thead>
          <tr><th>ID</th><th>Attribute</th><th class="num">Value</th><th class="num">Worst</th><th class="num">Thresh</th><th class="num">Raw</th></tr>
        </thead>
        <tbody>${attrs.map((a) => this._attrRow(a))}</tbody>
      </table>
    `;
  }

  private _attrRow(a: SmartAttribute): TemplateResult {
    const failedNow = a.whenFailed === 'now';
    const flagged = KEY_ATTRS.has(a.id) && (a.raw ?? 0) > 0;
    const cls = failedNow ? 'failed-now' : flagged ? 'flagged' : '';
    return html`<tr class=${cls}>
      <td class="num">${a.id}</td>
      <td>${a.name.replace(/_/g, ' ')}</td>
      <td class="num">${a.value ?? '—'}</td>
      <td class="num">${a.worst ?? '—'}</td>
      <td class="num">${a.thresh ?? '—'}</td>
      <td class="num">${a.rawString || a.raw || '0'}</td>
    </tr>`;
  }

  private _renderSelfTest(s: MainSmartInfo): TemplateResult {
    const st = s.selfTest?.status;
    const log = s.selfTest?.log ?? [];
    const running = st?.inProgress ?? false;
    return html`
      <div style="margin-bottom:14px">
        ${
          running
            ? html`
              <div>Self-test in progress — ${st?.remainingPercent != null ? `${100 - st.remainingPercent}% complete` : 'running'}</div>
              ${st?.remainingPercent != null ? html`<div class="progress"><span style=${`width:${100 - st.remainingPercent}%`}></span></div>` : nothing}
              <button class="btn btn-ghost danger" ?disabled=${this._busy} @click=${() => void this._runTest('abort')}>Abort test</button>
            `
            : html`
              <div class="muted" style="margin-bottom:8px">${st?.string || 'No test running.'}</div>
              <button class="btn btn-primary" ?disabled=${this._busy} @click=${() => void this._runTest('short')}>Run short test</button>
              <button class="btn btn-ghost" ?disabled=${this._busy} @click=${() => void this._runTest('extended')}>Run extended test</button>
            `
        }
      </div>
      ${
        log.length === 0
          ? html`<p class="empty">No self-test history.</p>`
          : html`<table>
              <thead><tr><th>Test</th><th>Result</th><th class="num">Lifetime (h)</th></tr></thead>
              <tbody>${log.map(
                (e) =>
                  html`<tr><td>${e.type || '—'}</td><td>${e.status || '—'}</td><td class="num">${e.lifetimeHours ?? '—'}</td></tr>`,
              )}</tbody>
            </table>`
      }
    `;
  }

  private _renderErrors(s: MainSmartInfo): TemplateResult {
    const d = this.device;
    const statusNote =
      d.status === 'disabled'
        ? 'This disk is disabled (red-balled) — the array is operating without it.'
        : d.status === 'unmountable'
          ? 'Filesystem is unmountable.'
          : d.status === 'missing'
            ? 'Device is missing.'
            : null;
    const log = s.errorLog;
    return html`
      <div class="health-grid" style="margin-bottom:14px">
        <div class="stat"><div class="k">Read errors (array)</div><div class="v" style=${(d.numErrors ?? 0) > 0 ? 'color:var(--danger)' : ''}>${d.numErrors ?? 0}</div></div>
        <div class="stat"><div class="k">SMART error log</div><div class="v" style=${(log?.count ?? 0) > 0 ? 'color:var(--danger)' : ''}>${log?.count ?? 0}</div></div>
      </div>
      ${statusNote ? html`<div class="verdict bad" style="margin-bottom:14px"><span class="dot"></span>${statusNote}</div>` : nothing}
      ${
        log && log.entries.length > 0
          ? html`<table>
              <thead><tr><th class="num">Lifetime (h)</th><th>Description</th></tr></thead>
              <tbody>${log.entries.map(
                (e) =>
                  html`<tr><td class="num">${e.lifetimeHours ?? '—'}</td><td>${e.description}</td></tr>`,
              )}</tbody>
            </table>`
          : html`<p class="empty">No SMART error-log entries.</p>`
      }
    `;
  }

  private _renderSettings(): TemplateResult {
    const canSpindown = this.device.idx !== null;
    return html`
      <div class="field">
        <label>Spin-down delay</label>
        <select ?disabled=${!canSpindown} .value=${this._draft.spindown ?? '-1'}
          @change=${(e: Event) => this._set('spindown', (e.target as HTMLSelectElement).value)}>
          ${SPINDOWN_OPTS.map(([v, label]) => html`<option value=${v} ?selected=${(this._draft.spindown ?? '-1') === v}>${label}</option>`)}
        </select>
      </div>
      <div class="row2">
        <div class="field">
          <label>Warning temp (°C)</label>
          <input type="number" min="0" max="300" .value=${this._draft.hotTemp ?? ''}
            @input=${(e: Event) => this._set('hotTemp', (e.target as HTMLInputElement).value)}>
        </div>
        <div class="field">
          <label>Critical temp (°C)</label>
          <input type="number" min="0" max="300" .value=${this._draft.maxTemp ?? ''}
            @input=${(e: Event) => this._set('maxTemp', (e.target as HTMLInputElement).value)}>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label>SMART notification value</label>
          <select .value=${this._draft.smSelect ?? '-1'}
            @change=${(e: Event) => this._set('smSelect', (e.target as HTMLSelectElement).value)}>
            <option value="-1">Use default</option>
            <option value="0">Raw</option>
            <option value="1">Normalized</option>
          </select>
        </div>
        <div class="field">
          <label>Notification tolerance</label>
          <select .value=${this._draft.smLevel ?? '-1'}
            @change=${(e: Event) => this._set('smLevel', (e.target as HTMLSelectElement).value)}>
            <option value="-1">Use default</option>
            <option value="1.00">Absolute</option>
            <option value="1.05">5%</option>
            <option value="1.10">10%</option>
            <option value="1.15">15%</option>
            <option value="1.20">20%</option>
            <option value="1.25">25%</option>
            <option value="1.50">50%</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" ?disabled=${this._busy} @click=${() => void this._saveSettings()}>Save settings</button>
    `;
  }
}
