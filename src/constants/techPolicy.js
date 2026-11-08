/** Chính sách kỷ luật / uy tín thợ — hạn chế hủy sau nhận & đến muộn */

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
  if (!order?.dateKey || !order?.slot) return null;
  const parts = String(order.dateKey).split('-').map(Number);
  if (parts.length < 3 || parts.some((x) => Number.isNaN(x))) return null;
  const match = String(order.slot).match(/^(\d{1,2})(?:h|:)(\d{2})?/);
  const hour = match ? parseInt(match[1], 10) : parseInt(order.slot, 10);
  const minute = match && match[2] ? parseInt(match[2], 10) : 0;
  if (Number.isNaN(hour)) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime();
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
  const startTs = slotStartTs(order);
  if (!startTs) {
    return { allowed: true };
  }
  const diffMs = startTs - now;
  const ONE_HOUR_MS = 60 * 60 * 1000;
  if (diffMs <= ONE_HOUR_MS) {
    const minsLeft = Math.max(0, Math.floor(diffMs / 60000));
    return {
      allowed: false,
      isNearAppointment: true,
      diffMs,
      minsLeft,
      reason: diffMs <= 0
        ? 'Đã qua thời gian hẹn với kỹ thuật viên. Quý khách không thể tự huỷ đơn. Vui lòng liên hệ Hotline 1900 6868.'
        : `Chỉ còn ${minsLeft} phút đến giờ hẹn (${order.slot}). Theo quy định, quý khách không thể huỷ đơn trước 1 tiếng để đảm bảo quyền lợi và lịch trình của kỹ thuật viên. Vui lòng liên hệ Hotline 1900 6868 nếu có việc đột xuất.`,
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

export const isTechLocked = (profile, now = Date.now()) => {
  const rep = normalizeTechRep(profile);
  if (rep.lockedUntil > now) return true;
  if (rep.reputation < TECH_POLICY.lockBelow) return true;
  return false;
};

export const techLockReason = (profile, now = Date.now()) => {
  const rep = normalizeTechRep(profile);
  if (rep.lockedUntil > now) {
    const mins = Math.ceil((rep.lockedUntil - now) / 60000);
    if (mins >= 60) return `Tạm khóa nhận việc còn ~${Math.ceil(mins / 60)} giờ do vi phạm gần đây.`;
    return `Tạm khóa nhận việc còn ~${mins} phút do vi phạm gần đây.`;
  }
  if (rep.reputation < TECH_POLICY.lockBelow) {
    return `Điểm uy tín ${rep.reputation}/${TECH_POLICY.reputationMax} dưới ngưỡng ${TECH_POLICY.lockBelow}. Liên hệ điều phối để mở lại.`;
  }
  return '';
};

/** Đánh giá mức phạt khi trả việc sau khi đã nhận */
export const assessCancelAfterAccept = (order, now = Date.now()) => {
  const acceptedAt = order?.acceptedAt || order?.history?.find((h) => h.status === 'confirmed')?.at || now;
  const sinceAccept = now - acceptedAt;
  const start = slotStartTs(order);
  const nearSlot = start != null && start - now <= TECH_POLICY.nearSlotMs;

  if (order?.status === 'onway' || order?.status === 'diagnosing' || order?.status === 'quoted' || order?.status === 'repairing') {
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
        ? 'Thợ trả việc sát giờ hẹn. Bạn được ưu tiên điều phối lại và nhận voucher xin lỗi.'
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

/** Đánh giá check-in muộn so với đầu khung giờ */
export const assessLateness = (order, now = Date.now()) => {
  const start = slotStartTs(order);
  if (start == null) return { minutesLate: 0, tier: 'ok', points: 0, compensationPercent: 0 };
  const minutesLate = Math.max(0, Math.floor((now - start) / 60000));
  if (minutesLate <= TECH_POLICY.lateGraceMin) {
    return { minutesLate, tier: 'ok', points: 0, compensationPercent: 0, label: 'Đúng giờ / trễ nhẹ' };
  }
  if (minutesLate <= TECH_POLICY.lateMidMin) {
    return {
      minutesLate, tier: 'soft', points: 5, compensationPercent: 0,
      label: `Trễ ${minutesLate} phút (cảnh báo)`,
    };
  }
  if (minutesLate <= TECH_POLICY.lateSevereMin) {
    return {
      minutesLate, tier: 'mid', points: 10, compensationPercent: 20,
      label: `Trễ ${minutesLate} phút`,
      voucher: { prefix: 'TRE20', label: 'Bồi thường thợ đến muộn · giảm 20% tối đa 100.000đ', percent: 20, max: 100000, min: 0 },
    };
  }
  return {
    minutesLate, tier: 'severe', points: 20, compensationPercent: 50,
    label: `Trễ ${minutesLate} phút (nghiêm trọng)`,
    voucher: { prefix: 'TRE50', label: 'Bồi thường thợ đến muộn · giảm 50% NC tối đa 200.000đ', percent: 50, max: 200000, min: 0 },
  };
};

export const applyTechPenalty = (profile, { points = 0, lockMs = 0, violation }) => {
  const cur = normalizeTechRep(profile);
  const reputation = clamp(cur.reputation - (points || 0), TECH_POLICY.reputationMin, TECH_POLICY.reputationMax);
  const lockedUntil = Math.max(cur.lockedUntil || 0, lockMs ? Date.now() + lockMs : 0);
  const violations = violation
    ? [{ id: `${Date.now().toString(36)}`, at: Date.now(), ...violation, points }, ...cur.violations].slice(0, 40)
    : cur.violations;
  let cancelAfterAcceptCount = cur.cancelAfterAcceptCount;
  let lateCount = cur.lateCount;
  if (violation?.type === 'cancel_after_accept') cancelAfterAcceptCount += 1;
  if (violation?.type === 'late_arrival') lateCount += 1;

  // Tái phạm hủy sau nhận trong 30 ngày → khóa dài
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCancels = violations.filter((v) => v.type === 'cancel_after_accept' && v.at >= monthAgo).length;
  const strikeLock = recentCancels >= 3 ? Date.now() + TECH_POLICY.cancelStrikeLockMs : 0;

  return {
    ...profile,
    reputation,
    lockedUntil: Math.max(lockedUntil, strikeLock),
    violations,
    cancelAfterAcceptCount,
    lateCount,
  };
};

export const applyTechBonus = (profile, points = 1) => {
  const cur = normalizeTechRep(profile);
  return {
    ...profile,
    reputation: clamp(cur.reputation + points, TECH_POLICY.reputationMin, TECH_POLICY.reputationMax),
  };
};

export const reputationTone = (score) => {
  if (score >= 85) return { label: 'Tốt', fg: '#15803D', bg: '#DCFCE7' };
  if (score >= 70) return { label: 'Ổn', fg: '#A16207', bg: '#FEF3C7' };
  if (score >= TECH_POLICY.lockBelow) return { label: 'Cảnh báo', fg: '#C2410C', bg: '#FFEDD5' };
  return { label: 'Bị hạn chế', fg: '#B91C1C', bg: '#FEE2E2' };
};

export const mintWalletVoucher = (template) => {
  if (!template) return null;
  const code = `${template.prefix}${String(Date.now()).slice(-4)}`;
  return {
    code,
    label: template.label,
    discount: template.discount,
    percent: template.percent,
    max: template.max,
    min: template.min || 0,
    wallet: true,
  };
};
