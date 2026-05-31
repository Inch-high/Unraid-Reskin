import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon, type IconName } from '../icons';

// Lightweight styled replacement for the native window.confirm() dialog. The
// page owns the decision flow — this component is purely presentational and
// emits a single 'confirm' or 'cancel' event. Backdrop click, the X button,
// the Cancel button and Escape all resolve to 'cancel'; only the action button
// resolves to 'confirm'.
//
// Styling mirrors md-main-device-detail / md-docker-folder-modal so it sits in
// the same visual family as the rest of the modal set.
@customElement('md-docker-confirm-modal')
export class MdDockerConfirmModal extends LitElement {
  static styles = css`
    :host { display: contents; }
    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      display: grid; place-items: center; z-index: 110;
    }
    .modal {
      width: min(440px, 92vw);
      background: var(--bg-surface); border: 1px solid var(--border-default);
      border-radius: var(--radius-lg); display: flex; flex-direction: column;
      overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.5);
      color: var(--text-primary); font-size: 13px;
    }
    .head { display: flex; align-items: center; gap: 12px; padding: 15px 18px; border-bottom: 1px solid var(--border-subtle); }
    .head .icon { width: 36px; height: 36px; flex: 0 0 auto; border-radius: var(--radius-md); display: grid; place-items: center; background: var(--bg-elevated); color: var(--text-secondary); }
    .head.danger .icon { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
    .head .icon svg { width: 20px; height: 20px; }
    .head h2 { margin: 0; flex: 1; min-width: 0; font-size: 15px; font-weight: 650; }
    .icon-btn { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer; }
    .icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }

    .body { padding: 16px 18px; color: var(--text-secondary); line-height: 1.5; }

    .foot { padding: 12px 18px; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 15px; border-radius: var(--radius-sm); border: 1px solid transparent; font: 500 13px var(--font-sans); cursor: pointer; }
    .btn:disabled { opacity: .5; cursor: default; }
    .btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-default); }
    .btn-ghost:hover { background: var(--bg-elevated); color: var(--text-primary); }
    .btn-primary { background: var(--mui-accent); color: #fff; }
    .btn-primary:hover { background: var(--mui-accent-hover); }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: color-mix(in srgb, var(--danger) 86%, #fff); }
  `;

  @property({ type: String }) heading = 'Are you sure?';
  @property({ type: String }) message = '';
  @property({ type: String }) confirmLabel = 'Confirm';
  @property({ type: String }) cancelLabel = 'Cancel';
  @property({ type: String }) tone: 'primary' | 'danger' = 'primary';
  @property({ type: String }) iconName: IconName = 'update';

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this._onKey);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._onKey);
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._cancel();
    }
  };

  private _confirm(): void {
    this.dispatchEvent(new CustomEvent('confirm', { bubbles: true, composed: true }));
  }
  private _cancel(): void {
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  // Autofocus on open. For primary tone the action button is focused so Enter
  // confirms (mirroring native confirm()). For destructive (danger) actions we
  // focus Cancel instead, so an accidental Enter doesn't trigger an irreversible
  // remove — the safer default for a destructive confirmation.
  firstUpdated(): void {
    const selector = this.tone === 'danger' ? '.btn-ghost' : '.btn-action';
    this.renderRoot.querySelector<HTMLButtonElement>(selector)?.focus();
  }

  render() {
    const danger = this.tone === 'danger';
    return html`
      <div class="backdrop" @click=${(e: Event) => {
        if (e.target === e.currentTarget) this._cancel();
      }}>
        <div class="modal" role="alertdialog" aria-modal="true" aria-label=${this.heading}>
          <header class="head ${danger ? 'danger' : ''}">
            <span class="icon">${icon(this.iconName, 20)}</span>
            <h2>${this.heading}</h2>
            <button class="icon-btn" aria-label="Close" @click=${this._cancel}>${icon('x', 18)}</button>
          </header>
          <div class="body">${this.message}</div>
          <footer class="foot">
            <button class="btn btn-ghost" @click=${this._cancel}>${this.cancelLabel}</button>
            <button class="btn btn-action ${danger ? 'btn-danger' : 'btn-primary'}" @click=${this._confirm}>
              ${this.confirmLabel}
            </button>
          </footer>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'md-docker-confirm-modal': MdDockerConfirmModal;
  }
}
