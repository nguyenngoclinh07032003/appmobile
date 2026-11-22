// Chấm công của thợ (vào ca có GPS): hàm thuần dùng cho màn TechAttendanceScreen, tách riêng để test.
// Hợp đồng API: GET /attendance/me/shift-options, POST /attendance/check-in, GET /attendance/me, GET /violations/me
// (trường camelCase). Backend tự kiểm tra ca của ai, ca hôm nay, trùng ca, ngày khóa / nghỉ: app không tự kiểm tra lại.
import { toVnParts, vnDateKey } from './vnTime.js';

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

// Thông báo backend liên quan ca làm / chấm công: nhận được thì tải lại màn Chấm công, bấm vào thì mở màn này.
export const ATTENDANCE_NOTIF_TYPES = new Set([
  'SHIFT_ASSIGNED', 'SHIFT_UPDATED', 'SHIFT_CANCELLED',
  'ATTENDANCE_APPROVED', 'ATTENDANCE_REJECTED', 'VIOLATION_RECORDED', 'ATTENDANCE_PERIOD_LOCKED',
]);

// Trạng thái một ca trong bảng công.
export const SHIFT_STATUS_LABEL = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};

/** Tháng hiện tại theo giờ Việt Nam: { year, month } (month 1-12). */
export const currentVnMonth = (now = Date.now()) => {
  const p = toVnParts(now);
  return { year: p.year, month: p.month };
};

/** Lùi / tiến tháng: shiftMonth({ year: 2026, month: 1 }, -1) -> { year: 2025, month: 12 }. */
export const shiftMonth = ({ year, month }, delta) => {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
};

/** Khoảng ngày của tháng dương lịch: { from: 'YYYY-MM-01', to: 'YYYY-MM-<ngày cuối>' }. */
export const monthRange = ({ year, month }) => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
};

/** 'YYYY-MM-DD' -> 'T2, 22/11' (thứ tính theo lịch, không phụ thuộc múi giờ máy). */
export const dayLabel = (dateStr) => {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateStr || '');
  const wd = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${WEEKDAY_VI[wd]}, ${m[3]}/${m[2]}`;
};

/** 'YYYY-MM-DD' -> 'dd/MM/yyyy'. */
export const vnDateText = (dateStr) => {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(dateStr || '');
};

/** Mốc ISO -> 'HH:mm' theo giờ Việt Nam ('' nếu không hợp lệ). */
export const vnClock = (iso) => {
  if (!iso) return '';
  const p = toVnParts(iso);
  return p ? `${pad(p.hour)}:${pad(p.minute)}` : '';
};

/** Giờ ca: '08:00 – 17:00', ca qua đêm thêm '(qua đêm)'. */
export const shiftTimeText = (item = {}) => {
  const base = [item.startTime, item.endTime].filter(Boolean).join(' – ');
  return item.crossesMidnight ? `${base} (qua đêm)` : base;
};

/** Ghi chú vào ca: rỗng thì bỏ qua; có nhập thì 3–500 ký tự. Trả câu lỗi hoặc null. */
export const noteError = (note) => {
  const t = String(note ?? '').trim();
  if (!t) return null;
  if (t.length < NOTE_MIN) return `Ghi chú cần ít nhất ${NOTE_MIN} ký tự (hoặc để trống).`;
  if (t.length > NOTE_MAX) return `Ghi chú tối đa ${NOTE_MAX} ký tự.`;
  return null;
};

/**
 * Body POST /attendance/check-in cho thợ. Backend kiểm tra strict: chỉ gửi đúng các khóa này, KHÔNG gửi shiftId,
 * không gửi note rỗng, tọa độ phải là number. location = kết quả getCheckInLocation() ({ lat, lng, accuracy }).
 */
export const buildCheckInBody = (technicianShiftId, location, note) => {
  const body = {
    technicianShiftId: Number(technicianShiftId),
    latitude: Number(location.lat),
    longitude: Number(location.lng),
  };
  const acc = Number(location.accuracy);
  if (Number.isFinite(acc) && acc >= 0) body.accuracyM = Math.round(acc);
  const t = String(note ?? '').trim();
  if (t) body.note = t;
  return body;
};

/** Ca thợ đã vào trong ngày `dateKey` (mặc định hôm nay giờ VN), theo technicianShiftId -> mục bảng công. */
export const entriesOfDay = (grid, dateKey = vnDateKey()) => {
  const out = new Map();
  const day = (grid?.days || []).find((d) => d.date === dateKey);
  for (const s of day?.shifts || []) {
    if (s.technicianShiftId != null) out.set(String(s.technicianShiftId), s);
  }
  return out;
};

/** Ngày trong bảng công, mới nhất trước. */
export const sortDaysDesc = (days = []) => [...days].sort((a, b) => String(b.date).localeCompare(String(a.date)));

// Lỗi vào ca -> câu hiển thị cho thợ, và có cần tải lại danh sách ca không.
const CHECK_IN_ERRORS = {
  ATTENDANCE_SHIFT_DUPLICATE: { text: 'Bạn đã vào ca này rồi.', reload: true },
  TECHNICIAN_SHIFT_NOT_USABLE: { text: 'Ca này không còn hiệu lực (đã hủy hoặc không phải ca hôm nay).', reload: true },
  ATTENDANCE_SHIFT_LIMIT: { text: 'Đã đủ 6 ca trong ngày.', reload: false },
  ATTENDANCE_DAY_OFF: { text: 'Hôm nay bạn được đánh dấu nghỉ.', reload: false },
  ATTENDANCE_LOCKED: { text: 'Ngày công đã chốt, không chấm được.', reload: false },
  ATTENDANCE_NOT_APPLICABLE: { text: 'Tài khoản chưa được phép chấm công. Liên hệ văn phòng.', reload: false },
  FORBIDDEN: { text: 'Tài khoản chưa được phép chấm công. Liên hệ văn phòng.', reload: false },
};

/** res = kết quả apiRequest lỗi ({ code, message }). Trả { text, reload }. */
export const checkInErrorInfo = (res = {}) => {
  const known = CHECK_IN_ERRORS[String(res.code || '').toUpperCase()];
  if (known) return known;
  return { text: res.message || 'Chưa vào ca được. Vui lòng thử lại.', reload: false };
};
