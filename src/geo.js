/** Check-in vị trí (web Geolocation). Thất bại → toạ độ mô phỏng Hà Nội. */

const HN = { lat: 21.028511, lng: 105.804817, label: 'Khu vực Hà Nội (mô phỏng)' };

export const getCheckInLocation = () => new Promise((resolve) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    resolve({ ...HN, accuracy: 80, simulated: true, at: Date.now() });
    return;
  }
  const done = (payload) => resolve({ ...payload, at: Date.now() });
  navigator.geolocation.getCurrentPosition(
    (pos) => done({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy || 0),
      simulated: false,
      label: `GPS ±${Math.round(pos.coords.accuracy || 0)}m`,
    }),
    () => done({ ...HN, accuracy: 120, simulated: true }),
    { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 },
  );
});

/** Haversine km — dùng để ghi nhận khoảng cách ước tính nếu có toạ độ địa chỉ */
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
