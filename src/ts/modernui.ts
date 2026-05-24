import { bootThemeInit } from './theme-init';
import { isUrlOverrideOff } from './fallback';

if (!isUrlOverrideOff(window.location.href)) {
  bootThemeInit();
}
