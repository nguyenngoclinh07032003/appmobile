// Tiện ích ngày/giờ dùng chung cho màn Đặt lịch (Checkout) và Sửa yêu cầu (OrderScreen).
// Một nguồn duy nhất cho khung giờ phục vụ (cố định theo GMT+7), tránh lệ thuộc múi giờ máy.
import { toVnParts } from './vnTime.js';

export const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Chế độ test: mở toàn bộ khung giờ 00:00 – 23:45 (không giới hạn giờ làm việc / không chặn lead time).
// Đổi về false khi cần bật lại khung giờ chuẩn 08:00 – 20:00 (đặt trước tối thiểu 45 phút).
export const ALLOW_ALL_TIME_SLOTS = true;

// Khung giờ nhận lịch trong ngày (phút tính từ 00:00).
export const MIN_DAY_MINUTE = ALLOW_ALL_TIME_SLOTS ? 0 : 8 * 60; // 00:00 (chuẩn: 08:00)
export const MAX_DAY_MINUTE = ALLOW_ALL_TIME_SLOTS ? 23 * 60 + 45 : 20 * 60; // 23:45 (chuẩn: 20:00)
// Thợ cần tối thiểu N phút chuẩn bị + di chuyển khi đặt trong hôm nay.
export const LEAD_MINUTES = ALLOW_ALL_TIME_SLOTS ? 0 : 45;
// Bước chọn giờ của thanh trượt.
export const SLOT_STEP_MINUTES = 15;
// Giờ mặc định gợi ý khi mở màn chọn lịch.
export const DEFAULT_SLOT_MINUTE = 14 * 60;

const pad2 = (n) => String(n).padStart(2, '0');

/** Danh sách n ngày kể từ hôm nay (theo giờ Việt Nam GMT+7): { label, ddmm, key: 'YYYY-MM-DD' }. */
export const nextDays = (n, base = new Date()) => {
  const vn = toVnParts(base) || toVnParts(Date.now());
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(vn.year, vn.month - 1, vn.day + i));
    return {
      label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : WEEKDAYS[d.getUTCDay()],
      ddmm: `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`,
      key: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    };
  });
};

/** Phút sớm nhất có thể chọn cho ngày thứ dayIdx (0 = hôm nay, tính theo giờ Việt Nam GMT+7). */
export const minSelectableMinute = (dayIdx, now = new Date()) => {
  if (ALLOW_ALL_TIME_SLOTS || dayIdx > 0) return MIN_DAY_MINUTE;
  const vn = toVnParts(now) || toVnParts(Date.now());
  const nowTotal = vn.hour * 60 + vn.minute;
  const earliest = Math.ceil((nowTotal + LEAD_MINUTES) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
  return Math.max(MIN_DAY_MINUTE, earliest);
};

/** Giờ mặc định khi mở màn đặt lịch: hôm nay gợi ý mốc gần nhất sắp tới, ngày khác dùng DEFAULT_SLOT_MINUTE. */
export const defaultSelectableMinute = (dayIdx, now = new Date()) => {
  const minM = minSelectableMinute(dayIdx, now);
  if (dayIdx === 0) {
    const vn = toVnParts(now) || toVnParts(Date.now());
    const nowTotal = vn.hour * 60 + vn.minute;
    const nextStep = Math.ceil((nowTotal + LEAD_MINUTES) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
    const suggested = ALLOW_ALL_TIME_SLOTS ? nextStep : Math.max(DEFAULT_SLOT_MINUTE, nextStep);
    return Math.min(Math.max(suggested, minM), MAX_DAY_MINUTE);
  }
  return Math.min(Math.max(DEFAULT_SLOT_MINUTE, minM), MAX_DAY_MINUTE);
};

/** Hôm nay đã hết giờ nhận lịch chưa. */
export const isDayOutOfSlots = (dayIdx, now = new Date()) => dayIdx === 0 && minSelectableMinute(0, now) > MAX_DAY_MINUTE;

/** Kẹp phút vào khung cho phép của ngày dayIdx. */
export const clampToDay = (minutes, dayIdx, now = new Date()) => (
  Math.min(Math.max(minutes, minSelectableMinute(dayIdx, now)), MAX_DAY_MINUTE)
);

/** "14h30 - 16h30" | "14h" → phút. Không đọc được thì trả fallback. */
export const parseSlotToMinutes = (slotStr, fallback = DEFAULT_SLOT_MINUTE) => {
  if (!slotStr) return fallback;
  const match = String(slotStr).match(/^\s*(\d{1,2})\s*[h:](\d{2})?/i);
  if (!match) return fallback;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2] || '0', 10) || 0;
  if (!Number.isFinite(h) || h > 23 || m > 59) return fallback;
  return h * 60 + m;
};

/** Phút tính từ 00:00 → khung 2 giờ "HHhMM - HHhMM" (VD: 480 → "08h00 - 10h00"). */
export const formatMinutesToSlotStr = (mins) => {
  const raw = mins != null && mins !== '' ? Number(mins) : NaN;
  const m = Number.isFinite(raw) ? Math.max(0, Math.min(24 * 60, Math.round(raw))) : DEFAULT_SLOT_MINUTE;
  const endM = Math.min(m + 120, m <= 20 * 60 ? 22 * 60 : 24 * 60);
  return `${pad2(Math.floor(m / 60))}h${pad2(m % 60)} - ${pad2(Math.floor(endM / 60))}h${pad2(endM % 60)}`;
};

/** Chỉ số ngày (trong nextDays(n)) khớp dateKey; không có thì trả fallback (mặc định 1 = Ngày mai). */
export const dayIndexOfKey = (days, dateKey, fallback = 1) => {
  const idx = (days || []).findIndex((d) => d.key === dateKey);
  return idx >= 0 ? idx : Math.min(fallback, Math.max(0, (days || []).length - 1));
};

/** Kiểm tra ngày dạng DD/MM/YYYY có thật trên lịch (31/02 sai, 29/02 chỉ năm nhuận). */
export const isRealDateDMY = (d, m, y) => {
  if (![d, m, y].every(Number.isInteger)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

/**
 * Kiểm tra ngày sinh DD/MM/YYYY. Trả '' nếu hợp lệ (hoặc để trống), ngược lại trả thông báo lỗi.
 * Ràng buộc: ngày có thật, năm từ minYear, không ở tương lai và đủ minAge tuổi.
 */
export const dobError = (value, { minYear = 1920, minAge = 5, now = new Date() } = {}) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return 'Ngày sinh theo định dạng ngày/tháng/năm (VD: 15/08/1995).';
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const y = parseInt(match[3], 10);
  if (!isRealDateDMY(d, m, y)) return 'Ngày sinh không tồn tại trên lịch (kiểm tra ngày/tháng).';
  const maxYear = now.getFullYear() - minAge;
  if (y < minYear || y > maxYear) return `Năm sinh không hợp lệ (${minYear} - ${maxYear}).`;
  const dob = new Date(y, m - 1, d);
  const limit = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  if (dob > limit) return `Bạn cần đủ ${minAge} tuổi.`;
  return '';
};
