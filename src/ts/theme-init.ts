export type ThemeMode = 'system' | 'dark' | 'light';
export type Density = 'comfortable' | 'compact';
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeState {
  theme: ResolvedTheme;
  density: Density;
}

export function resolveTheme(
  mode: ThemeMode,
  prefersDark: () => boolean,
): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  if (mode === 'system') return prefersDark() ? 'dark' : 'light';
  return 'dark';
}

export function applyTheme(state: ThemeState): void {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-density', state.density);
}

export function readSettingsFromMeta(): { mode: ThemeMode; density: Density } {
  const root = document.documentElement;
  const mode = (root.dataset.modernuiMode as ThemeMode) || 'system';
  const density = (root.dataset.modernuiDensity as Density) || 'comfortable';
  return { mode, density };
}

export function bootThemeInit(): void {
  const { mode, density } = readSettingsFromMeta();
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const prefersDark = () => mql.matches;

  applyTheme({ theme: resolveTheme(mode, prefersDark), density });

  if (mode === 'system') {
    mql.addEventListener('change', () => {
      applyTheme({ theme: resolveTheme('system', prefersDark), density });
    });
  }
}
