import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import type { MainPageState, OrbColor } from '../types';
import { deriveOperation } from '../derive';
import * as A from '../actions';
import './md-main-encryption-fields';
import './md-main-parity-panel';
import './md-main-spin-controls';
import './md-main-power-panel';
import type { MdMainEncryptionFields } from './md-main-encryption-fields';

const ORB_VAR: Record<OrbColor, string> = {
  green: 'var(--success)',
  yellow: 'var(--warning)',
  red: 'var(--danger)',
  grey: 'var(--text-muted)',
};

function orbForMdColor(mdColor: string): OrbColor {
  if (mdColor.includes('blink')) return 'grey';
  if (mdColor.startsWith('green')) return 'green';
  if (mdColor.startsWith('yellow')) return 'yellow';
  if (mdColor.startsWith('red')) return 'red';
  return 'grey';
}

// The Array Operation panel — the most behaviour-critical surface. Start/Stop
// label/enabled/reason come from deriveOperation (the single source of truth);
// this component only adds the user-supplied gates (maintenance, confirmStart,
// encryption key, format confirm) and wires buttons to the stock endpoints via
// actions.ts. Hosts the parity, spin, and power sub-panels.
@customElement('md-main-operation-panel')
export class MdMainOperationPanel extends LitElement {
  static styles = css`
    :host { display: block; margin: 0 0 16px; }
    .card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; }
    section { padding: 14px 16px; border-top: 1px solid var(--border-subtle); }
    section:first-child { border-top: none; }
    h3 { margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
    .primary-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .orb { width: 11px; height: 11px; border-radius: 50%; background: var(--orb);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--orb) 20%, transparent); flex: 0 0 auto; }
    .state { font-weight: 650; color: var(--text-primary); }
    button.action {
      background: var(--mui-accent); color: #1a1205; border: none; border-radius: var(--radius-sm);
      padding: 7px 18px; font: inherit; font-weight: 600; cursor: pointer;
    }
    button.action.stop { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border-default); }
    button.action:disabled { opacity: .5; cursor: not-allowed; }
    .reason { font-size: 12.5px; color: var(--text-secondary); flex: 1 1 240px; }
    .gate { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
    .check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }
    .danger { color: var(--danger); }
    button.fmt { background: var(--danger); color: #fff; border: none; border-radius: var(--radius-sm); padding: 6px 14px; font: inherit; cursor: pointer; }
    button.fmt:disabled { opacity: .5; cursor: not-allowed; }
  `;

  @property({ type: Object }) state!: MainPageState;
  @property({ type: String }) csrf = '';
  @property({ attribute: false }) resync: () => void = () => {};

  @state() private _confirm = false;
  @state() private _maintenance = false;
  @state() private _formatConfirm = false;
  @state() private _encValid = false;

  @query('md-main-encryption-fields') private _encFields?: MdMainEncryptionFields;

  private get _missingPoolDisk(): boolean {
    return (this.state?.pools ?? []).some((p) => p.devices.some((d) => d.status === 'missing'));
  }
  private get _encryptionNeeded(): boolean {
    const m = this.state?.operation.encryption.mode;
    return m === 'enter-new' || m === 'missing-key' || m === 'wrong-key';
  }

  private async _run(req: A.ActionRequest): Promise<void> {
    await A.submit(req, this.csrf);
    this.resync();
  }

  private async _onStart(): Promise<void> {
    const op = this.state.operation;
    const primary = deriveOperation(op, { missingPoolDisk: this._missingPoolDisk });
    if (this._encryptionNeeded) {
      const entry = this._encFields?.getKeyEntry();
      if (!entry || !entry.valid) return;
      const res = await A.submitEncryptedStart(
        {
          start: {
            mdState: op.mdState,
            startMode: this._maintenance ? 'Maintenance' : 'Normal',
            confirmStart: primary.requiresConfirm ? this._confirm : false,
          },
          poolNames: op.encryption.poolNames,
          passphrase: entry.passphrase,
          keyfileDataUrl: entry.keyfileDataUrl,
          reformat: entry.reformat,
        },
        this.csrf,
      );
      if (!res.ok) {
        alert(
          res.error === 'wrong-pool-state'
            ? `Cannot start — pool state problem:\n${res.detail ?? ''}`
            : res.error === 'bad-passphrase'
              ? 'Passphrase must use printable ASCII characters only. Use the keyfile method for other characters.'
              : 'No encryption key supplied.',
        );
        return;
      }
      this.resync();
      return;
    }
    await this._run(
      A.buildStart({
        mdState: op.mdState,
        startMode: this._maintenance ? 'Maintenance' : 'Normal',
        confirmStart: primary.requiresConfirm ? this._confirm : false,
      }),
    );
  }

  private _onStop(): void {
    if (confirm('Stop the array? This will take the array offline.')) {
      void this._run(A.buildStop(this.state.operation.mdState));
    }
  }

