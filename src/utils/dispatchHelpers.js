// Tiện ích thuần JS xử lý bán kính 20 km, ping vị trí thợ, toạ độ địa chỉ khách và duyệt báo giá tại chỗ.
// Không phụ thuộc React Native để dùng chung cho AppContext, UI và bộ kiểm thử Node.

export const LOCATION_PING_MS = 3 * 60 * 1000;

export function shouldPingTechLocation({
  role,
  hasToken,
  lastPingAt = 0,
  now = Date.now(),
  force = false,
} = {}) {
  if (role !== 'tech' || !hasToken) return false;
  if (force) return true;
  const last = Number(lastPingAt) || 0;
  return now - last >= LOCATION_PING_MS;
}

export function parseValidCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') {
    return null;
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function buildAddressCoordinatesPayload(lat, lng) {
  const parsed = parseValidCoordinates(lat, lng);
  return parsed ? { latitude: parsed.latitude, longitude: parsed.longitude } : {};
}

export function canShowOnsiteQuoteApproval(order, { mine = false, isSupport = false } = {}) {
  if (!mine || isSupport || !order) return false;
  if (order.customerHasApp === true) return false;
  if (!order.arrivedAt && !order.checkIn) return false;
  const backendSt = String(order.backendStatus || '').toUpperCase();
  if (order.status !== 'quoted' && backendSt !== 'DIAGNOSED_PENDING_QUOTATION') return false;
  if (!order.quote || order.quote.approved || order.quote.revisionRequested) return false;
  return true;
}

export function validateOnsiteApprovalInput({ photoUris = [], note = '' } = {}) {
  const photos = (Array.isArray(photoUris) ? photoUris : [])
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  if (photos.length === 0) {
    return { ok: false, error: 'Vui lòng chụp hoặc chọn ít nhất 1 ảnh báo giá có chữ ký khách.' };
  }
  if (photos.length > 5) {
    return { ok: false, error: 'Tối đa 5 ảnh báo giá có chữ ký.' };
  }
  const cleanNote = typeof note === 'string' ? note.trim() : '';
  if (cleanNote.length > 500) {
    return { ok: false, error: 'Ghi chú tối đa 500 ký tự.' };
  }
  return { ok: true, photoUris: photos, note: cleanNote };
}

