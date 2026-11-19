// Dùng: node --import ./test/helpers/register-loader.mjs --test test/flow_roleplay.test.js
import { register } from 'node:module';

if (!globalThis.__HRMSS_EXT_LOADER__) {
  globalThis.__HRMSS_EXT_LOADER__ = true;
  register('./ext-loader.mjs', import.meta.url);
}
