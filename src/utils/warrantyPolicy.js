import {
  BASE_WARRANTY_DAYS,
  WARRANTY_FINAL_DAY_CUTOFF_HOUR,
  WARRANTY_ALERT_MILESTONES,
  WARRANTY_MIN_LEAD_MINUTES,
} from '../constants/appPolicy.js';
import { TIME_SLOTS } from '../constants/data.js';
import { toVnParts, vnTimestamp } from './vnTime.js';
import { toVietnamese } from './viText.js';

export const DAY_MS = 86400000;

export const padZero = (n) => String(n).padStart(2, '0');

/**
 * Chuyển timestamp / Date sang chuỗi 'YYYY-MM-DD' (theo giờ Việt Nam GMT+7 cố định).
 */
export function formatYmd(d) {
  const p = toVnParts(d);
  if (!p) return '';
  return `${p.year}-${padZero(p.month)}-${padZero(p.day)}`;
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
 * Ngày kết thúc bảo hành (23:59:59.999 giờ Việt Nam GMT+7).
 * Quy ước: ngày hoàn thành là NGÀY 0, ngày thứ N là ngày hoàn thành + N ngày
 * (xong 19/09, bảo hành 60 ngày → hết hạn cuối ngày 18/11).
 * Nếu server có warranty_end_date thì ưu tiên mốc của server (nguồn sự thật).
 */
export function getWarrantyEndTimestamp(completedAt, warrantyDays = BASE_WARRANTY_DAYS, serverEndAt = null) {
  if (serverEndAt) {
    if (typeof serverEndAt === 'string') {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?)?$/.exec(serverEndAt.trim());
      if (m) {
        return vnTimestamp(Number(m[1]), Number(m[2]), Number(m[3])) + (DAY_MS - 1);
      }
    }
    const ep = toVnParts(serverEndAt);
    if (ep) {
      return vnTimestamp(ep.year, ep.month, ep.day) + (DAY_MS - 1);
    }
  }
  const sp = toVnParts(completedAt);
  if (!sp) return Date.now();
  const startDayZero = vnTimestamp(sp.year, sp.month, sp.day);
  return startDayZero + (warrantyDays * DAY_MS) + (DAY_MS - 1);
}

/** Ca có nằm trong giờ làm việc của thợ ở ngày cuối bảo hành không (bắt đầu trước 18h00). */
export function isSlotBeforeFinalCutoff(slot) {
  return parseSlotStartHour(slot) < WARRANTY_FINAL_DAY_CUTOFF_HOUR;
}

/**
 * Lọc danh sách ca làm việc của ngày hôm nay dựa trên giờ hiện tại (GMT+7) và lead time thợ.
 */
