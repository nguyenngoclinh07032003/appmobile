// Tiện ích ngày/giờ dùng chung cho màn Đặt lịch (Checkout) và Sửa yêu cầu (OrderScreen).
// Một nguồn duy nhất cho khung giờ phục vụ, tránh mỗi màn hình tự ghi cứng 8h/20h/45 phút.

export const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Khung giờ nhận lịch trong ngày (phút tính từ 00:00).
export const MIN_DAY_MINUTE = 8 * 60; // 08:00
export const MAX_DAY_MINUTE = 20 * 60; // 20:00
// Thợ cần tối thiểu N phút chuẩn bị + di chuyển khi đặt trong hôm nay.
export const LEAD_MINUTES = 45;
// Bước chọn giờ của thanh trượt.
export const SLOT_STEP_MINUTES = 15;
// Giờ mặc định gợi ý khi mở màn chọn lịch.
export const DEFAULT_SLOT_MINUTE = 14 * 60;

const pad2 = (n) => String(n).padStart(2, '0');

/** Danh sách n ngày kể từ hôm nay: { label, ddmm, key: 'YYYY-MM-DD' }. */
export const nextDays = (n, base = new Date()) => Array.from({ length: n }, (_, i) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + i);
  return {
    label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : WEEKDAYS[d.getDay()],
    ddmm: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`,
    key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
  };
});

/** Phút sớm nhất có thể chọn cho ngày thứ dayIdx (0 = hôm nay). */
export const minSelectableMinute = (dayIdx, now = new Date()) => {
  if (dayIdx > 0) return MIN_DAY_MINUTE;
  const nowTotal = now.getHours() * 60 + now.getMinutes();
  const earliest = Math.ceil((nowTotal + LEAD_MINUTES) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
  return Math.max(MIN_DAY_MINUTE, earliest);
};

/** Hôm nay đã hết giờ nhận lịch chưa. */
export const isDayOutOfSlots = (dayIdx, now = new Date()) => dayIdx === 0 && minSelectableMinute(0, now) >= MAX_DAY_MINUTE;

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
  if (!match) return 'Ngày sinh theo định dạng DD/MM/YYYY (VD: 15/08/1995).';
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