  private _onFormat(): void {
    if (!this._formatConfirm) return;
    if (
      confirm(
        'Format will create a new filesystem on all Unmountable disks. ALL DATA on them will be lost. Continue?',
      )
    ) {
      void this._run(A.buildFormat(this.state.operation.unmountableMask));
    }
  }

  render() {
    const op = this.state?.operation;
    if (!op) return html``;
    const primary = deriveOperation(op, { missingPoolDisk: this._missingPoolDisk });
    const orb = orbForMdColor(op.mdColor);
    const isStart = primary.label === 'Start';
    const isStop = primary.label === 'Stop';
    const isCancel = primary.label === 'Cancel';

    // Effective enabled: deriveOperation disables Start for overridable gates
    // (confirm / encryption); re-enable once the user satisfies them. Hard
    // disables (config/ERROR — no confirm, no encryption) stay off.
    const hardDisabled = !primary.enabled && !primary.requiresConfirm && !this._encryptionNeeded;
    let enabled = primary.enabled;
    if (isStart && !hardDisabled) {
      enabled =
        (!primary.requiresConfirm || this._confirm) && (!this._encryptionNeeded || this._encValid);
    }

    const started = op.fsState === 'Started';
    const showFormat = started && op.unmountableMask !== '' && op.unmountableMask !== '0';

    return html`
      <div class="card">
        <section>
          <h3>Array</h3>
          <div class="primary-row">
            <span class="orb" style=${`--orb:${ORB_VAR[orb]}`}></span>
            <span class="state">${op.fsState}${op.startMode === 'Maintenance' && started ? ' — Maintenance' : ''}</span>
            ${
              isStop
                ? html`<button class="action stop" ?disabled=${!enabled} @click=${this._onStop}>Stop</button>`
                : isCancel
                  ? html`<button class="action" @click=${() => this._run(op.fsState === 'Clearing' ? { url: '/update.htm', params: { cmdNoClear: '' } } : { url: '/update.htm', params: { cmdNoCopy: '' } })}>Cancel</button>`
                  : html`<button class="action" ?disabled=${!enabled} @click=${this._onStart}>${primary.label}</button>`
            }
            ${primary.reason ? html`<span class="reason">${primary.reason}</span>` : ''}
          </div>

          ${
            isStart && !this._encryptionNeeded && primary.requiresConfirm
              ? html`<div class="gate"><label class="check danger">
                <input type="checkbox" .checked=${this._confirm}
                  @change=${(e: Event) => {
                    this._confirm = (e.target as HTMLInputElement).checked;
                  }}>
                Yes, I want to do this.</label></div>`
              : ''
          }

          ${
            isStart && primary.requiresMaintenanceField
              ? html`<div class="gate"><label class="check">
                <input type="checkbox" .checked=${this._maintenance}
                  @change=${(e: Event) => {
                    this._maintenance = (e.target as HTMLInputElement).checked;
                  }}>
                Maintenance mode (start array but do not mount disks)</label></div>`
              : ''
          }

          ${
            isStart && this._encryptionNeeded
              ? html`<md-main-encryption-fields .encryption=${op.encryption}
                @enc-change=${this._onEncChange}
                @enc-delete-keyfile=${() => this._run(A.buildDeleteKeyfile())}></md-main-encryption-fields>`
              : ''
          }

          ${
            showFormat
              ? html`<div class="gate">
                <button class="fmt" ?disabled=${!this._formatConfirm} @click=${this._onFormat}>Format</button>
                <label class="check danger"><input type="checkbox" .checked=${this._formatConfirm}
                  @change=${(e: Event) => {
                    this._formatConfirm = (e.target as HTMLInputElement).checked;
                  }}>
                  Format unmountable disk(s) — creates a new filesystem, erasing data.</label>
              </div>`
              : ''
          }
        </section>

        ${
          started || this.state.parity?.running
            ? html`<section><h3>Parity</h3>
              <md-main-parity-panel .parity=${this.state.parity} .operation=${op}
                .csrf=${this.csrf} .resync=${this.resync}></md-main-parity-panel></section>`
            : ''
        }

        ${
          started
            ? html`<section><h3>Disks</h3>
              <md-main-spin-controls .busy=${op.busy ?? 0} .csrf=${this.csrf} .resync=${this.resync}></md-main-spin-controls></section>`
            : ''
        }

        <section><h3>System</h3>
          <md-main-power-panel .moverEnabled=${op.moverEnabled && started} .moverRunning=${(op.busy ?? 0) === 2}
            .csrf=${this.csrf} .resync=${this.resync}></md-main-power-panel></section>
      </div>
    `;
  }

  private _onEncChange(): void {
    this._encValid = this._encFields?.getKeyEntry().valid ?? false;
  }
}
