// Lớp lưu trữ key-value dùng chung cho web và native.
// - Web (Expo web): localStorage (scope 'local', dùng chung mọi tab) / sessionStorage (scope 'session', mỗi tab một phiên).
//   Đọc/ghi đồng bộ -> app dựng state ngay lúc khởi tạo như trước.
// - Native (iOS/Android): không có localStorage/sessionStorage -> dùng AsyncStorage (bất đồng bộ). Cả 2 scope cùng lưu
//   trong AsyncStorage (phiên đăng nhập cần giữ khi mở lại app). App phải hydrate (đọc) xong mới dựng state.
// KHÔNG lưu access token / refresh token ở đây: refresh token native nằm trong SecureStore (services/api.js).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devWarn } from '../utils/async';

export const IS_WEB_STORAGE = Platform.OS === 'web';

const webStore = (scope) => {
  try {
    if (scope === 'session') return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    return null;
  }
};

/** Web: đọc đồng bộ. Native: luôn trả null (dùng getItem bất đồng bộ). */
export function getItemSync(key, scope = 'local') {
  if (!IS_WEB_STORAGE) return null;
  try {
    return webStore(scope)?.getItem(key) ?? null;
  } catch (e) {
    return null;
  }
}

export async function getItem(key, scope = 'local') {
  if (IS_WEB_STORAGE) return getItemSync(key, scope);
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    devWarn('[storage] đọc lỗi', key, e?.message || e);
    return null;
  }
}

export function setItem(key, value, scope = 'local') {
  if (IS_WEB_STORAGE) {
    try { webStore(scope)?.setItem(key, value); } catch (e) { /* quota / private mode */ }
    return Promise.resolve();
  }
  return AsyncStorage.setItem(key, value).catch((e) => devWarn('[storage] ghi lỗi', key, e?.message || e));
}

export function removeItem(key, scope = 'local') {
  if (IS_WEB_STORAGE) {
    try { webStore(scope)?.removeItem(key); } catch (e) { /* bỏ qua */ }
    return Promise.resolve();
  }
  return AsyncStorage.removeItem(key).catch((e) => devWarn('[storage] xoá lỗi', key, e?.message || e));
}

const parse = (raw) => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
};

export const readJsonSync = (key, scope = 'local') => parse(getItemSync(key, scope));
export const readJson = async (key, scope = 'local') => parse(await getItem(key, scope));
export const writeJson = (key, value, scope = 'local') => {
  let raw;
  try { raw = JSON.stringify(value); } catch (e) { return Promise.resolve(); }
  return setItem(key, raw, scope);
};

export const kvStorage = {
  isSync: IS_WEB_STORAGE,
  getItemSync,
  getItem,
  setItem,
  removeItem,
  readJsonSync,
  readJson,
  writeJson,
};

export default kvStorage;
