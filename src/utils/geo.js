/** Dịch vụ định vị GPS cho kỹ thuật viên Thợ Minh Đức */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { devWarn } from './async';

const DEFAULT_TIMEOUT_MS = 10000;
// Vị trí cũ tối đa được dùng khi không lấy được vị trí mới (check-in cần vị trí gần đúng thời điểm hiện tại).
const LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;

const toPayload = (coords) => {
  if (!coords || coords.latitude == null || coords.longitude == null) return null;
  const accuracy = Math.round(coords.accuracy || 12);
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy,
    label: `GPS ±${accuracy}m`,
    at: Date.now(),
  };
};

// Promise không bao giờ treo quá `ms` (getCurrentPositionAsync trên một số máy Android có thể chờ rất lâu).
const withTimeout = (promise, ms) => new Promise((resolve) => {
  let settled = false;
  const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, ms);
  Promise.resolve(promise)
    .then((v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } })
    .catch((e) => {
      devWarn('[geo] lỗi lấy vị trí', e?.message || e);
      if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
    });
});

const webLocation = (timeoutMs) => new Promise((resolve) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    resolve(null);
    return;
  }
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toPayload(pos?.coords)),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  } catch (e) {
    resolve(null);
  }
});

const nativeLocation = async (timeoutMs) => {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm?.status !== 'granted') return null;
  const pos = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    timeoutMs,
  );
  const fresh = toPayload(pos?.coords);
  if (fresh) return fresh;
  // Không lấy được vị trí mới (trong nhà, GPS yếu): dùng vị trí gần nhất nếu còn mới.
  const last = await withTimeout(
    Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: 200 }),
    3000,
  );
  return toPayload(last?.coords);
};

// Vị trí GPS thật của máy. Không lấy được (chưa cấp quyền / không có GPS / quá thời gian) -> null (KHÔNG dùng tọa độ
// mặc định: backend dùng tọa độ này để kiểm tra bán kính check-in và tính trễ hẹn). Không bao giờ reject.
// - Web: navigator.geolocation.
// - Native (iOS/Android): expo-location (xin quyền vị trí khi dùng app -> vị trí hiện tại -> vị trí gần nhất).
export const getCheckInLocation = async ({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  try {
    if (Platform.OS === 'web') return await webLocation(timeoutMs);
    return await nativeLocation(timeoutMs);
  } catch (e) {
    devWarn('[geo] getCheckInLocation lỗi', e?.message || e);
    return null;
  }
};

/** Haversine km — tính khoảng cách giữa kỹ thuật viên và địa chỉ khách hàng */
export const distanceKm = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 100) / 100;
};
