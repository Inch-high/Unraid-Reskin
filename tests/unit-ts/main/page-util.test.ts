import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../../src/ts/main/components/md-main-page';
import type { ModernuiMainPage } from '../../../src/ts/main/components/md-main-page';
import { createMainStore } from '../../../src/ts/main/store';
import type { MainPageState } from '../../../src/ts/main/types';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dir, '../../../src/ts/main/__fixtures__/main-state.sample.json'), 'utf8'),
) as MainPageState;

afterEach(() => {
  delete document.documentElement.dataset.modernuiMainUtil;
  (window as { csrf_token?: string }).csrf_token = undefined;
  vi.unstubAllGlobals();
});

async function mountPage(): Promise<ModernuiMainPage> {
  const store = createMainStore();
  store.setState(fixture);
  const el = document.createElement('modernui-main-page') as ModernuiMainPage;
  document.body.appendChild(el);
  el.setStore(store);
  await el.updateComplete;
  return el;
}

describe('modernui-main-page — disk usage style', () => {
  it('threads util="ring" to the cards when the dataset attribute is set', async () => {
    document.documentElement.dataset.modernuiMainUtil = 'ring';
    const el = await mountPage();
    const array = el.shadowRoot!.querySelector('md-main-array-card') as { util?: string };
    expect(array.util).toBe('ring');
    expect(el.shadowRoot!.querySelector('md-main-capacity-hero')).not.toBeNull();
  });

  it('defaults to util="bar" when the attribute is absent', async () => {
    const el = await mountPage();
    const array = el.shadowRoot!.querySelector('md-main-array-card') as { util?: string };
    expect(array.util).toBe('bar');
  });

  it('in-page toggle flips every card to ring and persists via save.php', async () => {
    (window as { csrf_token?: string }).csrf_token = 'TESTCSRF';
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: { body: string }) => {
        calls.push({ url, body: opts.body });
        return { ok: true };
      }),
    );

    const el = await mountPage(); // default bar
    const ringBtn = [...el.shadowRoot!.querySelectorAll('.seg button')].find(
      (b) => b.textContent?.trim() === 'Ring',
    ) as HTMLButtonElement;
    ringBtn.click();
    await el.updateComplete;

    const array = el.shadowRoot!.querySelector('md-main-array-card') as { util?: string };
    expect(array.util).toBe('ring'); // tiles flipped in place
    expect(document.documentElement.dataset.modernuiMainUtil).toBe('ring');
    expect(calls).toHaveLength(1); // persisted once
    expect(calls[0].url).toContain('/include/save.php');
    expect(calls[0].body).toContain('main_util_style=ring');
    expect(calls[0].body).toContain('csrf_token=TESTCSRF');
  });

  it('prefers the snapshot csrfToken over the page global when both are present', async () => {
    (window as { csrf_token?: string }).csrf_token = 'GLOBALCSRF';
    const calls: Array<{ body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, opts: { body: string }) => {
        calls.push({ body: opts.body });
        return { ok: true };
      }),
    );

    // Snapshot carries its own (authoritative) token — it must win.
    const store = createMainStore();
    store.setState({ ...fixture, csrfToken: 'SNAPCSRF' });
    const el = document.createElement('modernui-main-page') as ModernuiMainPage;
    document.body.appendChild(el);
    el.setStore(store);
    await el.updateComplete;

    (
      [...el.shadowRoot!.querySelectorAll('.seg button')].find(
        (b) => b.textContent?.trim() === 'Ring',
      ) as HTMLButtonElement
    ).click();
    await el.updateComplete;

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toContain('csrf_token=SNAPCSRF');
    expect(calls[0].body).not.toContain('GLOBALCSRF');
  });
});
