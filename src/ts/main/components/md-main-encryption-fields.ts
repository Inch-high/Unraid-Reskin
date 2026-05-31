import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { EncryptionState } from '../types';
import { isValidPassphrase } from '../actions';

// Stopped-state encrypted-array key entry. Reproduces check_encryption() /
// selectInput() from ArrayOperation.page. Holds its own entry state and exposes
// it via getKeyEntry(); emits 'enc-change' so the operation panel can re-gate
// the Start button. Rendered only when mode ∈ {enter-new,missing-key,wrong-key}.
//
// "permit reformat" is data-destructive and therefore GUARDED: default off;
// ticking it reveals an inline warning + a retype field + a SECOND explicit
// acknowledgement checkbox; the entry is not `valid` (so Start stays disabled)
// until that acknowledgement is given. Stricter than stock by design.

export interface KeyEntry {
  passphrase?: string;
  keyfileDataUrl?: string;
  reformat: boolean;
  valid: boolean;
}

@customElement('md-main-encryption-fields')
export class MdMainEncryptionFields extends LitElement {
  static styles = css`
    :host { display: block; margin: 6px 0 2px; }
    .grid { display: grid; grid-template-columns: 160px 1fr; gap: 8px 12px; align-items: center; max-width: 620px; }
    label { font-size: 13px; color: var(--text-secondary); }
    .status { color: var(--danger); font-weight: 600; }
    select, input[type="password"], input[type="text"] {
      background: var(--bg-base); color: var(--text-primary);
      border: 1px solid var(--border-default); border-radius: var(--radius-sm);
      padding: 5px 8px; font: inherit; min-width: 220px;
    }
    .row { display: flex; align-items: center; gap: 8px; }
    .check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
    .warn {
      grid-column: 1 / -1; margin-top: 4px; padding: 8px 10px;
      border-radius: var(--radius-sm); font-size: 12.5px;
      background: color-mix(in srgb, var(--danger) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
      color: var(--danger);
    }
    .danger-ack { color: var(--danger); font-weight: 600; }
    button.link {
      background: none; border: none; color: var(--mui-accent); cursor: pointer;
      font: inherit; text-decoration: underline; padding: 0;
    }
    .mismatch { color: var(--warning); font-size: 12px; grid-column: 2; }
  `;

  @property({ type: Object }) encryption!: EncryptionState;

  @state() private _method: 'text' | 'file' = 'text';
  @state() private _pass = '';
  @state() private _retype = '';
  @state() private _show = false;
  @state() private _keyfileDataUrl = '';
  @state() private _reformat = false;
  @state() private _reformatAck = false;

  // Public: current entry + whether it satisfies the gate. The operation panel
  // reads this on Start click and uses `.valid` to enable the button.
  getKeyEntry(): KeyEntry {
    const reformat = this._allowsReformat && this._reformat;
    let valid: boolean;
    if (this._method === 'text') {
      valid = isValidPassphrase(this._pass) && (!reformat || this._pass === this._retype);
    } else {
      valid = this._keyfileDataUrl.length > 0;
    }
    if (reformat) valid = valid && this._reformatAck; // second explicit confirmation
    return {
      passphrase: this._method === 'text' ? this._pass : undefined,
      keyfileDataUrl: this._method === 'file' ? this._keyfileDataUrl : undefined,
      reformat,
      valid,
    };
  }

  // "permit reformat" only offered for the wrong-key case (matches stock #pass).
  private get _allowsReformat(): boolean {
    return this.encryption?.mode === 'wrong-key';
  }

  private _emit(): void {
    this.dispatchEvent(new CustomEvent('enc-change', { bubbles: true, composed: true }));
  }

  private _onMethod(e: Event): void {
    this._method = (e.target as HTMLSelectElement).value as 'text' | 'file';
    this._emit();
  }
  private _onPass(e: Event): void {
    this._pass = (e.target as HTMLInputElement).value;
    this._emit();
  }
  private _onRetype(e: Event): void {
    this._retype = (e.target as HTMLInputElement).value;
    this._emit();
  }
  private _onShow(e: Event): void {
    this._show = (e.target as HTMLInputElement).checked;
  }
  private _onReformat(e: Event): void {
    this._reformat = (e.target as HTMLInputElement).checked;
    if (!this._reformat) this._reformatAck = false;
    this._emit();
  }
  private _onReformatAck(e: Event): void {
    this._reformatAck = (e.target as HTMLInputElement).checked;
    this._emit();
  }
  private _onFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this._keyfileDataUrl = '';
      this._emit();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this._keyfileDataUrl = String(reader.result ?? '');
      this._emit();
    };
    reader.readAsDataURL(file);
  }

  private _statusLabel(): string {
    switch (this.encryption?.mode) {
      case 'enter-new':
        return 'Enter new key';
      case 'missing-key':
        return 'Missing key';
      case 'wrong-key':
        return 'Wrong key';
      default:
        return '';
    }
  }

  render() {
    const reformat = this._allowsReformat && this._reformat;
    const mismatch =
      this._method === 'text' && reformat && this._retype.length > 0 && this._pass !== this._retype;
    return html`
      <div class="grid">
        <span>Encryption status:</span>
        <span class="status">${this._statusLabel()}</span>

        <label for="enc-method">Encryption input:</label>
        <select id="enc-method" @change=${this._onMethod}>
          <option value="text">Passphrase</option>
          <option value="file">Keyfile</option>
        </select>

        ${
          this._method === 'text'
            ? html`
            <label for="enc-pass">Passphrase:</label>
            <div class="row">
              <input id="enc-pass" type=${this._show ? 'text' : 'password'} maxlength="512"
                .value=${this._pass} @input=${this._onPass}
                placeholder="use printable characters only" autocomplete="off">
              <label class="check"><input type="checkbox" @change=${this._onShow}> show</label>
            </div>
            ${
              reformat
                ? html`<label for="enc-retype">Retype passphrase:</label>
                  <div class="row">
                    <input id="enc-retype" type=${this._show ? 'text' : 'password'} maxlength="512"
                      .value=${this._retype} @input=${this._onRetype} autocomplete="off">
                    ${mismatch ? html`<span class="mismatch">passphrases don't match</span>` : ''}
                  </div>`
                : ''
            }`
            : html`
            <label for="enc-file">Keyfile:</label>
            <input id="enc-file" type="file" @change=${this._onFile}>`
        }

        ${
          this._allowsReformat
            ? html`
            <span></span>
            <label class="check danger-ack">
              <input type="checkbox" .checked=${this._reformat} @change=${this._onReformat}>
              permit reformat (re-encrypt this device)
            </label>
            ${
              this._reformat
                ? html`
                <div class="warn">
                  ⚠ Reformatting <strong>permanently erases all data</strong> on the affected device(s)
                  and creates a new encrypted filesystem. This cannot be undone.
                </div>
                <span></span>
                <label class="check danger-ack">
                  <input type="checkbox" .checked=${this._reformatAck} @change=${this._onReformatAck}>
                  Yes — I understand this erases data and I want to reformat.
                </label>`
                : ''
            }`
            : ''
        }

        ${
          this.encryption?.keyfilePresent
            ? html`<span></span>
              <span><button class="link" @click=${this._onDeleteKeyfile}>Delete encryption keyfile</button></span>`
            : ''
        }
      </div>
    `;
  }

  private _onDeleteKeyfile(): void {
    this.dispatchEvent(new CustomEvent('enc-delete-keyfile', { bubbles: true, composed: true }));
  }
}
