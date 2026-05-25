import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dash-live.html', 'utf8');
const tbodyRe = /<tbody\b[^>]*>[\s\S]*?<\/tbody>/g;
const matches = html.match(tbodyRe) || [];
const targets = new Set([
  'vm_view',
  'tblUPSNUTDash',
  'Motherboard Information',
  'Interface Information',
  'Shares Information',
  'Users Information',
]);

for (const tb of matches) {
  const open = tb.match(/^<tbody[^>]*>/)[0];
  const idM = open.match(/id=["']([^"']+)/);
  const titM = open.match(/title=["']([^"']+)/);
  const clsM = open.match(/class=["']([^"']+)/);
  const id = idM ? idM[1] : '-';
  const title = titM ? titM[1] : '-';
  const cls = clsM ? clsM[1] : '-';
  const want = targets.has(id) || targets.has(title) || cls === 'system';
  if (want) {
    const key = id !== '-' ? id : title !== '-' ? title : cls;
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeFileSync(`live-${safe}.html`, tb);
    console.log(`saved live-${safe}.html size=${tb.length} (id=${id} title=${title} class=${cls})`);
  }
}
