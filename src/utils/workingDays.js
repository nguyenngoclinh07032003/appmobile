// Tiện ích kiểm tra Chủ nhật / ngày lễ phục vụ cho đặt lịch, sửa giờ hẹn và đặt bảo hành (giờ Việt Nam GMT+7).
// Giữ thuần JS không phụ thuộc React Native để dùng chung cho UI, AppContext và bộ kiểm thử Node.
import { toVnParts } from './vnTime.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function isSundayYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return false;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return dow === 0;
}

export function buildHolidayMap(holidays = []) {
  const map = new Map();
  if (!Array.isArray(holidays)) return map;
  for (const h of holidays) {
    if (!h) continue;
    const rawDate = typeof h === 'string' ? h : h.date;
    const key = String(rawDate || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const name = typeof h === 'object' && h.name ? String(h.name).trim() : 'Ngày lễ';
    map.set(key, name || 'Ngày lễ');
  }
  return map;
}

export function getNonWorkingDayInfo(ymd, { holidays = [], sundaysClosed = true } = {}) {
  const key = String(ymd || '').trim().slice(0, 10);
  if (!key) {
    return { blocked: false, reason: null, holidayName: null, label: '', shortLabel: '' };
  }
  const holidayMap = holidays instanceof Map ? holidays : buildHolidayMap(holidays);
  if (holidayMap.has(key)) {
    const name = holidayMap.get(key) || 'Ngày lễ';
    return {
      blocked: true,
      reason: 'HOLIDAY',
      holidayName: name,
      label: name,
      shortLabel: 'Nghỉ lễ',
    };
  }
  if (sundaysClosed !== false && isSundayYmd(key)) {
    return {
      blocked: true,
      reason: 'SUNDAY',
      holidayName: null,
      label: 'Chủ nhật (Nghỉ)',
      shortLabel: 'Nghỉ CN',
    };
  }
  return { blocked: false, reason: null, holidayName: null, label: '', shortLabel: '' };
}

export function findFirstWorkingDayIndex(
  days = [],
  holidayOpts = {},
  { startFrom = 0, isTodayOutOfSlots = false } = {},
) {
  if (!Array.isArray(days) || !days.length) return 0;
  const isUsable = (d, idx) => Boolean(d?.key) && !(idx === 0 && isTodayOutOfSlots) && !getNonWorkingDayInfo(d.key, holidayOpts).blocked;
  const start = Math.max(0, Math.min(days.length - 1, Number(startFrom) || 0));
  for (let i = start; i < days.length; i += 1) {
    if (isUsable(days[i], i)) return i;
  }
  for (let i = 0; i < start; i += 1) {
    if (isUsable(days[i], i)) return i;
  }
  return 0;
}

export function getHolidayQueryRange(daysAhead = 120, base = new Date()) {
  const safeAhead = Math.max(1, Math.min(400, Number(daysAhead) || 120));
  const vn = toVnParts(base) || toVnParts(Date.now());
  const fromDate = new Date(Date.UTC(vn.year, vn.month - 1, vn.day));
  const toDate = new Date(fromDate.getTime() + safeAhead * 86400000);
  const fmt = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { from: fmt(fromDate), to: fmt(toDate) };
}