export function getAvailableSlotsForToday(curDate = new Date(), leadMinutes = WARRANTY_MIN_LEAD_MINUTES) {
  const p = toVnParts(curDate);
  const curHour = p ? (p.hour + p.minute / 60) : 0;
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
 * Thuật toán phân tích khả dụng bảo hành toàn diện (theo giờ Việt Nam GMT+7).
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

  const np = toVnParts(now);
  const ep = toVnParts(endTimestamp);
  const todayYmd = formatYmd(now);
  const endYmd = formatYmd(endDate);

  if (!np || !ep || todayYmd > endYmd || serverNow > endTimestamp) {
    return {
      eligible: false,
      reason: 'WARRANTY_EXPIRED',
      message: ep
        ? `Đơn hàng đã hết thời hạn bảo hành ${warrantyDays} ngày (hết hạn ngày ${padZero(ep.day)}/${padZero(ep.month)}/${ep.year}).`
        : `Đơn hàng đã hết thời hạn bảo hành ${warrantyDays} ngày.`,
      daysLeft: 0,
      isFinalDay: false,
      until: endTimestamp,
      endYmd,
    };
  }

  // Số ngày còn lại tính theo ngày lịch (bao gồm hôm nay), không vượt quá tổng số ngày bảo hành
  // (ngày hoàn thành là ngày 0 nên không hiển thị "61/60").
  const todayZero = vnTimestamp(np.year, np.month, np.day);
  const endDayZero = vnTimestamp(ep.year, ep.month, ep.day);
  const rawDaysLeft = Math.round((endDayZero - todayZero) / DAY_MS) + 1;
  const daysLeft = Math.max(1, Math.min(warrantyDays, rawDaysLeft));

  const isFinalDay = todayYmd === endYmd;

  // =========================================================================
  // NGÀY CUỐI CÙNG: chỉ được đặt hôm nay, chỉ các ca bắt đầu trước 18h00
  // =========================================================================
  if (isFinalDay) {
    const curHour = np.hour + np.minute / 60;
    const finalSlots = getSlotsForDate(todayYmd, { now, endYmd });
    if (curHour >= WARRANTY_FINAL_DAY_CUTOFF_HOUR || finalSlots.length === 0) {
      return {
        eligible: false,
        reason: 'WARRANTY_FINAL_DAY_CUTOFF',
        message: curHour >= WARRANTY_FINAL_DAY_CUTOFF_HOUR
          ? 'Hôm nay là ngày cuối cùng trong thời hạn bảo hành và đã quá giờ làm việc khả dụng của kỹ thuật viên (sau 18h00).'
          : 'Hôm nay là ngày cuối cùng trong thời hạn bảo hành và đã hết khung giờ nhận ca khả dụng trước 18h00.',
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

export function normalizeWarrantyEndYmd(rawEnd) {
  if (!rawEnd) return null;
  if (rawEnd instanceof Date || typeof rawEnd === 'number') {
    return formatYmd(rawEnd) || null;
  }
  const trimmed = String(rawEnd).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}(?:$|T00:00:00(?:\.000)?Z?$|T23:59:59(?:\.\d+)?Z?$)/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const ymd = formatYmd(parsed);
    if (ymd) return ymd;
  }
  return /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)?.[1] || null;
}

/**
 * Hợp nhất dữ liệu từ API GET /customer/requests/:id/warranty-eligibility vào kết quả kiểm tra cục bộ.
 */
export function applyServerWarrantyEligibility(baseInfo, serverElig, formatDateFn, nowInput = new Date()) {
  if (!serverElig || typeof serverElig !== 'object') return baseInfo;
  const rawSrvDays = serverElig.warranty_days ?? serverElig.warrantyDays;
  const numSrvDays = rawSrvDays != null && rawSrvDays !== '' ? Number(rawSrvDays) : NaN;
  const srvDays = Number.isFinite(numSrvDays) && numSrvDays >= 0 ? Math.round(numSrvDays) : null;
  const totalDays = srvDays != null ? srvDays : (baseInfo?.totalDays ?? 0);
  const rawEnd = serverElig.warranty_end_date || serverElig.warrantyEndDate || null;
  const normalizedRawEnd = normalizeWarrantyEndYmd(rawEnd);
  const endYmd = normalizedRawEnd || baseInfo?.endYmd || null;
  const until = endYmd
    ? getWarrantyEndTimestamp(null, totalDays || BASE_WARRANTY_DAYS, endYmd)
    : (baseInfo?.until || null);

  if (serverElig.eligible === false) {
    const reason = String(serverElig.reason_code || serverElig.reasonCode || baseInfo?.reason || 'WARRANTY_EXPIRED');
    const isNotStarted = reason === 'WARRANTY_NOT_STARTED';
    const noWarranty = !isNotStarted && (totalDays === 0 || reason === 'WARRANTY_NOT_APPLICABLE' || reason === 'NO_WARRANTY');
    return {
      ...baseInfo,
      ok: false,
      totalDays,
      daysLeft: isNotStarted ? totalDays : 0,
      isFinalDay: !isNotStarted && (reason === 'WARRANTY_FINAL_DAY_CUTOFF' || Boolean(serverElig.is_final_day)),
      isCutoff: reason === 'WARRANTY_FINAL_DAY_CUTOFF',
      notStarted: isNotStarted,
      noWarranty,
      reason,
      until,
      endYmd,
      text: toVietnamese(serverElig.message, '') || (isNotStarted
        ? 'Bảo hành sẽ chính thức bắt đầu từ ngày mai.'
        : (baseInfo?.text || (noWarranty
          ? 'Dịch vụ này không áp dụng bảo hành.'
          : `Đơn đã hết thời hạn bảo hành ${totalDays} ngày.`))),
      supportHotline: serverElig.support_hotline || null,
      retentionVoucher: serverElig.retention_voucher || null,
      fromServer: true,
    };
  }

  if (serverElig.eligible === true) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const todayYmd = formatYmd(now);
    if (endYmd && todayYmd && todayYmd > endYmd) {
      return {
        ...baseInfo,
        ok: false,
        totalDays,
        daysLeft: 0,
        reason: 'WARRANTY_EXPIRED',
        until,
        endYmd,
        text: totalDays > 0
          ? `Đơn đã hết thời hạn bảo hành ${totalDays} ngày.`
          : (baseInfo?.text || 'Đơn đã hết thời hạn bảo hành.'),
      };
    }
    const daysLeft = serverElig.days_remaining != null
      ? Math.max(1, Number(serverElig.days_remaining))
      : (baseInfo?.daysLeft ?? totalDays);
    const isFinalDay = Boolean(serverElig.is_final_day) || Boolean(endYmd && todayYmd === endYmd);
    if (isFinalDay) {
      const np = toVnParts(now);
      const curHour = np ? (np.hour + np.minute / 60) : 0;
      const todayFinalSlots = getSlotsForDate(todayYmd, { now, endYmd: todayYmd });
      if (curHour >= WARRANTY_FINAL_DAY_CUTOFF_HOUR || todayFinalSlots.length === 0) {
        return {
          ...baseInfo,
          ok: false,
          noWarranty: false,
          totalDays,
          daysLeft: 0,
          isFinalDay: true,
          isCutoff: true,
          reason: 'WARRANTY_FINAL_DAY_CUTOFF',
          until,
          endYmd,
          availableDates: [],
          availableSlots: [],
          serverAvailableSlotsToday: [],
          text: baseInfo?.isCutoff && baseInfo?.text
            ? baseInfo.text
            : 'Hôm nay là ngày cuối cùng của thời hạn bảo hành và đã quá giờ nhận ca kỹ thuật viên (18h00).',
          fromServer: true,
        };
      }
    }
    const availableDates = Array.isArray(serverElig.available_dates) && serverElig.available_dates.length
      ? serverElig.available_dates
      : baseInfo?.availableDates;
    const rawServerSlotsToday = Array.isArray(serverElig.available_slots_today)
      ? serverElig.available_slots_today
      : null;
    const serverSlotsToday = rawServerSlotsToday
      ? (isFinalDay ? rawServerSlotsToday.filter(isSlotBeforeFinalCutoff) : rawServerSlotsToday)
      : null;
    const dateText = until && typeof formatDateFn === 'function' ? formatDateFn(until) : '';
    const defaultText = totalDays > 0
      ? `Còn ${daysLeft}/${totalDays} ngày bảo hành${dateText ? ` (đến ${dateText})` : ''}.`
      : (baseInfo?.text || '');
    return {
      ...baseInfo,
      ok: true,
      noWarranty: false,
      totalDays,
      daysLeft,
      isFinalDay,
      isCutoff: false,
      availableDates,
      availableSlots: serverSlotsToday?.length ? serverSlotsToday : baseInfo?.availableSlots,
      serverAvailableSlotsToday: serverSlotsToday,
      until,
      endYmd,
      text: serverElig.notice || defaultText,
      fromServer: true,
    };
  }

  return baseInfo;
}
