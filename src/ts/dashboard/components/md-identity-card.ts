import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { IdentityState } from '../types';
import './md-card';

@customElement('md-identity-card')
export class MdIdentityCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
    }
    .left {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .description {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .clock {
      font-size: 13px;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      min-height: 18px;
    }
    .pair {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pair .label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pair .value {
      font-size: 14px;
      color: var(--text-primary);
      word-break: break-word;
    }
    .right {
      display: flex;
      justify-content: flex-end;
      align-items: flex-start;
    }
    .case {
      width: 96px;
      height: 96px;
      display: flex;
      justify-content: center;
      align-items: center;
      background: var(--bg-elevated);
      border-radius: var(--radius-md);
      color: var(--text-primary);
    }
    /* The case-* classes from default-cases.css (loaded via the <link> in
       render) provide the ::before content glyph; we size it here. Stock
       Unraid sizes its icon via i#mycase font-size, which is document-scoped
       and does not cross the shadow boundary. */
    .case > i {
      font-size: 72px;
      line-height: 1;
    }
    .case-empty {
      width: 96px;
      height: 96px;
      background: var(--bg-elevated);
      border-radius: var(--radius-md);
    }
  `;

  @property({ type: Object }) state: IdentityState = {
    kind: 'identity',
    serverName: '',
    description: '',
    model: '',
    registration: '',
    uptimeText: '',
    caseClass: null,
  };

  render() {
    const s = this.state;
    return html`
      <!-- Pull Unraid's case-icon ::before rules into this shadow root. The
           "cases" icon font is already loaded at the document level (font
           resources cross the shadow boundary), but ::before { content }
           rules do not - they're document-scoped. Without this link the
           <i class="case-XXX"> below stays 0x0 with no glyph. -->
      <link rel="stylesheet" href="/webGui/styles/default-cases.css">
      <md-card cardTitle=${s.serverName} meta=${s.registration}>
        <div class="grid">
          <div class="left">
            ${s.description ? html`<span class="description">${s.description}</span>` : ''}
            <div class="clock"></div>
            <div class="pair">
              <span class="label">Model</span>
              <span class="value">${s.model || '—'}</span>
            </div>
            <div class="pair">
              <span class="label">Registration</span>
              <span class="value">${s.registration || '—'}</span>
            </div>
            <div class="pair">
              <span class="label">Uptime</span>
              <span class="value">${s.uptimeText || '—'}</span>
            </div>
          </div>
          <div class="right">
            ${s.caseClass
              ? html`<div class="case"><i class=${s.caseClass}></i></div>`
              : html`<div class="case-empty"></div>`}
          </div>
        </div>
      </md-card>
    `;
  }
}
