import { html, svg, type TemplateResult } from 'lit';

// Inline SVG icon set used across docker components. Lucide-style line icons,
// 1.5/2px stroke, sized via the consuming component's CSS. `currentColor`
// inherits the parent's text color so theming Just Works.
//
// Adding a new icon: paste the inner <path>/<circle> elements only — no
// <svg> wrapper, no width/height. Render via icon('name', 16) below.

const SVG_PATHS: Record<string, TemplateResult> = {
  search: svg`<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>`,
  x: svg`<path d="M6 6l12 12M6 18L18 6"/>`,
  plus: svg`<path d="M12 5v14M5 12h14"/>`,
  kebab: svg`<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>`,
  chevron_down: svg`<path d="M6 9l6 6 6-6"/>`,
  chevron_right: svg`<path d="M9 6l6 6-6 6"/>`,
  filter: svg`<path d="M3 6h18M6 12h12M10 18h4"/>`,
  density: svg`<path d="M3 6h18M3 12h18M3 18h18"/>`,

  // State / actions
  play: svg`<path d="M6 4l14 8-14 8z"/>`,
  stop: svg`<rect x="5" y="5" width="14" height="14"/>`,
  pause: svg`<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>`,
  restart: svg`<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>`,
  update: svg`<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>`,
  external: svg`<path d="M14 3h7v7M10 14l11-11M21 14v7H3V3h7"/>`,
  trash: svg`<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>`,
  edit: svg`<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>`,
  logs: svg`<path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><path d="M8 12h8M8 16h8"/>`,
  console: svg`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8l3 3-3 3M12 14h5"/>`,

  // Folder/tag set
  folder: svg`<path d="M3 7h6l2 2h10v10H3z"/>`,
  tag: svg`<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3"/>`,
  film: svg`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>`,
  wifi: svg`<path d="M5 12.55a11 11 0 0 1 14 0M2 8.82a16 16 0 0 1 20 0M8.5 16.43a6 6 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>`,
  chart: svg`<path d="M3 3v18h18"/><path d="M7 17l4-4 4 2 5-7"/>`,
  book: svg`<path d="M4 20V4h12l4 4v12z"/><path d="M4 8h12"/>`,
  bot: svg`<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><path d="M12 6V2M8 22h8"/>`,
  wrench: svg`<path d="M14 7a4 4 0 1 1-4 4l-7 7 3 3 7-7a4 4 0 0 0 4-4z"/>`,
  globe: svg`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>`,
  layers: svg`<path d="M12 2l10 6-10 6L2 8z"/><path d="M2 14l10 6 10-6"/>`,
  archive: svg`<rect x="3" y="7" width="18" height="13" rx="1"/><path d="M3 7l2-3h14l2 3"/>`,

  // Status badge ring
  dot: svg`<circle cx="12" cy="12" r="5"/>`,

  // Power / autostart pin. Lightning bolt reads as "powers up on boot" and
  // is visually distinct from the play arrow used for the Start action.
  power: svg`<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>`,
};

export const FOLDER_ICONS: ReadonlyArray<keyof typeof SVG_PATHS> = [
  'folder', 'film', 'wifi', 'chart', 'book', 'bot', 'wrench', 'globe', 'layers', 'archive',
];

export type IconName = keyof typeof SVG_PATHS;

export function icon(name: IconName, size = 16): TemplateResult {
  const body = SVG_PATHS[name];
  if (!body) return html`<svg width=${size} height=${size}></svg>`;
  return html`
    <svg viewBox="0 0 24 24" width=${size} height=${size}
         fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">${body}</svg>
  `;
}
