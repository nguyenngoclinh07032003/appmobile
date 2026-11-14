// Giờ Việt Nam (GMT+7, không có giờ mùa hè). Backend lưu giờ hẹn theo ISO (UTC) và app gửi giờ hẹn dạng
// `YYYY-MM-DDTHH:00:00+07:00` (buildPreferredTimeIso), nên mọi phép đổi ngược (ngày / khung giờ hiển thị, mốc giờ
// hẹn) cũng phải tính theo GMT+7 cố định thay vì múi giờ của máy (máy để múi giờ khác sẽ lệch ngày / khung giờ).

export const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

/** Tách một mốc thời gian (Date | ms | chuỗi ISO) thành năm/tháng/ngày/giờ/phút theo giờ Việt Nam. null nếu không hợp lệ. */
export const toVnParts = (input) => {
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (Number.isNaN(t)) return null;
  const v = new Date(t + VN_TZ_OFFSET_MS);
  return {
    year: v.getUTCFullYear(),
    month: v.getUTCMonth() + 1,
    day: v.getUTCDate(),
    hour: v.getUTCHours(),
    minute: v.getUTCMinutes(),
  };
};

/** Mốc ms của một thời điểm theo giờ Việt Nam (tháng 1-12). */
export const vnTimestamp = (year, month, day, hour = 0, minute = 0) => (
  Date.UTC(year, month - 1, day, hour, minute, 0, 0) - VN_TZ_OFFSET_MS
);

/** 'YYYY-MM-DD' theo giờ Việt Nam. */
export const vnDateKey = (input = Date.now()) => {
  const p = toVnParts(input) || toVnParts(Date.now());
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
