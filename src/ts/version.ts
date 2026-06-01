// Single source of truth for the plugin version in front-end code.
// `__MODERNUI_VERSION__` is replaced at bundle time by Vite's `define`
// (tools/build.mjs and vitest.config.ts), both sourcing package.json — so the
// version lives in exactly one place. The `typeof` guard keeps this safe if the
// module is ever bundled without that define (falls back to 'dev').
declare const __MODERNUI_VERSION__: string | undefined;

export const MODERNUI_VERSION: string =
  typeof __MODERNUI_VERSION__ === 'string' ? __MODERNUI_VERSION__ : 'dev';
