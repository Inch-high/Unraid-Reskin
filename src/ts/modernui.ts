import { bootThemeInit } from './theme-init';
import { isUrlOverrideOff } from './fallback';
import { shellBoot } from './shell/boot';

if (!isUrlOverrideOff(window.location.href)) {
  bootThemeInit();
  shellBoot(document);
}
