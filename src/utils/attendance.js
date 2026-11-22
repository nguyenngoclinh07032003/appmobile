// Tiện ích nghiệp vụ Chấm công (vào ca có GPS, bảng công tháng, vi phạm) theo giờ Việt Nam (GMT+7).
import { toVnParts, vnDateKey } from './vnTime.js';
import { viFieldError, viServerMessage } from './viText.js';
import { TECH_WORK_SHIFTS } from '../constants/data.js';

export { TECH_WORK_SHIFTS };

export const ATTENDANCE_NOTIF_TYPES = new Set([
  'SHIFT_ASSIGNED',
  'SHIFT_UPDATED',
  'SHIFT_CANCELLED',
  'ATTENDANCE_APPROVED',
  'ATTENDANCE_REJECTED',
  'VIOLATION_RECORDED',
  'ATTENDANCE_PERIOD_LOCKED',
]);

export const isAttendanceNotifType = (type) => (
  ATTENDANCE_NOTIF_TYPES.has(String(type || '').trim().toUpperCase())
);

export const buildAttendanceNotifSignature = (notifs = []) => (
  (Array.isArray(notifs) ? notifs : [])
    .filter((n) => isAttendanceNotifType(n?.type || n?.notification_type))
    .map((n) => `${Number(n?.at) || 0}:${String(n?.id || '')}`)
    .sort()
    .join('|')
);

export const defaultAttendanceNotifIcon = (type) => {
  const t = String(type || '').trim().toUpperCase();
  if (t === 'ATTENDANCE_APPROVED') return 'check-circle-2';
  if (t === 'ATTENDANCE_REJECTED' || t === 'SHIFT_CANCELLED') return 'x-circle';
  if (t === 'VIOLATION_RECORDED') return 'alert-triangle';
  if (t === 'ATTENDANCE_PERIOD_LOCKED') return 'lock';
  if (t === 'SHIFT_ASSIGNED' || t === 'SHIFT_UPDATED') return 'calendar-clock';
  return null;
};

const pad2 = (n) => String(n).padStart(2, '0');

const parseYmdParts = (input) => {
  if (!input) return null;
  const str = String(input).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m && str.length === 10) {
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
  return toVnParts(input);
};

export const getVnTodayInfo = (now = Date.now()) => {
  const p = toVnParts(now) || toVnParts(Date.now());
  const dateKey = vnDateKey(now);
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    dateKey,
    dmy: `${pad2(p.day)}/${pad2(p.month)}/${p.year}`,
  };
};

export const formatVnDateDmy = (dateStr) => {
  const p = parseYmdParts(dateStr);
  return p ? `${pad2(p.day)}/${pad2(p.month)}/${p.year}` : String(dateStr || '');
};

export const formatVnDateDm = (dateStr) => {
  const p = parseYmdParts(dateStr);
  return p ? `${pad2(p.day)}/${pad2(p.month)}` : String(dateStr || '');
};

export const formatVnTimeHm = (iso) => {
  if (!iso) return '';
  const p = toVnParts(iso);
  return p ? `${pad2(p.hour)}:${pad2(p.minute)}` : '';
};

const VN_WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export const getVnWeekdayInfo = (dateStr, dayType) => {
  const p = parseYmdParts(dateStr);
  if (!p) return { label: '', isSunday: dayType === 'sunday' };
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return {
    label: VN_WEEKDAYS[dow] || '',
    isSunday: dayType === 'sunday' || dow === 0,
  };
};

