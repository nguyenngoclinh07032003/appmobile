import {
  BASE_WARRANTY_DAYS,
  WARRANTY_FINAL_DAY_CUTOFF_HOUR,
  WARRANTY_ALERT_MILESTONES,
  WARRANTY_MIN_LEAD_MINUTES,
} from '../constants/appPolicy.js';
import { TIME_SLOTS } from '../constants/data.js';

export const DAY_MS = 86400000;

export const padZero = (n) => String(n).padStart(2, '0');

/**
 * Chuyển timestamp / Date sang chuỗi 'YYYY-MM-DD' (theo giờ địa phương).
 */
export function formatYmd(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
}

/**
 * Trích xuất giờ bắt đầu của ca làm việc.
 * Ví dụ: '08h00 - 10h00' -> 8; '18h00 - 20h00' -> 18.
 */
export function parseSlotStartHour(slotStr) {
  const m = String(slotStr || '').match(/^(\d{1,2})h/);
  return m ? Number(m[1]) : 8;
}

/**
 * Tính toán ngày kết thúc bảo hành (hết 23:59:59 của ngày thứ N).
 */
export function getWarrantyEndTimestamp(completedAt, warrantyDays = BASE_WARRANTY_DAYS) {
  const startDate = new Date(completedAt);
  // Đưa về 00:00:00 của ngày hoàn thành để tính tròn ngày lịch
  const startDayZero = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  // Ngày thứ N kết thúc vào 23:59:59.999
  return startDayZero + (warrantyDays * DAY_MS) + (DAY_MS - 1);
}

/**
 * Lọc danh sách ca làm việc của ngày hôm nay dựa trên giờ hiện tại và lead time thợ.
 */
export function getAvailableSlotsForToday(curDate = new Date(), leadMinutes = WARRANTY_MIN_LEAD_MINUTES) {
  const curHour = curDate.getHours() + curDate.getMinutes() / 60;
  return TIME_SLOTS.filter((slot) => {
    const startH = parseSlotStartHour(slot);
    return startH >= curHour + (leadMinutes / 60);
  });
}

/**
 * Thuật toán phân tích khả dụng bảo hành toàn diện.
 * - Kiểm tra ngày thường / ngày cận hạn / ngày cuối cùng (ngày 60).
 * - Xét giờ cắt ca thợ (18h00) trong ngày cuối cùng.
 */
export function analyzeWarrantyEligibility({
  completedAt,
  warrantyDays = BASE_WARRANTY_DAYS,
  serverNow = Date.now(),
}) {
  if (!completedAt) {
    return {
      eligible: false,
      reason: 'WARRANTY_NOT_STARTED',
      message: 'Đơn hàng chưa hoàn thành, bảo hành chưa bắt đầu.',
      daysLeft: 0,
      isFinalDay: false,
    };
  }

  const now = new Date(serverNow);
  const endTimestamp = getWarrantyEndTimestamp(completedAt, warrantyDays);
  const endDate = new Date(endTimestamp);

  const todayYmd = formatYmd(now);
  const endYmd = formatYmd(endDate);

  // Đã quá ngày cuối cùng
  if (todayYmd > endYmd || serverNow > endTimestamp) {
    return {
      eligible: false,
      reason: 'WARRANTY_EXPIRED',
      message: `Đơn hàng đã hết thời hạn bảo hành ${warrantyDays} ngày (hết hạn ngày ${padZero(endDate.getDate())}/${padZero(endDate.getMonth() + 1)}/${endDate.getFullYear()}).`,
      daysLeft: 0,
      isFinalDay: false,
      until: endTimestamp,
    };
  }

  // Số ngày còn lại tính theo ngày lịch
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endDayZero = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  const daysLeft = Math.round((endDayZero - todayZero) / DAY_MS) + 1; // Bao gồm cả hôm nay

  const isFinalDay = todayYmd === endYmd || daysLeft <= 1;
  const curHour = now.getHours() + now.getMinutes() / 60;
  const todaySlots = getAvailableSlotsForToday(now);

  // =========================================================================
  // ĐẶC THÙ NGHIỆP VỤ BIÊN: NGÀY THỨ 60 (NGÀY CUỐI CÙNG)
  // =========================================================================
  if (isFinalDay) {
    // Nếu đã quá 18h00 hoặc không còn ca làm việc nào của thợ trong ngày:
    if (curHour >= WARRANTY_FINAL_DAY_CUTOFF_HOUR || todaySlots.length === 0) {
      return {
        eligible: false,
        reason: 'WARRANTY_FINAL_DAY_CUTOFF',
        message: 'Hôm nay là ngày cuối cùng trong thời hạn bảo hành và đã quá giờ làm việc khả dụng của kỹ thuật viên (sau 18h00).',
        isFinalDay: true,
        daysLeft: 1,
        cutoffHour: WARRANTY_FINAL_DAY_CUTOFF_HOUR,
        until: endTimestamp,
        availableDates: [],
        availableSlots: [],
      };
    }

    // Còn giờ trong ngày cuối: Khóa chặt danh sách ngày CHỈ CÒN DUY NHẤT HÔM NAY
    return {
      eligible: true,
      isFinalDay: true,
      daysLeft: 1,
      until: endTimestamp,
      availableDates: [todayYmd],
      availableSlots: todaySlots,
      notice: 'Hôm nay là ngày cuối cùng của thời hạn bảo hành. Bạn chỉ có thể đặt lịch kiểm tra trong ngày hôm nay.',
    };
  }

  // =========================================================================
  // NGÀY BÌNH THƯỜNG (> 1 NGÀY): Cho phép chọn tối đa 7 ngày tới
  // =========================================================================
  const availableDates = [];
  const maxDaysAhead = Math.min(7, daysLeft);
  for (let i = 0; i < maxDaysAhead; i++) {
    const d = new Date(todayZero + i * DAY_MS);
    const ymd = formatYmd(d);
    if (ymd <= endYmd) {
      availableDates.push(ymd);
    }
  }

  return {
    eligible: true,
    isFinalDay: false,
    daysLeft,
    until: endTimestamp,
    availableDates,
    availableSlots: todaySlots,
  };
}

/**
 * Kiểm tra xem một đơn hàng có rơi vào mốc cần gửi cảnh báo sắp hết hạn hay không.
 * Trả về mốc ngày [7, 3, 1] hoặc null.
 */
export function checkWarrantyAlertMilestone(completedAt, warrantyDays = BASE_WARRANTY_DAYS, nowTs = Date.now()) {
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays, serverNow: nowTs });
  if (!res.eligible && res.reason === 'WARRANTY_EXPIRED') return null;
  if (WARRANTY_ALERT_MILESTONES.includes(res.daysLeft)) {
    return res.daysLeft;
  }
  return null;
}
