import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSourceObserver } from '../../../src/ts/dashboard/source-observer';

describe('source observer', () => {
  let table: HTMLTableElement;

  beforeEach(() => {
    document.body.innerHTML = '<table class="dashboard"><tbody id="t1"><tr><td>a</td></tr></tbody></table>';
    table = document.querySelector('table.dashboard')!;
  });

  it('fires onChange once after a mutation', async () => {
    const onChange = vi.fn();
    const obs = createSourceObserver(table, onChange, 10);
    obs.start();

    const tbody = table.querySelector('tbody')!;
    tbody.querySelector('td')!.textContent = 'b';

    await new Promise((r) => setTimeout(r, 30));
    expect(onChange).toHaveBeenCalledTimes(1);
    obs.stop();
  });

  it('debounces multiple rapid mutations into one fire', async () => {
    const onChange = vi.fn();
    const obs = createSourceObserver(table, onChange, 20);
    obs.start();

    const tbody = table.querySelector('tbody')!;
    for (let i = 0; i < 5; i++) {
      tbody.querySelector('td')!.textContent = `v${i}`;
    }

    await new Promise((r) => setTimeout(r, 50));
    expect(onChange).toHaveBeenCalledTimes(1);
    obs.stop();
  });

  it('stop() prevents further fires', async () => {
    const onChange = vi.fn();
    const obs = createSourceObserver(table, onChange, 10);
    obs.start();
    obs.stop();

    table.querySelector('td')!.textContent = 'changed';
    await new Promise((r) => setTimeout(r, 30));
    expect(onChange).not.toHaveBeenCalled();
  });
});