export const getMonthRange = (month, year) => {
  const m = Number(month);
  const y = Number(year);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${y}-${pad2(m)}-01`,
    to: `${y}-${pad2(m)}-${pad2(lastDay)}`,
  };
};

export const shiftMonth = (month, year, delta = 0) => {
  const d = new Date(Date.UTC(Number(year), Number(month) - 1 + Number(delta), 1));
  return {
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear(),
  };
};

export const validateCheckInNote = (rawNote) => {
  const trimmed = String(rawNote || '').trim();
  if (!trimmed) return null;
  if (trimmed.length < 3 || trimmed.length > 500) {
    return 'Ghi chú nếu nhập phải từ 3 đến 500 ký tự.';
  }
  return null;
};

export const buildCheckInPayload = ({ technicianShiftId, lat, lng, accuracy, note } = {}) => {
  const body = {
    technicianShiftId: Number(technicianShiftId),
    latitude: Number(lat),
    longitude: Number(lng),
  };
  if (accuracy != null && accuracy !== '' && Number.isFinite(Number(accuracy)) && Number(accuracy) >= 0) {
    body.accuracyM = Number(accuracy);
  }
  const cleanNote = typeof note === 'string' ? note.trim() : '';
  if (cleanNote) body.note = cleanNote;
  return body;
};

export const formatAttendanceCheckInError = (res = {}) => {
  const code = String(res?.code || '').trim().toUpperCase();
  if (code === 'ATTENDANCE_SHIFT_DUPLICATE') {
    return { title: 'Đã vào ca', message: 'Bạn đã vào ca này rồi.', shouldRefetch: true };
  }
  if (code === 'TECHNICIAN_SHIFT_NOT_USABLE') {
    return {
      title: 'Ca không còn hiệu lực',
      message: 'Ca này không còn hiệu lực (đã hủy hoặc không phải ca hôm nay).',
      shouldRefetch: true,
    };
  }
  if (code === 'ATTENDANCE_SHIFT_LIMIT') {
    return { title: 'Đạt giới hạn ca', message: 'Đã đủ 6 ca trong ngày.', shouldRefetch: false };
  }
  if (code === 'ATTENDANCE_DAY_OFF') {
    return { title: 'Ngày nghỉ', message: 'Hôm nay bạn được đánh dấu nghỉ.', shouldRefetch: true };
  }
  if (code === 'ATTENDANCE_LOCKED') {
    return { title: 'Ngày công đã chốt', message: 'Ngày công đã chốt, không chấm được.', shouldRefetch: true };
  }
  if (code === 'FORBIDDEN' || code === 'ATTENDANCE_NOT_APPLICABLE' || res?.status === 403) {
    return {
      title: 'Chưa được phép chấm công',
      message: 'Tài khoản chưa được phép chấm công. Liên hệ văn phòng.',
      shouldRefetch: false,
    };
  }
  if (code === 'VALIDATION_ERROR' || res?.status === 400) {
    if (Array.isArray(res?.errors) && res.errors.length > 0) {
      return {
        title: 'Thông tin chưa hợp lệ',
        message: res.errors.map((e) => viFieldError(e)).join('\n'),
        shouldRefetch: false,
      };
    }
    return {
      title: 'Thông tin chưa hợp lệ',
      message: res?.message || viServerMessage(null, 'VALIDATION_ERROR', 400),
      shouldRefetch: false,
    };
  }
  return {
    title: 'Không thể vào ca',
    message: res?.message || 'Không thể vào ca lúc này. Vui lòng thử lại.',
    shouldRefetch: false,
  };
};

export const normalizeAttendanceResponse = (rawData) => {
  if (!rawData || typeof rawData !== 'object' || (!('days' in rawData) && !('summary' in rawData))) {
    return null;
  }
  const days = Array.isArray(rawData.days)
    ? [...rawData.days].sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))
    : [];
  return {
    user: rawData.user || null,
    days,
    summary: rawData.summary || null,
  };
};

export const normalizeViolationsResponse = (rawData) => {
  const items = Array.isArray(rawData?.items)
    ? [...rawData.items].sort(
      (a, b) => String(b?.date || '').localeCompare(String(a?.date || ''))
        || String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')),
    )
    : [];
  const summary = rawData?.summary || {};
  return {
    items,
    summary: {
      count: Number(summary?.count ?? items.length) || 0,
      totalFine: Number(summary?.totalFine ?? 0) || 0,
    },
  };
};

export const findTodayShiftRecord = (attendanceData, workDate, technicianShiftId) => {
  if (!attendanceData?.days || technicianShiftId == null) return null;
  const day = attendanceData.days.find((d) => String(d?.date || '') === String(workDate || ''));
  if (!day || !Array.isArray(day.shifts)) return null;
  return day.shifts.find((sh) => String(sh?.technicianShiftId) === String(technicianShiftId)) || null;
};

/** Đổi chuỗi giờ ('08:30', '08h30 - 11h30', ISO timestamp, Date, ms) thành số phút từ 00:00 (GMT+7). */
export const parseShiftTimeToMinutes = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date || typeof value === 'number') {
    const p = toVnParts(value);
    return p ? p.hour * 60 + p.minute : null;
  }
  const str = String(value).trim();
  if (!str) return null;
  if (/T\d{2}:\d{2}/.test(str)) {
    const p = toVnParts(str);
    return p ? p.hour * 60 + p.minute : null;
  }
  const m = /(\d{1,2})\s*[h:]\s*(\d{2})/i.exec(str);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return hh * 60 + mm;
    }
  }
  const p = toVnParts(str);
  return p ? p.hour * 60 + p.minute : null;
};

/** Xếp công việc (slot hoặc order) vào Ca 1 ('ca1': 08h30-11h30), Ca 2 ('ca2': 13h30-17h30) hoặc null (ngoài khung ca). */
export const classifyJobToWorkShift = (slotOrOrder) => {
  if (!slotOrOrder) return null;
  const isObj = typeof slotOrOrder === 'object' && !(slotOrOrder instanceof Date);
  const slot = isObj ? slotOrOrder.slot : slotOrOrder;
  const slotStr = String(slot || '').trim();
  if (/\bca\s*1\b|\bca1\b/i.test(slotStr)) return 'ca1';
  if (/\bca\s*2\b|\bca2\b/i.test(slotStr)) return 'ca2';
  let mins = slotStr ? parseShiftTimeToMinutes(slotStr) : null;
  if (mins == null && isObj && slotOrOrder.preferredTimeAt != null) {
    mins = parseShiftTimeToMinutes(slotOrOrder.preferredTimeAt);
  }
  if (mins == null) return null;
  if (mins >= 6 * 60 && mins < 12 * 60) return 'ca1';
  if (mins >= 12 * 60 && mins <= 17 * 60 + 30) return 'ca2';
  return null;
};

/** Nhận diện một bản ghi ca làm việc / chấm công có khớp Ca 1 (08:30-11:30) hay Ca 2 (13:30-17:30) không. */
export const identifyTechWorkShift = (shift) => {
  if (!shift || typeof shift !== 'object') return null;
  const startRaw = shift.startTime ?? shift.startsAt ?? shift.starts_at;
  const endRaw = shift.endTime ?? shift.endsAt ?? shift.ends_at;
  const startMin = parseShiftTimeToMinutes(startRaw);
  const endMin = parseShiftTimeToMinutes(endRaw);
  if (startMin != null && endMin != null) {
    if (startMin >= 7 * 60 + 30 && startMin <= 10 * 60 + 30 && endMin <= 12 * 60 + 30) {
      return TECH_WORK_SHIFTS[0];
    }
    if (startMin >= 12 * 60 + 30 && startMin <= 15 * 60 + 30 && endMin <= 18 * 60 + 30) {
      return TECH_WORK_SHIFTS[1];
    }
    return null;
  }
  const labelText = `${shift.code || ''} ${shift.shiftCode || ''} ${shift.name || ''} ${shift.shiftName || ''}`.trim();
  if (/\bca\s*1\b|\bca1\b/i.test(labelText)) return TECH_WORK_SHIFTS[0];
  if (/\bca\s*2\b|\bca2\b/i.test(labelText)) return TECH_WORK_SHIFTS[1];
  return null;
};

/** Sắp xếp danh sách ca làm việc theo giờ bắt đầu (Ca 1 trước Ca 2). */
export const sortTechShifts = (items = []) => {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const ma = parseShiftTimeToMinutes(a?.startTime ?? a?.startsAt ?? a?.starts_at) ?? 9999;
    const mb = parseShiftTimeToMinutes(b?.startTime ?? b?.startsAt ?? b?.starts_at) ?? 9999;
    return ma - mb;
  });
};
