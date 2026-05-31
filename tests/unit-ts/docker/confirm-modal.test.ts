import { html, render } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../src/ts/docker/components/md-docker-confirm-modal';
import type { MdDockerConfirmModal } from '../../../src/ts/docker/components/md-docker-confirm-modal';

const flush = () => new Promise((r) => setTimeout(r, 0));

// Track mounted hosts and tear them down via remove() (not innerHTML = '') so
// the component's disconnectedCallback fires and its window keydown listener is
// detached — otherwise jsdom leaks listeners across tests.
const hosts: HTMLDivElement[] = [];

async function mount(
  props: Partial<Pick<MdDockerConfirmModal, 'heading' | 'message' | 'confirmLabel' | 'tone'>> = {},
): Promise<{ el: MdDockerConfirmModal; host: HTMLDivElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  render(
    html`<md-docker-confirm-modal
      .heading=${props.heading ?? 'Are you sure?'}
      .message=${props.message ?? 'Body text'}
      .confirmLabel=${props.confirmLabel ?? 'Confirm'}
      .tone=${props.tone ?? 'primary'}
    ></md-docker-confirm-modal>`,
    host,
  );
  await flush();
  const el = host.querySelector('md-docker-confirm-modal') as MdDockerConfirmModal;
  await el.updateComplete;
  return { el, host };
}

const q = (el: MdDockerConfirmModal, sel: string) =>
  el.shadowRoot!.querySelector<HTMLElement>(sel)!;

describe('md-docker-confirm-modal', () => {
  afterEach(() => {
    while (hosts.length) {
      const host = hosts.pop()!;
      // Empty the host first (disconnects the lit-rendered modal child), then
      // detach the host itself.
      host.querySelector('md-docker-confirm-modal')?.remove();
      host.remove();
    }
  });

  it('clicking the action button emits a single composed "confirm"', async () => {
    const { el } = await mount();
    const confirms: Event[] = [];
    const cancels: Event[] = [];
    el.addEventListener('confirm', (e) => confirms.push(e));
    el.addEventListener('cancel', (e) => cancels.push(e));

    q(el, '.btn-action').click();

    expect(confirms).toHaveLength(1);
    expect(cancels).toHaveLength(0);
    expect((confirms[0] as CustomEvent).composed).toBe(true);
  });

  it('Cancel button emits "cancel"', async () => {
    const { el } = await mount();
    let cancelled = false;
    el.addEventListener('cancel', () => {
      cancelled = true;
    });

    q(el, '.btn-ghost').click();

    expect(cancelled).toBe(true);
  });

  it('X (close) button emits "cancel"', async () => {
    const { el } = await mount();
    let cancelled = false;
    el.addEventListener('cancel', () => {
      cancelled = true;
    });

    q(el, '.icon-btn').click();

    expect(cancelled).toBe(true);
  });

  it('backdrop click emits "cancel", but a click inside the modal does not', async () => {
    const { el } = await mount();
    let cancels = 0;
    el.addEventListener('cancel', () => {
      cancels++;
    });

    // Click inside the surface — should NOT cancel.
    q(el, '.modal').click();
    expect(cancels).toBe(0);

    // Click the backdrop itself — should cancel.
    q(el, '.backdrop').click();
    expect(cancels).toBe(1);
  });

  it('Escape emits "cancel"', async () => {
    const { el } = await mount();
    let cancelled = false;
    el.addEventListener('cancel', () => {
      cancelled = true;
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelled).toBe(true);
  });

  it('removes its global key listener once disconnected', async () => {
    const { el, host } = await mount();
    let cancels = 0;
    el.addEventListener('cancel', () => {
      cancels++;
    });

    host.remove();
    await flush();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancels).toBe(0);
  });

  // Assert which button receives focus by spying on HTMLElement.prototype.focus
  // rather than reading shadowRoot.activeElement, which jsdom does not track
  // reliably for elements inside a shadow root.
  it('primary tone autofocuses the action button (Enter confirms)', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    const { el } = await mount({ tone: 'primary' });
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy.mock.instances[0]).toBe(q(el, '.btn-action'));
    focusSpy.mockRestore();
  });

  it('danger tone autofocuses Cancel, not the destructive action', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    const { el } = await mount({ tone: 'danger' });
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy.mock.instances[0]).toBe(q(el, '.btn-ghost'));
    focusSpy.mockRestore();
  });
});
