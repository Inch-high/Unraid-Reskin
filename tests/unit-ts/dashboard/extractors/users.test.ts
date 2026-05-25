import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usersExtractor } from '../../../../src/ts/dashboard/extractors/users';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

function parseTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('usersExtractor', () => {
  const tbody = loadFixture('Users_Information.html');

  it('matches the live fixture via title attribute', () => {
    expect(usersExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches a tbody whose h3 contains "Users" (no title)', () => {
    const other = parseTbody(
      '<tbody class="mixed"><tr><td><span class="tile-header"><h3 class="tile-header-main">Users</h3></span></td></tr></tbody>',
    );
    expect(usersExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const other = parseTbody('<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>');
    expect(usersExtractor.match({ source: other })).toBe(false);
  });

  it('extracts kind=users with two users from the fixture', () => {
    const result = usersExtractor.extract({ source: tbody })!;
    expect(result.kind).toBe('users');
    expect(result.users).toHaveLength(2);
    expect(result.users.map((u) => u.name)).toEqual(['root', 'unraidplex']);
  });

  it('extracts totalCount=2 and unprotectedCount=0 from the fixture header', () => {
    const result = usersExtractor.extract({ source: tbody })!;
    expect(result.totalCount).toBe(2);
    expect(result.unprotectedCount).toBe(0);
  });

  it('represents root with null write/read and full description', () => {
    const result = usersExtractor.extract({ source: tbody })!;
    const root = result.users.find((u) => u.name === 'root')!;
    expect(root.description).toBe('Console and webGui login account');
    expect(root.writeCount).toBeNull();
    expect(root.readCount).toBeNull();
  });

  it('parses unraidplex with writeCount=1, readCount=1 and empty description ("-" → "")', () => {
    const result = usersExtractor.extract({ source: tbody })!;
    const plex = result.users.find((u) => u.name === 'unraidplex')!;
    expect(plex.description).toBe('');
    expect(plex.writeCount).toBe(1);
    expect(plex.readCount).toBe(1);
  });

  it('parses a synthetic header "User count: 5 with 2 unprotected"', () => {
    const synth = parseTbody(`
      <tbody class="mixed" title="Users Information">
        <tr><td>
          <span class='tile-header'>
            <h3 class='tile-header-main'>Users</h3>
            <span>User count: 5 with 2 unprotected</span>
          </span>
        </td></tr>
      </tbody>`);
    const result = usersExtractor.extract({ source: synth })!;
    expect(result.totalCount).toBe(5);
    expect(result.unprotectedCount).toBe(2);
    expect(result.users).toEqual([]);
  });

  it('defaults counts to 0 when the header text is missing', () => {
    const synth = parseTbody(
      '<tbody class="mixed" title="Users Information"><tr><td><h3>Users</h3></td></tr></tbody>',
    );
    const result = usersExtractor.extract({ source: synth })!;
    expect(result.totalCount).toBe(0);
    expect(result.unprotectedCount).toBe(0);
  });

  it('treats non-numeric write/read values as null', () => {
    const synth = parseTbody(`
      <tbody class="mixed" title="Users Information">
        <tr><td>
          <span class='tile-header'><h3 class='tile-header-main'>Users</h3>
            <span>User count: 1 with 0 unprotected</span>
          </span>
        </td></tr>
        <tr class='smb user user1'><td>
          <span class='w26'><a href="#">alice</a></span>
          <span class='w44'>Test user</span>
          <span class='w18'>n/a</span>
          <span>oops</span>
        </td></tr>
      </tbody>`);
    const result = usersExtractor.extract({ source: synth })!;
    expect(result.users[0].name).toBe('alice');
    expect(result.users[0].writeCount).toBeNull();
    expect(result.users[0].readCount).toBeNull();
  });
});
