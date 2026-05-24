import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UnknownWidget } from '../types';
import './md-card';

@customElement('md-plugin-card')
export class MdPluginCard extends LitElement {
  static styles = css`
    :host { display: contents; }
    .mirror {
      /* Original Unraid CSS classes still apply because outer modernui.css is global */
    }
  `;

  @property({ type: Object }) state: UnknownWidget = {
    kind: 'unknown',
    id: '',
    hint: '',
    innerHTML: '',
  };

  render() {
    const title = this.state.hint || this.state.id || 'Plugin';
    return html`
      <md-card .cardTitle=${title} meta="plugin">
        <div class="mirror" .innerHTML=${this.state.innerHTML}></div>
      </md-card>
    `;
  }
}
