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
  const m = String(slotStr || '').match(/^(\d{1,2})h(\d{2})?/);
  if (!m) return 8;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
}

/**
 * Ngày kết thúc bảo hành (23:59:59.999).
 * Quy ước: ngày hoàn thành là NGÀY 0, ngày thứ N là ngày hoàn thành + N ngày
 * (xong 19/09, bảo hành 60 ngày → hết hạn cuối ngày 18/11).
 * Nếu server có warranty_end_date thì ưu tiên mốc của server (nguồn sự thật).
 */
export function getWarrantyEndTimestamp(completedAt, warrantyDays = BASE_WARRANTY_DAYS, serverEndAt = null) {
  if (serverEndAt) {
    const e = new Date(serverEndAt);
    if (!Number.isNaN(e.getTime())) {
      return new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime() + (DAY_MS - 1);
    }
  }
  const startDate = new Date(completedAt);
  const startDayZero = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  return startDayZero + (warrantyDays * DAY_MS) + (DAY_MS - 1);
}

/** Ca có nằm trong giờ làm việc của thợ ở ngày cuối bảo hành không (bắt đầu trước 18h00). */
export function isSlotBeforeFinalCutoff(slot) {
  return parseSlotStartHour(slot) < WARRANTY_FINAL_DAY_CUTOFF_HOUR;
}

/**
 * Lọc danh sách ca làm việc của ngày hôm nay dựa trên giờ hiện tại và lead time thợ.
 */
export function getAvailableSlotsForToday(curDate = new Date(), leadMinutes = WARRANTY_MIN_LEAD_MINUTES) {
  const curHour = curDate.getHours() + curDate.getMinutes() / 60;
  return TIME_SLOTS.filter((slot) => parseSlotStartHour(slot) >= curHour + (leadMinutes / 60));
}

/**
 * Danh sách ca khả dụng cho một ngày cụ thể:
 * - Hôm nay: bỏ các ca đã qua / quá sát giờ.
 * - Ngày cuối bảo hành (dù là hôm nay hay đặt trước): chỉ các ca bắt đầu trước 18h00.
 * - Sau ngày cuối: không có ca nào.
 */
export function getSlotsForDate(ymd, { now = new Date(), endYmd = null } = {}) {
  const todayYmd = formatYmd(now);
  if (!ymd || ymd < todayYmd) return [];
  if (endYmd && ymd > endYmd) return [];
  let slots = ymd === todayYmd ? getAvailableSlotsForToday(now) : [...TIME_SLOTS];
  if (endYmd && ymd === endYmd) slots = slots.filter(isSlotBeforeFinalCutoff);
  return slots;
}

/** Kiểm tra lại ngay trước khi gửi: ca đã chọn còn đặt được không. */
export function isWarrantySlotBookable({ ymd, slot, now = new Date(), endYmd = null }) {
  return getSlotsForDate(ymd, { now, endYmd }).includes(slot);
}

/**
 * Thuật toán phân tích khả dụng bảo hành toàn diện.
 * - Kiểm tra ngày thường / ngày cận hạn / ngày cuối cùng.
 * - Xét giờ cắt ca thợ (18h00) trong ngày cuối cùng.
 */
export function analyzeWarrantyEligibility({
  completedAt,
  warrantyDays = BASE_WARRANTY_DAYS,
  serverNow = Date.now(),
  warrantyEndAt = null,
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
  const endTimestamp = getWarrantyEndTimestamp(completedAt, warrantyDays, warrantyEndAt);
  const endDate = new Date(endTimestamp);

  const todayYmd = formatYmd(now);
  const endYmd = formatYmd(endDate);

  if (todayYmd > endYmd || serverNow > endTimestamp) {
    return {
      eligible: false,
      reason: 'WARRANTY_EXPIRED',
      message: `Đơn hàng đã hết thời hạn bảo hành ${warrantyDays} ngày (hết hạn ngày ${padZero(endDate.getDate())}/${padZero(endDate.getMonth() + 1)}/${endDate.getFullYear()}).`,
      daysLeft: 0,
      isFinalDay: false,
      until: endTimestamp,
      endYmd,
    };
  }

  // Số ngày còn lại tính theo ngày lịch (bao gồm hôm nay), không vượt quá tổng số ngày bảo hành
  // (ngày hoàn thành là ngày 0 nên không hiển thị "61/60").
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endDayZero = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  const rawDaysLeft = Math.round((endDayZero - todayZero) / DAY_MS) + 1;
  const daysLeft = Math.max(1, Math.min(warrantyDays, rawDaysLeft));

  const isFinalDay = todayYmd === endYmd;

  // =========================================================================
  // NGÀY CUỐI CÙNG: chỉ được đặt hôm nay, chỉ các ca bắt đầu trước 18h00
  // =========================================================================
  if (isFinalDay) {
    const curHour = now.getHours() + now.getMinutes() / 60;
    const finalSlots = getSlotsForDate(todayYmd, { now, endYmd });
    if (curHour >= WARRANTY_FINAL_DAY_CUTOFF_HOUR || finalSlots.length === 0) {
      return {
        eligible: false,
        reason: 'WARRANTY_FINAL_DAY_CUTOFF',
        message: 'Hôm nay là ngày cuối cùng trong thời hạn bảo hành và đã quá giờ làm việc khả dụng của kỹ thuật viên (sau 18h00).',
        isFinalDay: true,
        daysLeft: 1,
        cutoffHour: WARRANTY_FINAL_DAY_CUTOFF_HOUR,
        until: endTimestamp,
        endYmd,
        availableDates: [],
        availableSlots: [],
      };
    }

    return {
      eligible: true,
      isFinalDay: true,
      daysLeft: 1,
      until: endTimestamp,
      endYmd,
      availableDates: [todayYmd],
      availableSlots: finalSlots,
      notice: 'Hôm nay là ngày cuối cùng của thời hạn bảo hành. Bạn chỉ có thể đặt lịch kiểm tra trong ngày hôm nay, trước 18h00.',
    };
  }

  // =========================================================================
  // NGÀY BÌNH THƯỜNG: tối đa 7 ngày tới, bỏ những ngày không còn ca nào
  // =========================================================================
  const availableDates = [];
  for (let i = 0; i < Math.min(7, rawDaysLeft); i++) {
    const ymd = formatYmd(new Date(todayZero + i * DAY_MS + 12 * 3600000));
    if (ymd > endYmd) break;
    if (getSlotsForDate(ymd, { now, endYmd }).length) availableDates.push(ymd);
  }

  return {
    eligible: true,
    isFinalDay: false,
    daysLeft,
    until: endTimestamp,
    endYmd,
    availableDates,
    availableSlots: getSlotsForDate(availableDates[0] || todayYmd, { now, endYmd }),
  };
}

/**
 * Kiểm tra đơn có rơi vào mốc cần gửi cảnh báo sắp hết hạn hay không.
 * Trả về mốc ngày [7, 3, 1] hoặc null. Không báo khi đã hết hạn / đã quá giờ chốt ngày cuối.
 */
export function checkWarrantyAlertMilestone(completedAt, warrantyDays = BASE_WARRANTY_DAYS, nowTs = Date.now(), warrantyEndAt = null) {
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays, serverNow: nowTs, warrantyEndAt });
  if (!res.eligible) return null;
  return WARRANTY_ALERT_MILESTONES.includes(res.daysLeft) ? res.daysLeft : null;
}
