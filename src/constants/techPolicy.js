/** Chính sách kỷ luật / uy tín thợ — hạn chế hủy sau nhận & đến muộn */
import { vnTimestamp } from '../utils/vnTime.js';
import { HOTLINE } from './data.js';
import { FREE_CANCEL_MIN_BEFORE } from './appPolicy.js';

export const TECH_POLICY = {
  reputationDefault: 100,
  reputationMin: 0,
  reputationMax: 100,
  lockBelow: 60,
  freeCancelMs: 15 * 60 * 1000, // 15 phút sau nhận: miễn phạt nhẹ
  nearSlotMs: 2 * 60 * 60 * 1000, // còn < 2 giờ đến slot → phạt nặng hơn
  maxActiveJobs: 3,
  lateGraceMin: 10,
  lateMidMin: 20,
  lateSevereMin: 45,
  cancelStrikeLockMs: 3 * 24 * 60 * 60 * 1000, // ≥3 hủy sau nhận / 30 ngày → khóa 3 ngày
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const slotStartTs = (order) => {
  // Giờ hẹn thật từ server (preferred_time) — khung giờ hiển thị chỉ làm tròn để xem.
  // Không có thì tính từ ngày + khung giờ theo giờ Việt Nam (GMT+7, khớp buildPreferredTimeIso), không theo múi giờ máy.
  if (order?.preferredTimeAt) return order.preferredTimeAt;
  if (!order?.dateKey || !order?.slot) return null;
  const parts = String(order.dateKey).split('-').map(Number);
  if (parts.length < 3 || parts.some((x) => Number.isNaN(x))) return null;
  const match = String(order.slot).match(/^(\d{1,2})(?:h|:)(\d{2})?/);
  const hour = match ? parseInt(match[1], 10) : parseInt(order.slot, 10);
  const minute = match && match[2] ? parseInt(match[2], 10) : 0;
  if (Number.isNaN(hour)) return null;
  const [y, m, d] = parts;
  return vnTimestamp(y, m, d, hour, minute);
};

/**
 * Đơn bắn cho thợ đã quá hạn tiếp nhận chưa.
 * - Server có hạn phản hồi (offerExpiresAt) thì theo hạn đó.
 * - Không có thì quá hạn khi đã tới giờ bắt đầu khung hẹn (thợ không thể nhận việc đã trễ giờ hẹn).
 * Chỉ áp dụng cho đơn đang chờ nhận ('pending').
 */
export const isOfferExpired = (order, now = Date.now()) => {
  if (!order || order.status !== 'pending') return false;
  if (order.offerExpiresAt && now >= order.offerExpiresAt) return true;
  const start = slotStartTs(order);
  return Boolean(start) && now >= start;
};

/**
 * Kiểm tra xem khách hàng có được phép huỷ đơn hay không.
 * Quy định: Khách hàng không được huỷ đơn khi còn dưới 1 tiếng trước giờ hẹn với thợ.
 */
export const getCancellationWindowStatus = (order, now = Date.now()) => {
  if (!order || !['pending', 'confirmed'].includes(order.status)) {
    return {
      allowed: false,
      reason: 'Đơn hàng ở trạng thái hiện tại không thể tự huỷ qua ứng dụng.',
    };
  }
  // Đơn đang chờ nhận (chưa có thợ) hoặc đã quá hạn tiếp nhận: khách luôn được huỷ tự do.
  if (order.status === 'pending' || isOfferExpired(order, now)) {
    return { allowed: true };
  }
  const startTs = slotStartTs(order);
  if (!startTs) {
    return { allowed: true };
  }
  const diffMs = startTs - now;
  const ONE_HOUR_MS = FREE_CANCEL_MIN_BEFORE * 60 * 1000;
  if (diffMs <= ONE_HOUR_MS) {
    const minsLeft = Math.max(0, Math.floor(diffMs / 60000));
    return {
      allowed: false,
      isNearAppointment: true,
      diffMs,
      minsLeft,
      reason: diffMs <= 0
        ? `Đã qua thời gian hẹn với kỹ thuật viên. Quý khách không thể tự huỷ đơn. Vui lòng liên hệ tổng đài ${HOTLINE}.`
        : `Chỉ còn ${minsLeft} phút đến giờ hẹn (${order.slot}). Theo quy định, quý khách không thể huỷ đơn trước 1 tiếng để đảm bảo quyền lợi và lịch trình của kỹ thuật viên. Vui lòng liên hệ tổng đài ${HOTLINE} nếu có việc đột xuất.`,
    };
  }
  return { allowed: true, diffMs };
};

export const normalizeTechRep = (profile) => {
  const p = profile && typeof profile === 'object' ? profile : {};
  return {
    reputation: clamp(
      p.reputation != null ? Number(p.reputation) : TECH_POLICY.reputationDefault,
      TECH_POLICY.reputationMin,
      TECH_POLICY.reputationMax,
    ),
    lockedUntil: p.lockedUntil || 0,
    violations: Array.isArray(p.violations) ? p.violations.slice(0, 40) : [],
    cancelAfterAcceptCount: p.cancelAfterAcceptCount || 0,
    lateCount: p.lateCount || 0,
  };
};

/** Đánh giá mức phạt khi trả việc sau khi đã nhận */
export const assessCancelAfterAccept = (order, now = Date.now()) => {
  const acceptedAt = order?.acceptedAt || order?.history?.find((h) => h.status === 'confirmed')?.at || now;
  const sinceAccept = now - acceptedAt;
  const start = slotStartTs(order);
  const nearSlot = start != null && start - now <= TECH_POLICY.nearSlotMs;

  if (['onway', 'diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(order?.status)) {
    return {
      tier: 'onway',
      points: 25,
      lockMs: 24 * 60 * 60 * 1000,
      free: false,
      label: 'Hủy khi đã di chuyển / đang xử lý',
      customerNote: 'Thợ đã nhận việc nhưng không thể tiếp tục. Hệ thống đang tìm thợ khác và gửi ưu đãi xin lỗi.',
      voucher: { prefix: 'XINLOI', label: 'Xin lỗi đổi thợ · giảm 30.000đ', discount: 30000, min: 0 },
    };
  }
  if (nearSlot || sinceAccept > TECH_POLICY.freeCancelMs) {
    const heavy = nearSlot;
    return {
      tier: heavy ? 'near' : 'early',
      points: heavy ? 15 : 5,
      lockMs: heavy ? 4 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000,
      free: false,
      label: heavy ? 'Hủy sát giờ hẹn' : 'Hủy sau nhận (hết cửa sổ miễn phạt)',
      customerNote: heavy
        ? 'Thợ trả việc sát giờ hẹn. Bạn được ưu tiên điều phối lại và nhận mã giảm giá xin lỗi.'
        : 'Thợ trả việc sau khi nhận. Hệ thống đang tìm thợ khác cho bạn.',
      voucher: heavy
        ? { prefix: 'XINLOI', label: 'Xin lỗi đổi thợ · giảm 20.000đ', discount: 20000, min: 0 }
        : null,
    };
  }
  return {
    tier: 'free',
    points: 0,
    lockMs: 0,
    free: true,
    label: 'Trả việc trong 15 phút đầu (miễn phạt)',
    customerNote: 'Thợ vừa nhận việc đã trả lại sớm. Hệ thống đang tìm thợ khác.',
    voucher: null,
  };
};
