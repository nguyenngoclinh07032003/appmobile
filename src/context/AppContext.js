import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { BackHandler, Linking, Platform, AppState } from "react-native";
import {
  getService,
  TECH_ME,
  formatVND,
  catLabel,
  HOTLINE,
  serviceKind,
  matchJobForTech,
  CATEGORIES,
  SERVICES,
  MATERIALS,
  tierOf,
  comboDiscountFor,
  syncCatalogFromBackend,
  syncPolicyFromBackend,
  resolveDbServiceId,
  parseWarrantyDays,
  setServiceWarrantyDays,
  PAYMENT_METHODS,
  STATUS_DESC,
  TECH_STATUS_DESC,
} from "../constants/data";
import { C, STATUS_META } from "../theme/colors";
export { matchJobForTech, comboDiscountFor } from "../constants/data";
import {
  getSession,
  clearSession,
  setSession,
  upsertBackendAccount,
  deleteAccountById,
  clearAccounts,
  hydrateAuthStore,
} from "../services/authService";
import {
  IS_WEB_STORAGE,
  readJsonSync,
  readJson,
  writeJson,
  removeItem as removeStorageItem,
} from "../services/storage";
import { hrmssApi, authTokens, apiEvents, ensureAccessToken } from "../services/api";
import {
  playNotificationSound,
  isSoundMuted,
  subscribeSoundMuted,
  toggleSoundMuted,
} from "../services/soundService";
import {
  initSocket,
  disconnectSocket,
  subscribeSocketEvent,
  joinOrderRoom,
  leaveOrderRoom,
  resubscribeOrderRoom,
  reconnectSocket,
} from "../services/socketService";
import { API_BASE_URL } from "../constants/config";
import { authErrorMessage } from "../utils/authErrorMessages";
import { readTechnicianSpecialties } from "../utils/techProfile";
import {
  analyzeWarrantyEligibility,
  applyServerWarrantyEligibility,
  isWarrantySlotBookable,
  normalizeWarrantyEndYmd,
} from "../utils/warrantyPolicy";
import { toVnParts, vnDateKey } from "../utils/vnTime";
import {
  formatEstimatedExternalDesc,
  formatFinalizedExternalDesc,
  formatRangeVND,
  parseExternalPartDesc,
  normalizeExternalPartName,
  sortQuotationsAsc,
  extractReceiptPartName,
} from "../utils/externalPartsPricing";
import {
  formatSymptomPhotoNote,
  parseSymptomPhotoMeta,
  splitSymptomTokens,
} from "../utils/symptomItems";
import {
  clearReadNotifications,
  shouldKeepNotificationAfterClear,
} from "../utils/notifications";
import { WARRANTY_ALERT_MILESTONES, OTP_TTL_MINUTES } from "../constants/appPolicy";
import { toVietnamese } from "../utils/viText";
import { parseDobToIso } from "../utils/validators";
import {
  mapBackendAddressToApp,
  mapBackendCustomerRequestToOrder,
  mergeCustomerRequestDetail,
  extractInitialAttachments,
  mapBackendTechJobToOrder,
  mapBackendOpenRequestToOrder,
  mergeBackendOrdersWithLocal,
  buildPreferredTimeIso,
  resolveDbMaterialId,
  mapBackendNotification,
  mapWalletVoucher,
  mapPublicVoucher,
  mapRedeemOption,
  mapPointHistory,
  mapBackendPhotoToEvidence,
} from "../services/syncService";
import {
  TECH_POLICY,
  normalizeTechRep,
  assessCancelAfterAccept,
  slotStartTs,
  getCancellationWindowStatus,
  isOfferExpired,
} from "../constants/techPolicy";
import { getCheckInLocation } from "../utils/geo";
import { viNotification } from "../utils/viText";
import { isAttendanceNotifType } from "../utils/attendance";
export {
  TECH_POLICY,
  assessCancelAfterAccept,
  normalizeTechRep,
  slotStartTs,
  getCancellationWindowStatus,
  isOfferExpired,
} from "../constants/techPolicy";

// Ngày sinh: server lưu 'YYYY-MM-DD', app hiển thị 'DD/MM/YYYY'.
const isoToDob = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const dobToIso = (dob) => parseDobToIso(dob);
// Lỗi mạng: ghi rõ địa chỉ server app đang gọi (sai địa chỉ / server tắt thì nhìn là thấy).
const networkError = (res) =>
  res?.code === "TIMEOUT"
    ? `Máy chủ ${API_BASE_URL} phản hồi quá lâu. Kiểm tra mạng rồi thử lại.`
    : `Không kết nối được máy chủ ${API_BASE_URL}. Kiểm tra mạng rồi thử lại.`;

// ---------------------------------------------------------------------------
// Tiện ích thời gian
// ---------------------------------------------------------------------------
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
export const fmtDate = (ts) => {
  const vn = toVnParts(ts);
  if (!vn) return "";
  return `${pad(vn.day)}/${pad(vn.month)}/${vn.year}`;
};
export const fmtDateTime = (ts) => {
  const vn = toVnParts(ts);
  if (!vn) return "";
  return `${pad(vn.hour)}:${pad(vn.minute)} · ${pad(vn.day)}/${pad(vn.month)}`;
};
export const timeAgo = (ts) => {
  if (!ts) return "";
  const s = Math.floor((Date.now() - Number(ts)) / 1000);
  if (s <= 60) return "Vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return fmtDate(ts);
};
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const getPendingExternalEstimates = (o) => {
  const list = Array.isArray(o?.pendingExternalEstimates) ? o.pendingExternalEstimates : [];
  if (!list.length) return [];
  const locallyFin = new Set(
    (o?.locallyFinalizedExternalNames || []).map(normalizeExternalPartName).filter(Boolean),
  );
  if (!locallyFin.size) return list;
  return list.filter((est) => !locallyFin.has(normalizeExternalPartName(est?.name)));
};

export const cartTotal = (items) =>
  items.reduce((sum, it) => sum + (getService(it.id)?.price || 0) * it.qty, 0);
export const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "onway",
  "diagnosing",
  "quoted",
  "repairing",
  "pending_payment",
  "warranty_pending",
  "out_of_warranty",
];
// Server chặn xuất phát / check-in khi báo giá trước khi đi chưa được khách chốt.
const QUOTE_BLOCK_MESSAGES = {
  QUOTATION_PENDING:
    "Khách chưa đồng ý báo giá. Thợ chỉ xuất phát sau khi khách đồng ý.",
  QUOTATION_REVISION_PENDING:
    "Khách yêu cầu báo giá lại. Gửi báo giá mới trước khi xuất phát.",
};
export const isActiveOrder = (o) => ACTIVE_STATUSES.includes(o.status);
// Giá trị dịch vụ khách đã đặt (sau giảm giá dịch vụ + combo, trước voucher)
export const bookedValue = (o) =>
  !o || o.kind === "warranty" || o.kind === "followup"
    ? 0
    : Math.max(
        0,
        (o.goods || 0) - (o.productDiscount || 0) - (o.comboDiscount || 0),
      );
/** Giảm giá linh kiện theo hạng thành viên: lấy từ hoá đơn server (bill.tier_part_discount_amount). */
export const tierPartDiscountAmount = (o) =>
  Number(o?.bill?.tierPartDiscount) || 0;
/** Giảm do thợ đến muộn: lấy từ hoá đơn server (bill.late_discount_amount). */
export const lateDiscountAmount = (o) => Number(o?.bill?.lateDiscount) || 0;
// Chi phí vật tư & phát sinh thực tế trên hoá đơn: suy từ amountDue của server để khớp cân bằng hoá đơn,
// tránh cộng trùng supplemental_total khi quotation_total đã bao gồm phát sinh.
export const billExtraAmount = (o) => {
  if (!o || o.kind === "warranty" || o.kind === "followup" || o.status === "cancelled") {
    return 0;
  }
  const booked = o.goods > 0 ? bookedValue(o) : (Number(o.bill?.bookedAmount) || 0);
  if (o.bill) {
    const deduct =
      tierPartDiscountAmount(o) +
      (Number(o.voucherDiscount) || 0) +
      lateDiscountAmount(o);
    const due = o.bill.amountDue != null ? Math.max(0, Number(o.bill.amountDue) || 0) : null;
    if (due != null && due > 0) {
      return Math.max(0, Math.round(due + deduct - booked));
    }
    if (o.quote?.approvedExtrasTotal != null) {
      return Math.max(0, Math.round(Number(o.quote.approvedExtrasTotal) || 0));
    }
    const supp = Math.max(0, Number(o.bill.supplementalTotal) || 0);
    const orderDisc = (Number(o.productDiscount) || 0) + (Number(o.comboDiscount) || 0);
    const bookedRef = Number(o.bill.bookedAmount) > 0 ? Number(o.bill.bookedAmount) : booked;
    const qDiff = o.bill.quotationTotal != null
      ? Math.max(0, Math.max(0, Number(o.bill.quotationTotal) - orderDisc) - bookedRef)
      : 0;
    return Math.max(supp, qDiff);
  }
  if (o.quote?.approved) {
    return Math.max(0, Math.round(Number(o.quote.approvedExtrasTotal ?? o.quote.extraAmount) || 0));
  }
  return Math.max(0, Math.round(Number(o.quote?.priorApprovedExtra) || 0));
};
// Số tiền khách phải trả = bill.amount_due của server (đã gồm báo giá, phát sinh, giảm hạng, voucher, đến muộn, phí kiểm tra).
// Chưa tải được hoá đơn thì tạm dùng tổng server trả cùng đơn (estimated_total / tổng báo giá đã duyệt).
const INACTIVE_QUOTE_STATUSES = ["REJECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"];
export const orderTotal = (o) => {
  if (!o) return 0;
  if (o.kind === "warranty" || o.kind === "followup") return 0;
  if (o.status === "cancelled") return o.inspectionFee || 0;
  if (["pending_payment", "done"].includes(o.status) && o?.bill && o.bill.amountDue != null) {
    return Math.max(0, Number(o.bill.amountDue) || 0);
  }
  const deduct =
    tierPartDiscountAmount(o) +
    (Number(o.voucherDiscount) || 0) +
    lateDiscountAmount(o);
  const inQuoteOrRepairStage =
    ["confirmed", "onway", "diagnosing", "quoted", "repairing"].includes(
      o.status,
    ) && o.externalPriceState !== "finalized";
  const hasActiveQuote =
    o.quote &&
    !o.quote.rejectReason &&
    !o.quote.revisionRequested &&
    !INACTIVE_QUOTE_STATUSES.includes(String(o.quote.status || "").toUpperCase());
  if (
    o?.bill &&
    (o.bill.quotationTotal != null || o.bill.supplementalTotal > 0) &&
    o.status !== "quoted" &&
    !(o.quote?.hasEstimatedRange && inQuoteOrRepairStage) &&
    !(o.quote?.approvedHasEstimatedRange && inQuoteOrRepairStage)
  ) {
    return Math.max(0, Number(o.bill.amountDue) || 0);
  }
  if (hasActiveQuote) {
    const qTotal = o.quote.hasEstimatedRange
      ? Number(o.quote.totalMin ?? o.quote.total)
      : o.quote.approved && o.quote.approvedTotal != null
        ? Number(o.quote.approvedTotal)
        : Number(o.quote.total);
    if (Number.isFinite(qTotal) && qTotal >= 0) {
      return Math.max(0, qTotal - deduct);
    }
  } else if (o.quote?.approvedHasEstimatedRange && inQuoteOrRepairStage) {
    return Math.max(0, (Number(o.quote.approvedTotalMin) || 0) - deduct);
  } else if (
    o.quote?.approvedTotal != null &&
    (!o?.bill || (o.bill.quotationTotal == null && !(o.bill.supplementalTotal > 0)))
  ) {
    return Math.max(0, Number(o.quote.approvedTotal) - deduct);
  }
  if (o?.bill && o.bill.amountDue != null) return Math.max(0, Number(o.bill.amountDue) || 0);
  const base = o.finalTotal != null ? o.finalTotal : o.total;
  return Math.max(0, Number(base) || 0);
};
export const orderTotalRange = (o) => {
  const inQuoteOrRepairStage =
    o &&
    ["confirmed", "onway", "diagnosing", "quoted", "repairing"].includes(
      o.status,
    ) &&
    o.externalPriceState !== "finalized";
  const deduct = o
    ? tierPartDiscountAmount(o) +
      (Number(o.voucherDiscount) || 0) +
      lateDiscountAmount(o)
    : 0;
  if (
    o &&
    o.kind !== "warranty" &&
    o.kind !== "followup" &&
    o.status !== "cancelled" &&
    inQuoteOrRepairStage
  ) {
    const hasActiveQuote =
      o.quote &&
      !o.quote.rejectReason &&
      !o.quote.revisionRequested &&
      !INACTIVE_QUOTE_STATUSES.includes(String(o.quote.status || "").toUpperCase());
    if (hasActiveQuote) {
      if (o.quote.hasEstimatedRange) {
        const rawMin = Number(o.quote.totalMin ?? o.quote.total) || 0;
        const rawMax = Number(o.quote.totalMax ?? o.quote.total) || rawMin;
        const min = Math.max(0, rawMin - deduct);
        const max = Math.max(min, rawMax - deduct);
        return {
          min,
          max,
          isRange: min !== max || Boolean(o.quote.hasEstimatedRange),
        };
      }
    } else if (o.quote?.approvedHasEstimatedRange) {
      const rawMin = Number(o.quote.approvedTotalMin) || 0;
      const rawMax = Number(o.quote.approvedTotalMax) || rawMin;
      const min = Math.max(0, rawMin - deduct);
      const max = Math.max(min, rawMax - deduct);
      return {
        min,
        max,
        isRange: true,
      };
    }
  }
  const v = orderTotal(o);
  return { min: v, max: v, isRange: false };
};
export const formatOrderTotal = (o) => {
  const r = orderTotalRange(o);
  return r.isRange ? formatRangeVND(r.min, r.max) : formatVND(r.min);
};
// Tiền mặt thợ cần thu: bill.cash_to_collect của server (0 nếu khách trả VietQR).
export const cashToCollect = (o) => {
  if (isQRPayment(o)) return 0;
  if (o?.bill?.cashToCollect != null) return Math.max(0, Number(o.bill.cashToCollect) || 0);
  if (o?.cashToCollect != null) return Math.max(0, Number(o.cashToCollect) || 0);
  return amountRemaining(o);
};
// Còn phải trả (đã trừ tiền đã thanh toán) và trạng thái thanh toán theo server.
export const amountRemaining = (o) =>
  o?.bill?.remainingAmount != null
    ? Math.max(0, Number(o.bill.remainingAmount) || 0)
    : orderTotal(o);
export const isPaid = (o) =>
  o?.bill
    ? ["PAID", "NOTHING_TO_PAY"].includes(o.bill.paymentStatus)
    : Boolean(o?.report?.paid);

// Kiểm tra đơn hàng thanh toán bằng Chuyển khoản QR (VietQR) -> Thợ tuyệt đối KHÔNG được thu tiền mặt
export const isQRPayment = (o) => {
  if (!o) return false;
  const bm = String(o.bill?.paymentMethod || "").trim().toUpperCase();
  if (bm === "BANK_TRANSFER" || bm === "VIETQR") return true;
  if (bm === "CASH") return false;
  if (o.paymentMethod === "vietqr") return true;
  if (o.paymentMethod === "cash" && !o.qrPaymentRequested) return false;
  if (o.qrPaymentRequested) return true;
  return /vietqr|qr|chuyển khoản|chuyen khoan|ngân hàng|mbbank/i.test(
    String(o.payment || ""),
  );
};
const techCodeOf = (p) => (p.techProfile || TECH_ME).code;
const declinedFor = (p, techCode) => {
  const map = p.declinedByTech || {};
  if (map[techCode]?.length) return map[techCode];
  // tương thích dữ liệu cũ (declined global) — chỉ áp cho đúng thợ đang xem
  if ((p.declined || []).length && techCode === techCodeOf(p))
    return p.declined;
  return [];
};
const markDeclined = (p, techCode, orderCode) => {
  const prev = p.declinedByTech || {};
  return {
    declinedByTech: {
      ...prev,
      [techCode]: [
        ...new Set([
          ...(prev[techCode] || declinedFor(p, techCode)),
          orderCode,
        ]),
      ],
    },
  };
};
const clearDeclined = (p, techCode, orderCode) => {
  const prev = p.declinedByTech || {};
  return {
    declinedByTech: {
      ...prev,
      [techCode]: (prev[techCode] || declinedFor(p, techCode)).filter(
        (c) => c !== orderCode,
      ),
    },
  };
};
// Ngày hẹn dạng YYYY-MM-DD (đơn cũ không có dateKey thì đọc dd/mm trong nhãn; thống nhất theo GMT+7)
export const dateKeyOf = (o) => {
  if (o.dateKey) return o.dateKey;
  const vn = toVnParts(o.createdAt || Date.now()) || toVnParts(Date.now());
  const m = /(\d{2})\/(\d{2})/.exec(o.dateLabel || "");
  if (m) return `${vn.year}-${m[2]}-${m[1]}`;
  return vnDateKey(o.createdAt || Date.now());
};
export const todayKey = (offset = 0) => vnDateKey(Date.now() + offset * DAY);

// Lọc & gộp voucher còn hạn sử dụng (ví cá nhân ưu tiên; mã công khai không đếm trùng nếu đã nằm trong ví).
export const getValidVouchers = (
  myVouchers = [],
  publicVouchers = [],
  nowTs = Date.now(),
) => {
  const activeWallet = (Array.isArray(myVouchers) ? myVouchers : []).filter(
    (v) => v && (!v.expiresAt || v.expiresAt > nowTs),
  );
  const walletCodes = new Set(
    activeWallet
      .map((v) => String(v.code || "").trim().toUpperCase())
      .filter(Boolean),
  );
  const seenPublicCodes = new Set();
  const activePublic = (
    Array.isArray(publicVouchers) ? publicVouchers : []
  ).filter((v) => {
    if (!v || (v.expiresAt && v.expiresAt <= nowTs)) return false;
    const code = String(v.code || "").trim().toUpperCase();
    if (!code || walletCodes.has(code) || seenPublicCodes.has(code)) {
      return false;
    }
    seenPublicCodes.add(code);
    return true;
  });
  return [...activeWallet, ...activePublic];
};

export const countValidVouchers = (
  myVouchers = [],
  publicVouchers = [],
  nowTs = Date.now(),
) => getValidVouchers(myVouchers, publicVouchers, nowTs).length;
// orders: danh sách tất cả đơn — dùng để chặn gửi trùng yêu cầu bảo hành khi đã có đơn bảo hành đang xử lý
export const warrantyInfo = (o, orders = [], lifetimePoints = 0) => {
  // Hạn bảo hành ưu tiên lấy từ đơn hàng / dịch vụ trên server (warranty_days / warranty_end_date),
  // chỉ dùng hạn theo hạng thành viên khi dữ liệu đơn chưa có thông tin bảo hành dịch vụ.
  const explicitZero = o?.warrantyDays === 0;
  const resolvedOrderDays =
    typeof o?.warrantyDays === "number" && o.warrantyDays > 0
      ? o.warrantyDays
      : null;
  const items = o?.items || [];
  const itemDays = items.map((it) =>
    it?.warrantyDays !== undefined
      ? it.warrantyDays
      : getService(it?.id)?.warrantyDays,
  );
  const positiveItemDays = itemDays.filter(
    (d) => typeof d === "number" && d > 0,
  );
  const allItemsExplicitlyNoWarranty =
    items.length > 0 && itemDays.every((d) => d === 0 || d === null);

  let totalDays;
  if (explicitZero) {
    totalDays = 0;
  } else if (resolvedOrderDays != null) {
    totalDays = resolvedOrderDays;
  } else if (positiveItemDays.length > 0) {
    totalDays = Math.max(...positiveItemDays);
  } else if (allItemsExplicitlyNoWarranty && !o?.warrantyEndAt) {
    totalDays = 0;
  } else {
    totalDays = tierOf(lifetimePoints || 0).cur.warrantyDays || 60;
  }

  if (o.status === "cancelled")
    return {
      ok: false,
      totalDays,
      text: "Đơn đã huỷ nên không được bảo hành.",
    };
  if (o.kind === "warranty")
    return { ok: false, totalDays, text: "Đây là đơn bảo hành." };
  const open = orders.find(
    (x) =>
      x.kind === "warranty" &&
      isActiveOrder(x) &&
      (x.warrantyOf === o.code ||
        (o.dbRequestId &&
          String(x.originalRequestId) === String(o.dbRequestId))),
  );
  if (open) {
    const openSched =
      totalDays > 0
        ? analyzeWarrantyEligibility({
            completedAt: o.warrantyStartAt || o.doneAt,
            warrantyDays: totalDays,
            serverNow: Date.now(),
            warrantyEndAt: o.warrantyEndAt || null,
          })
        : { daysLeft: 0, eligible: false, until: null };
    return {
      ok: false,
      pending: true,
      totalDays,
      daysLeft: openSched.daysLeft ?? 0,
      stillValid: Boolean(openSched.eligible),
      until: openSched.until || null,
      openCode: open.code,
      text: `Đã có yêu cầu bảo hành ${open.code} đang xử lý.`,
    };
  }
  if (totalDays === 0) {
    return applyServerWarrantyEligibility(
      {
        ok: false,
        totalDays: 0,
        noWarranty: true,
        text: "Dịch vụ này không áp dụng bảo hành.",
      },
      o?.serverWarrantyEligibility,
      fmtDate,
    );
  }
  if (resolvedOrderDays == null && positiveItemDays.length === 0 && !o?.warrantyEndAt) {
    if (items.length > 0) {
      const covered = items.filter((it) => {
        const svc = getService(it.id);
        const kind = svc ? serviceKind(svc) : (it.kind || serviceKind({ id: it.id }));
        return ["clean", "gas", "repair", "install"].includes(kind);
      });
      if (!covered.length) {
        return {
          ok: false,
          totalDays,
          text: `Đơn này là gói dịch vụ định kỳ riêng, không thuộc diện bảo hành ${totalDays} ngày.`,
        };
      }
    } else if (o.kind === "lifetime") {
      return {
        ok: false,
        totalDays,
        text: `Đơn này là gói dịch vụ định kỳ riêng, không thuộc diện bảo hành ${totalDays} ngày.`,
      };
    }
  }
  if (o.status !== "done")
    return {
      ok: false,
      pending: true,
      totalDays,
      text: `Bảo hành ${totalDays} ngày sẽ bắt đầu khi đơn hoàn thành.`,
    };

  const schedule = analyzeWarrantyEligibility({
    completedAt: o.warrantyStartAt || o.doneAt,
    warrantyDays: totalDays,
    serverNow: Date.now(),
    warrantyEndAt: o.warrantyEndAt || null,
  });

  const baseInfo = !schedule.eligible
    ? {
        ok: false,
        totalDays,
        daysLeft: schedule.daysLeft || 0,
        isCutoff: schedule.reason === "WARRANTY_FINAL_DAY_CUTOFF",
        isFinalDay: schedule.isFinalDay,
        reason: schedule.reason,
        text:
          schedule.message || `Đơn đã hết thời hạn bảo hành ${totalDays} ngày.`,
        until: schedule.until,
        endYmd: schedule.endYmd,
      }
    : {
        ok: true,
        totalDays,
        daysLeft: schedule.daysLeft,
        isFinalDay: schedule.isFinalDay,
        availableDates: schedule.availableDates,
        availableSlots: schedule.availableSlots,
        until: schedule.until,
        endYmd: schedule.endYmd,
        text:
          schedule.notice ||
          `Còn ${schedule.daysLeft}/${totalDays} ngày bảo hành (đến ${fmtDate(schedule.until)}).`,
      };

  return applyServerWarrantyEligibility(
    baseInfo,
    o?.serverWarrantyEligibility,
    fmtDate,
  );
};

// ---------------------------------------------------------------------------
// State ban đầu + lưu trữ (localStorage trên web)
// ---------------------------------------------------------------------------
const KEY = "tho-hrmss-state-v2";
// Hồ sơ thợ: giữ khu vực/chuyên môn đã lưu, cập nhật tên/SĐT từ tài khoản đăng nhập
export const mergeTechProfile = (prev, account) => {
  const code = account.techCode || prev?.code || TECH_ME.code;
  const same = prev?.code === code ? prev : null;
  const rep = normalizeTechRep(same || {});
  return {
    name: account.name || same?.name || TECH_ME.name,
    phone: account.phone || same?.phone || TECH_ME.phone,
    email: account.email || same?.email || "",
    dob: account.dob || same?.dob || "",
    code,
    rating: same?.rating ?? TECH_ME.rating,
    jobs: same?.jobs ?? 0,
    area: same?.area || TECH_ME.area || "Hà Nội",
    skills: same?.skills || [],
    reputation: rep.reputation,
    lockedUntil: rep.lockedUntil,
    violations: rep.violations,
    cancelAfterAcceptCount: rep.cancelAfterAcceptCount,
    lateCount: rep.lateCount,
  };
};

const CUSTOMER_SLICE_KEYS = [
  "addresses",
  "selectedAddressId",
  "addressGenderMap",
  "cart",
  "notifications",
  "notifClearedAt",
  "notifKeptIds",
  "points",
  "lifetimePoints",
  "pointHistory",
  "myVouchers",
  "searches",
];
const makeCustomerSlice = () => ({
  addresses: [],
  selectedAddressId: null,
  addressGenderMap: {},
  cart: [],
  notifications: [],
  notifClearedAt: 0,
  notifKeptIds: [],
  points: 0,
  lifetimePoints: 0,
  pointHistory: [],
  myVouchers: [],
  searches: [],
});
const extractCustomerSlice = (state) => {
  const out = {};
  CUSTOMER_SLICE_KEYS.forEach((k) => {
    out[k] = state[k];
  });
  return out;
};
const customerProfileKey = (acc) => {
  if (!acc || acc.role !== "customer") return null;
  return acc.id || acc.username || acc.email || acc.phone || null;
};
const isOrderOfCustomer = (o, phone, accountId = null) => {
  if (accountId && o?.customerAccountId) {
    return o.customerAccountId === accountId;
  }
  if (!phone) return Boolean(accountId && o?.customerAccountId === accountId);
  const p = String(phone).trim();
  const op = String(o?.customerPhone || o?.address?.phone || "").trim();
  if (op) return op === p;
  return Boolean(accountId && o?.customerAccountId === accountId);
};
// Khi đổi tài khoản khách hàng: lưu dữ liệu khách cũ vào customerProfiles[oldKey], nạp dữ liệu khách mới
const switchCustomerSlice = (prev, nextAccount) => {
  const profiles = { ...(prev.customerProfiles || {}) };
  const prevKey =
    customerProfileKey(prev.auth) ||
    (prev.role === "customer" ? prev.user?.phone : null);
  if (prevKey) {
    profiles[prevKey] = extractCustomerSlice(prev);
  }
  const nextKey = customerProfileKey(nextAccount);
  if (nextKey) {
    const rawLoaded =
      profiles[nextKey] ||
      (nextAccount.phone ? profiles[nextAccount.phone] : null) ||
      makeCustomerSlice();
    const loaded = {
      ...rawLoaded,
      notifications: rawLoaded.notifications || [],
      points: rawLoaded.points ?? 0,
      lifetimePoints: rawLoaded.lifetimePoints ?? 0,
      pointHistory: rawLoaded.pointHistory || [],
    };
    profiles[nextKey] = loaded;
    return { ...loaded, customerProfiles: profiles };
  }
  return { ...makeCustomerSlice(), customerProfiles: profiles };
};
// Đăng xuất / xoá tài khoản / phiên hết hạn: xoá khỏi state (và localStorage) mọi dữ liệu của tài khoản vừa thoát
// (địa chỉ, SĐT, đơn, thông báo, điểm, voucher). Chỉ giữ giỏ hàng, yêu thích, lịch sử tìm kiếm (dữ liệu riêng trên máy)
// cho lần đăng nhập sau. Dữ liệu thật nạp lại từ server khi đăng nhập.
const signedOutState = (p) => {
  const profiles = { ...(p.customerProfiles || {}) };
  const key = customerProfileKey(p.auth);
  if (key) {
    const cur = extractCustomerSlice(p);
    profiles[key] = {
      ...makeCustomerSlice(),
      cart: cur.cart || [],
      searches: cur.searches || [],
    };
  }
  return {
    ...makeCustomerSlice(),
    customerProfiles: profiles,
    orders: [],
    declinedByTech: {},
    techNotifs: [],
    notifClearedAt: 0,
    notifKeptIds: [],
    techNotifClearedAt: 0,
    techNotifKeptIds: [],
    techProfile: null,
    auth: null,
    role: "customer",
    user: { name: "", phone: "", email: "" },
  };
};

const makeInitial = () => ({
  user: { name: "", phone: "", email: "" },
  ...makeCustomerSlice(),
  orders: [],
  customerProfiles: {},
  // Phía thợ
  role: "customer", // 'customer' | 'tech'
  techNotifs: [],
  techNotifClearedAt: 0,
  techNotifKeptIds: [],
  // Dữ liệu chung tải từ backend: mã công khai, lựa chọn đổi điểm, chính sách hệ thống, đánh giá theo dịch vụ.
  publicVouchers: [],
  redeemOptions: [],
  policy: null,
  serviceReviews: {},
  declinedByTech: {}, // { [techCode]: string[] }
  techProfile: null,
});

const storage = {
  load() {
    try {
      if (IS_WEB_STORAGE) {
        return readJsonSync(KEY, "session");
      }
      return null;
    } catch (e) {
      return null;
    }
  },
  clear() {
    try {
      if (IS_WEB_STORAGE) {
        removeStorageItem(KEY, "session");
        removeStorageItem(KEY, "local");
      } else {
        removeStorageItem(KEY, "local");
      }
    } catch (e) {
      /* bỏ qua */
    }
  },
};

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Gom thông báo theo đơn: mỗi đơn chỉ hiện thông báo MỚI NHẤT. Mã đơn lấy từ link (mở đơn / mở việc),
// không có link thì tìm mã đơn trong tiêu đề / nội dung (vd. REQ-1602621059, HRM261108-03).
const ORDER_CODE_IN_TEXT = /\b[A-Z]{2,5}-?\d[\d-]{4,}\b/;
export const notifOrderKey = (n) => {
  const code = n?.link?.params?.code;
  if (code) return String(code);
  const m = `${n?.title || ""} ${n?.body || ""}`.match(ORDER_CODE_IN_TEXT);
  return m ? m[0] : null;
};
// Trả danh sách đã gom: mỗi phần tử có groupIds (mọi thông báo của đơn đó), olderCount (số cập nhật cũ hơn bị ẩn),
// read = false nếu trong nhóm còn thông báo chưa đọc. Thông báo không thuộc đơn nào giữ nguyên.
export const latestNotifPerOrder = (list = []) => {
  const groups = new Map();
  const out = [];
  [...list]
    .sort((x, y) => (y.at || 0) - (x.at || 0))
    .forEach((n) => {
      const key = notifOrderKey(n);
      const g = key ? groups.get(key) : null;
      if (g) {
        g.groupIds.push(n.id);
        g.olderCount += 1;
        if (!n.read) g.read = false;
        if (!g.link && n.link) g.link = n.link;
        return;
      }
      const item = { ...n, groupIds: [n.id], olderCount: 0 };
      if (key) groups.set(key, item);
      out.push(item);
    });
  return out;
};

// Nhãn trạng thái hiển thị cho khách: đơn chờ thợ đã quá giờ hẹn mà chưa có thợ nhận -> "Quá hạn tiếp nhận".
export const EXPIRED_META = {
  label: "Quá hạn tiếp nhận",
  fg: C.redInk,
  bg: C.redSoft,
};
export const customerStatusMeta = (o, now = Date.now()) => {
  if (isOfferExpired(o, now)) {
    return {
      ...EXPIRED_META,
      desc: "Chưa có thợ nhận trong khung giờ hẹn — vui lòng đổi giờ hẹn hoặc liên hệ hỗ trợ.",
    };
  }
  if (o?.status === "quoted" && o?.quote?.isExternalFinalization) {
    return {
      label: "Chờ xác nhận chi phí cuối",
      fg: C.goldInk,
      bg: C.goldSoft,
      desc: "Thợ đã cập nhật chi phí vật tư thực tế — mở đơn để kiểm tra và xác nhận tổng hoá đơn.",
    };
  }
  if (
    (o?.externalPriceState === "revision_requested" ||
      (o?.quote?.isExternalFinalization && o?.quote?.revisionRequested)) &&
    ["diagnosing", "repairing", "quoted"].includes(o?.status)
  ) {
    return {
      label: "Đang chỉnh lại chi phí cuối",
      fg: C.goldInk,
      bg: C.goldSoft,
      desc: "Kỹ thuật viên đang kiểm tra và cập nhật lại mức giá vật tư theo yêu cầu của bạn.",
    };
  }
  if (o?.status === "repairing" && o?.externalPriceState === "finalized") {
    return {
      label: "Chờ bàn giao thiết bị",
      fg: C.greenInk,
      bg: C.greenSoft,
      desc: "Bạn đã xác nhận tổng chi phí cuối cùng. Thợ đang hoàn tất biên bản bàn giao để mở thanh toán.",
    };
  }
  const base = STATUS_META[o?.status] || STATUS_META.pending;
  return { ...base, desc: STATUS_DESC[o?.status] || "" };
};

export const techStatusMeta = (o) => {
  if (o?.status === "quoted" && o?.quote?.isExternalFinalization) {
    return {
      label: "Chờ khách xác nhận hoá đơn",
      fg: C.goldInk,
      bg: C.goldSoft,
      desc: "Đã gửi chi phí vật tư cuối cùng. Khi khách xác nhận, hãy ký bàn giao để mở thanh toán.",
    };
  }
  if (
    (o?.externalPriceState === "revision_requested" ||
      (o?.quote?.isExternalFinalization && o?.quote?.revisionRequested)) &&
    ["diagnosing", "repairing", "quoted"].includes(o?.status)
  ) {
    return {
      label: "Cần chỉnh lại giá vật tư",
      fg: C.goldInk,
      bg: C.goldSoft,
      desc: "Khách yêu cầu kiểm tra lại mức giá vật tư cuối cùng. Hãy cập nhật và gửi lại hoá đơn.",
    };
  }
  if (o?.status === "repairing" && o?.externalPriceState === "finalized") {
    return {
      label: "Chờ ký bàn giao & Mở TT",
      fg: C.greenInk,
      bg: C.greenSoft,
      desc: "Khách đã xác nhận tổng hoá đơn. Hãy bấm Ký bàn giao & Mở thanh toán để hoàn tất.",
    };
  }
  if (
    o?.status === "repairing" &&
    getPendingExternalEstimates(o).length > 0
  ) {
    return {
      label: "Đang thực hiện · Chờ chốt VT",
      fg: C.primary,
      bg: C.primarySoft,
      desc: "Khi lắp đặt xong, hãy nhập mức giá cuối của vật tư phát sinh bên dưới để gửi hoá đơn cho khách.",
    };
  }
  const base = STATUS_META[o?.status] || STATUS_META.pending;
  return { ...base, desc: TECH_STATUS_DESC[o?.status] || "" };
};

// So trạng thái đơn của khách trước / sau khi tải từ server -> thông báo cho khách biết đơn đang ở trạng thái gì.
// Đơn đang có thợ mà quay về "chờ thợ" = thợ trả việc / hết hạn xác nhận -> báo đang điều phối lại thợ.
const TECH_STAGES = ["confirmed", "onway", "diagnosing", "quoted", "repairing"];
const STATUS_ICON = {
  confirmed: "👷",
  onway: "🛵",
  diagnosing: "🔍",
  quoted: "🧾",
  repairing: "🔧",
  pending_payment: "💳",
  done: "✅",
  cancelled: "✖️",
  warranty_pending: "🛡️",
  out_of_warranty: "⚠️",
};
export const detectCustomerStatusChanges = (
  prevOrders = [],
  nextOrders = [],
) => {
  const prevBy = new Map(prevOrders.map((o) => [o.code, o]));
  const notifs = [];
  const now = Date.now();
  const orders = nextOrders.map((o) => {
    const prev = prevBy.get(o.code);
    if (!prev || !prev.status || prev.status === o.status) return o;
    let extra = {};
    let title;
    let body;
    let icon;
    if (o.status === "pending" && TECH_STAGES.includes(prev.status)) {
      title = `Đơn ${o.code}: đang điều phối lại thợ`;
      body =
        "Thợ trước không thể tiếp tục (đã trả việc hoặc quá hạn xác nhận). Hệ thống đang tìm thợ khác cho bạn.";
      icon = "🔄";
      extra = {
        releaseLog: [
          ...(prev.releaseLog || []),
          { at: now, from: prev.tech?.name || "" },
        ],
        expiredNotified: false,
      };
    } else {
      const cm = customerStatusMeta(o, now);
      title = `Đơn ${o.code}: ${cm.label || "Cập nhật mới"}`;
      body =
        o.status === "confirmed" && o.tech?.name
          ? `Thợ ${o.tech.name} đã nhận đơn và sẽ gọi cho bạn trước khi đến.`
          : cm.desc || STATUS_DESC[o.status] || "Đơn hàng có cập nhật mới.";
      icon = STATUS_ICON[o.status] || "🔔";
    }
    notifs.push({
      id: `st-${o.code}-${o.status}-${now}`,
      at: now,
      read: false,
      icon,
      title,
      body,
      link: { name: "order", params: { code: o.code } },
    });
    return { ...o, ...extra };
  });
  return { orders, notifs };
};

export function AppProvider({ children }) {
  const [s, setS] = useState(() => {
    const saved = storage.load() || {};
    const session = getSession();
    const role = session?.role || saved.role || "customer";
    const user = session
      ? {
          name: session.name || "",
          phone: session.phone || "",
          email: session.email || "",
        }
      : saved.user || { name: "", phone: "", email: "" };
    // Bỏ hoàn toàn dữ liệu mock / offline cũ: chỉ giữ đơn có id thật từ database backend.
    const fromBackend = (list, idKey) =>
      Array.isArray(list) ? list.filter((x) => x && x[idKey] != null) : [];
    const cleanOrders = (saved.orders || []).filter(
      (o) => o && (o.dbRequestId != null || o.dbAssignmentId != null),
    );
    const cleanAddresses = fromBackend(saved.addresses, "dbAddressId");
    const cleanNotifs = fromBackend(saved.notifications, "dbNotificationId");
    const cleanTechNotifs = fromBackend(saved.techNotifs, "dbNotificationId");
    const { devices: _legacyDevices, ...savedRest } = saved;
    const baseState = {
      ...makeInitial(),
      ...savedRest,
      orders: cleanOrders,
      addresses: cleanAddresses,
      notifications: cleanNotifs,
      techNotifs: cleanTechNotifs,
      pointHistory: (saved.pointHistory || []).filter((h) =>
        String(h?.id || "").startsWith("pt-db-"),
      ),
      myVouchers: (saved.myVouchers || []).filter(
        (v) => v?.customerVoucherId != null,
      ),
      points: saved.points ?? 0,
      lifetimePoints: saved.lifetimePoints ?? 0,
      selectedAddressId: saved.selectedAddressId,
      role,
      user,
      auth: session,
      techProfile:
        session?.role === "tech"
          ? mergeTechProfile(saved.techProfile, session)
          : saved.techProfile || null,
    };
    const sessKey = customerProfileKey(session);
    if (sessKey) {
      const profiles = { ...(baseState.customerProfiles || {}) };
      if (profiles[sessKey] || (session.phone && profiles[session.phone])) {
        const rawSlice = profiles[sessKey] || profiles[session.phone];
        const existingSlice = {
          ...rawSlice,
          notifications: fromBackend(
            rawSlice.notifications,
            "dbNotificationId",
          ),
          pointHistory: (rawSlice.pointHistory || []).filter((h) =>
            String(h?.id || "").startsWith("pt-db-"),
          ),
          addresses: fromBackend(rawSlice.addresses, "dbAddressId"),
          myVouchers: (rawSlice.myVouchers || []).filter(
            (v) => v?.customerVoucherId != null,
          ),
          points: rawSlice.points ?? 0,
          lifetimePoints: rawSlice.lifetimePoints ?? 0,
        };
        delete existingSlice.devices;
        profiles[sessKey] = existingSlice;
        return { ...baseState, ...existingSlice, customerProfiles: profiles };
      }
      const savedPhone = saved.user?.phone || cleanAddresses[0]?.phone;
      const slice =
        session.phone && (!savedPhone || savedPhone === session.phone)
          ? extractCustomerSlice(baseState)
          : makeCustomerSlice();
      profiles[sessKey] = slice;
      return { ...baseState, ...slice, customerProfiles: profiles };
    }
    return baseState;
  });
  const up = (fn) =>
    setS((prev) => {
      const patch = fn(prev) || {};
      const next = { ...prev, ...patch };
      const activeCustKey = customerProfileKey(next.auth);
      if (activeCustKey && !patch.customerProfiles) {
        next.customerProfiles = {
          ...(next.customerProfiles || {}),
          [activeCustKey]: extractCustomerSlice(next),
        };
      }
      return next;
    });
  // Lưu trạng thái theo từng tab trên Web (sessionStorage) để mở 2 tab (1 tab Khách + 1 tab Thợ) không ghi đè mất đơn của nhau.
  const storageHydratedRef = useRef(IS_WEB_STORAGE);
  const lastWritten = useRef("");
  useEffect(() => {
    if (!storageHydratedRef.current) return;
    const { auth, ...rest } = s;
    const payload = { ...rest, role: auth?.role || rest.role, savedAccountId: auth?.id || null };
    let raw;
    try {
      raw = JSON.stringify(payload);
    } catch (e) {
      return;
    }
    if (raw === lastWritten.current) return;
    lastWritten.current = raw;
    if (IS_WEB_STORAGE) {
      try {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY, raw);
        if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
      } catch (e) {
        /* quota / private mode */
      }
    } else {
      writeJson(KEY, payload, "local");
    }
  }, [s]);

  // ------------------------- Điều hướng -------------------------
  const [tab, setTab] = useState(() =>
    s.auth?.role === "tech" || s.role === "tech" ? "tech-jobs" : "home",
  );
  const [stack, setStack] = useState([]); // màn hình phủ lên trên tab: [{ name, params, key }]
  // category: danh mục của tab Bảo dưỡng; kindCat: bộ lọc danh mục cho tab Lắp đặt / Sửa chữa / Trọn đời ('all' = tất cả)
  const [svc, setSvc] = useState({
    tab: "bao-duong",
    category: null,
    kindCat: "all",
    sort: "popular",
  });
  // Đồng bộ trạng thái bật/tắt âm thanh (đặc biệt sau khi hydrate async trên Native)
  const [soundMutedState, setSoundMutedState] = useState(() => isSoundMuted());
  useEffect(() => subscribeSoundMuted(setSoundMutedState), []);

  // Mã voucher được chọn ở "Quyền lợi" → tự áp dụng khi mở màn Xác nhận đặt lịch
  const [pendingVoucher, setPendingVoucher] = useState(null);
  const [actFilter, setActFilter] = useState("active");
  const [warrantyQuery, setWarrantyQuery] = useState("");
  const [warrantyNonce, setWarrantyNonce] = useState(0);
  const resetTransientUiState = () => {
    setPendingVoucher(null);
    setActFilter("active");
    setWarrantyQuery("");
    setSvc({ tab: "bao-duong", category: null, kindCat: "all", sort: "popular" });
  };
  // Đồng hồ 30s: đơn bắn cho thợ tự biến mất khi quá hạn tiếp nhận; khách được báo khi đơn quá hạn chưa có thợ nhận.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const isTechRole = s.auth?.role === "tech";
  const isCustomerRole = s.auth?.role === "customer";
  useEffect(() => {
    if (!isTechRole && !isCustomerRole) return undefined;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, [isTechRole, isCustomerRole]);
  // Dọn khỏi bộ nhớ các đơn chờ nhận đã quá hạn tiếp nhận.
  useEffect(() => {
    if (!isTechRole) return;
    if (!s.orders.some((o) => isOfferExpired(o, nowTick))) return;
    setS((p) => ({
      ...p,
      orders: p.orders.filter((o) => !isOfferExpired(o, nowTick)),
    }));
  }, [isTechRole, nowTick, s.orders]);
  // Khách: đơn đã tới giờ hẹn mà chưa có thợ nhận -> báo 1 lần cho mỗi đơn.
  useEffect(() => {
    if (!isCustomerRole) return;
    const expired = s.orders.filter(
      (o) => isOfferExpired(o, nowTick) && !o.expiredNotified,
    );
    if (!expired.length) return;
    const codes = new Set(expired.map((o) => o.code));
    setS((p) => ({
      ...p,
      orders: p.orders.map((o) =>
        codes.has(o.code) ? { ...o, expiredNotified: true } : o,
      ),
      notifications: expired.reduce(
        (list, o) =>
          pushNotif(
            { notifications: list },
            {
              icon: "⏰",
              title: `Đơn ${o.code} quá hạn tiếp nhận`,
              body: "Chưa có thợ nhận đơn trong khung giờ bạn chọn. Vui lòng đổi giờ hẹn hoặc gọi tổng đài để được hỗ trợ.",
              link: { name: "order", params: { code: o.code } },
            },
          ),
        p.notifications,
      ),
    }));
    playNotificationSound("notification");
    uiRef.current?.toast(`Đơn ${expired[0].code} quá hạn tiếp nhận`, "⏰");
  }, [isCustomerRole, nowTick, s.orders]);

  // Khách: Cảnh báo tự động trước khi hết hạn bảo hành (D-7, D-3, D-1)
  useEffect(() => {
    if (!isCustomerRole) return;
    const alertable = [];
    for (const o of s.orders) {
      if (o.status !== "done" || o.kind === "warranty" || !o.doneAt) continue;
      // Dùng chung warrantyInfo: đúng số ngày theo hạng, bỏ đơn không thuộc diện bảo hành
      // hoặc đang có yêu cầu bảo hành mở, không báo khi đã quá giờ chốt ngày cuối.
      const info = warrantyInfo(o, s.orders, s.lifetimePoints || 0);
      if (!info.ok) continue;
      const milestone = WARRANTY_ALERT_MILESTONES.includes(info.daysLeft) ? info.daysLeft : null;
      if (!milestone) continue;
      const notifiedKey = `warranty_alert_${milestone}`;
      if (!o[notifiedKey]) {
        alertable.push({ order: o, milestone, notifiedKey });
      }
    }
    if (!alertable.length) return;
    setS((p) => {
      let currentNotifs = p.notifications;
      const updatedOrders = p.orders.map((ord) => {
        const item = alertable.find((a) => a.order.code === ord.code);
        if (item) {
          return { ...ord, [item.notifiedKey]: true };
        }
        return ord;
      });
      for (const item of alertable) {
        const { order, milestone } = item;
        let title = `🛡️ Đơn ${order.code} còn ${milestone} ngày bảo hành`;
        let body = `Thiết bị của bạn còn ${milestone} ngày bảo hành miễn phí. Nếu phát sinh sự cố, hãy gửi yêu cầu để thợ hỗ trợ kịp thời nhé!`;
        if (milestone === 1) {
          title = `🚨 Cơ hội cuối: Đơn ${order.code} sắp hết hạn bảo hành`;
          body = `Hôm nay là ngày cuối cùng trong thời hạn bảo hành. Vui lòng kiểm tra lại thiết bị và gửi yêu cầu trước 18h00!`;
        }
        currentNotifs = pushNotif(
          { notifications: currentNotifs },
          {
            icon: "🛡️",
            title,
            body,
            link: { name: "order", params: { code: order.code } },
          },
        );
      }
      return {
        ...p,
        orders: updatedOrders,
        notifications: currentNotifs,
      };
    });
    playNotificationSound("notification");
  }, [isCustomerRole, nowTick, s.orders]);

  const nav = {
    tab,
    stack,
    top: stack[stack.length - 1] || null,
    push: (name, params = {}) =>
      setStack((st) => [...st, { name, params, key: uid() }]),
    replace: (name, params = {}) =>
      setStack((st) => [...st.slice(0, -1), { name, params, key: uid() }]),
    back: () => setStack((st) => st.slice(0, -1)),
    popTo: (name) =>
      setStack((st) => {
        const i = st.map((x) => x.name).lastIndexOf(name);
        return i >= 0 ? st.slice(0, i + 1) : st;
      }),
    reset: () => setStack([]),
    go: (t) => {
      setStack([]);
      setTab(t);
    },
    services: (serviceTab, category) => {
      setSvc((p) => {
        const t = serviceTab || (p.tab === "bao-hanh" ? "bao-duong" : p.tab);
        if (t === "bao-duong")
          return { ...p, tab: t, category: category || p.category };
        return { ...p, tab: t, kindCat: category || "all" };
      });
      setStack([]);
      setTab("services");
    },
    activity: (filter) => {
      if (filter) setActFilter(filter);
      setStack([]);
      setTab("activity");
    },
    warranty: (query) => {
      setWarrantyQuery(query || "");
      setWarrantyNonce((n) => n + 1);
      setSvc((p) => ({ ...p, tab: "bao-hanh" }));
      setStack([]);
      setTab("services");
    },
    open: (link) => {
      if (!link) return;
      const curRole = stateRef.current?.auth?.role || stateRef.current?.role || "customer";
      const validCustomerTabs = ["home", "services", "activity", "personal"];
      const validTechTabs = ["tech-jobs", "tech-attendance", "tech-schedule", "tech-account"];
      const validCustomerScreens = [
        "detail", "cart", "checkout", "success", "addresses", "address-form",
        "search", "notifications", "order", "rate", "rewards", "profile", "help", "terms",
      ];
      const validTechScreens = ["tech-job", "tech-notifs", "tech-handovers"];
      if (link.tab) {
        const okTabs = curRole === "tech" ? validTechTabs : validCustomerTabs;
        if (okTabs.includes(link.tab)) nav.go(link.tab);
        return;
      }
      if (curRole === "tech" && link.name === "tech-attendance") {
        nav.go("tech-attendance");
        return;
      }
      const okScreens = curRole === "tech" ? validTechScreens : validCustomerScreens;
      if (!link.name || !okScreens.includes(link.name)) return;
      setStack((st) => [
        ...st,
        { name: link.name, params: link.params || {}, key: uid() },
      ]);
    },
  };

  const stackRef = useRef(stack);
  stackRef.current = stack;
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stackRef.current.length) {
        setStack((st) => st.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  // ------------------------- Toast + Dialog -------------------------
  const [toastMsg, setToastMsg] = useState(null);
  const [dialogCfg, setDialogCfg] = useState(null);
  useEffect(() => {
    if (!toastMsg) return undefined;
    const t = setTimeout(() => setToastMsg(null), 2000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const ui = {
    toast: (text, icon = "✓", tone) => {
      playNotificationSound(tone === "danger" ? "alert" : "success");
      setToastMsg({ text, icon, tone, id: uid() });
    },
    toastMsg,
    dialog: (cfg) => {
      if (cfg && cfg.danger) playNotificationSound("alert");
      setDialogCfg(cfg);
    },
    dialogCfg,
    closeDialog: () => setDialogCfg(null),
    confirm: (title, message, onOk, okLabel = "Đồng ý", danger = false) => {
      if (danger) playNotificationSound("alert");
      setDialogCfg({
        title,
        message,
        danger,
        tone: danger ? "danger" : undefined,
        fallbackTone: danger ? "danger" : "warning",
        actions: [
          { label: "Huỷ", variant: "ghost" },
          {
            label: okLabel,
            variant: danger ? "danger" : "auto",
            onPress: onOk,
          },
        ],
      });
    },
    alert: (title, message, icon, tone) => {
      playNotificationSound(tone === "danger" ? "alert" : "notification");
      setDialogCfg({
        title,
        message,
        icon,
        tone,
        fallbackTone: "warning",
        actions: [{ label: "Đã hiểu", variant: "auto" }],
      });
    },
    call: () =>
      setDialogCfg({
        icon: "📞",
        tone: "info",
        fallbackTone: "info",
        title: `Tổng đài ${HOTLINE}`,
        message:
          "Tổng đài hỗ trợ Thợ Minh Đức hoạt động 7:30 – 22:00 mỗi ngày (miễn phí).",
        actions: [
          { label: "Để sau", variant: "ghost" },
          {
            label: "Gọi ngay",
            variant: "primary",
            onPress: () =>
              Linking.openURL(`tel:${HOTLINE.replace(/\s/g, "")}`).catch(
                () => {},
              ),
          },
        ],
      }),
  };

  // ------------------------- Nghiệp vụ -------------------------
  const pushNotif = (prev, n) => [
    { id: uid(), at: Date.now(), read: false, ...n },
    ...prev.notifications,
  ].slice(0, 50);
  const pushTech = (prev, n) => [
    { id: uid(), at: Date.now(), read: false, ...n },
    ...(prev.techNotifs || []),
  ].slice(0, 50);
  const withStatus = (o, status, now, extra = {}) => ({
    ...o,
    ...extra,
    status,
    history: [...o.history, { status, at: now }],
  });
  // Cập nhật 1 đơn + đẩy thông báo cho khách (đúng tài khoản đặt đơn) và/hoặc thợ
  const updateOrder = (code, fn) => {
    let shouldNotifySound = false;
    up((p) => {
      const o = p.orders.find((x) => x.code === code);
      if (!o) return {};
      const r = fn(o, p) || {};
      const ownerAccountKey = o.customerAccountId || null;
      const ownerPhone = o.customerPhone || o.address?.phone || null;
      const activeCustKey = customerProfileKey(p.auth);
      const activeCustPhone = p.auth?.role === "customer" ? p.auth.phone : null;
      const isActiveOwner = ownerAccountKey
        ? ownerAccountKey === activeCustKey
        : !ownerPhone || !activeCustPhone || ownerPhone === activeCustPhone;
      const custNotif = r.customer
        ? {
            id: uid(),
            at: Date.now(),
            read: false,
            link: { name: "order", params: { code } },
            ...r.customer,
          }
        : null;
      if ((custNotif && isActiveOwner) || r.tech) shouldNotifySound = true;

      let nextProfiles = p.customerProfiles || {};
      let profilesChanged = false;
      const profileTargetKey =
        (ownerAccountKey && nextProfiles[ownerAccountKey] ? ownerAccountKey : null) ||
        (ownerPhone && nextProfiles[ownerPhone] ? ownerPhone : null);
      if (profileTargetKey) {
        const curProf = nextProfiles[profileTargetKey];
        const profPatch = {};
        if (custNotif) {
          profPatch.notifications = [
            custNotif,
            ...(curProf.notifications || []),
          ].slice(0, 50);
        }
        if (r.customerProfilePatch) {
          Object.assign(profPatch, r.customerProfilePatch(curProf));
        }
        if (Object.keys(profPatch).length) {
          nextProfiles = {
            ...nextProfiles,
            [profileTargetKey]: { ...curProf, ...profPatch },
          };
          profilesChanged = true;
        }
      }

      return {
        orders: p.orders.map((x) => (x.code === code ? r.order || x : x)),
        ...(custNotif && isActiveOwner
          ? { notifications: [custNotif, ...p.notifications].slice(0, 50) }
          : {}),
        ...(r.tech
          ? {
              techNotifs: pushTech(p, {
                link: { name: "tech-job", params: { code } },
                ...r.tech,
              }),
            }
          : {}),
        ...(isActiveOwner && r.extra ? r.extra : {}),
        ...(!isActiveOwner && r.extra?.techProfile
          ? { techProfile: r.extra.techProfile }
          : {}),
        ...(profilesChanged ? { customerProfiles: nextProfiles } : {}),
      };
    });
    if (shouldNotifySound) playNotificationSound("notification");
  };
  const address =
    s.addresses.find((a) => a.id === s.selectedAddressId) ||
    s.addresses.find((a) => a.isDefault) ||
    s.addresses[0] ||
    null;

  // Đồng bộ toàn bộ dữ liệu app từ backend: danh mục, chính sách, vật tư; khách: hồ sơ, địa chỉ, đơn, thông báo,
  // điểm, ví voucher; thợ: việc, hồ sơ, đánh giá, thông báo. App không còn dữ liệu mẫu: lỗi mạng thì giữ dữ liệu đã có.
  const okItems = (res) =>
    res?.ok && Array.isArray(res.data?.items) ? res.data.items : null;
  // Giảm số request mỗi lần đồng bộ (log VPS: ~1.000 lần GET /bill mỗi giờ):
  //  - danh mục / cấu hình / bảng giá vật tư ít đổi -> tải lại tối đa 10 phút / lần;
  //  - đơn đã hoàn thành / đã huỷ không đổi nữa -> giữ tracking + hoá đơn đã tải, không gọi lại mỗi lần.
  const catalogFetchedAt = useRef(0);
  const catalogSyncPromiseRef = useRef(null);
  const finishedOrderCache = useRef(new Map()); // request_id -> { status, technician, journey, bill }
  const warrantyEligibilitySupportedRef = useRef(true);
  const statusToastRef = useRef(null); // thông báo đổi trạng thái đơn vừa phát hiện khi đồng bộ (hiện toast sau khi cập nhật)
  const syncingRef = useRef(false);
  const lastSyncAt = useRef(0);
  const syncSeqRef = useRef(0);
  // Sync bắt buộc (sau thao tác: hoàn thành đơn, thanh toán, đổi điểm...) gọi lúc đang có sync khác chạy:
  // không bỏ đi mà xếp hàng chạy ngay khi sync hiện tại xong (nếu không sẽ thấy điểm / trạng thái cũ).
  const pendingForceSyncRef = useRef(null);
  const authIdRef = useRef(s.auth?.id || null);

  // Đồng bộ danh mục dịch vụ & cấu hình công khai (không cần đăng nhập): GuestHomeScreen và phiên đăng nhập dùng chung.
  const syncPublicCatalog = async (force = false) => {
    if (catalogSyncPromiseRef.current) return catalogSyncPromiseRef.current;
    if (
      !force &&
      Date.now() - catalogFetchedAt.current < 10 * 60 * 1000 &&
      MATERIALS.length > 0 &&
      SERVICES.length > 0
    ) {
      return;
    }
    catalogSyncPromiseRef.current = (async () => {
      try {
        const [catRes, svcRes, cfgRes, matRes] = await Promise.all([
          hrmssApi.getServiceCategories(),
          hrmssApi.getServices(),
          hrmssApi.getPublicConfig(),
          hrmssApi.getPublicMaterials(),
        ]);
        if (catRes.ok && svcRes.ok && matRes.ok)
          catalogFetchedAt.current = Date.now();
        const catItems = catRes.ok
          ? Array.isArray(catRes.data?.items)
            ? catRes.data.items
            : Array.isArray(catRes.data)
              ? catRes.data
              : null
          : null;
        if (catItems) syncCatalogFromBackend({ categories: catItems });
        if (matRes.ok && Array.isArray(matRes.data?.items)) {
          syncCatalogFromBackend({ materials: matRes.data.items });
          up(() => ({ catalogVersion: Date.now() }));
        }
        if (svcRes.ok && Array.isArray(svcRes.items)) {
          syncCatalogFromBackend({ services: svcRes.items });
          // Giỏ hàng của bản cũ có mã dịch vụ mẫu: bỏ những món không còn trong danh mục.
          up((p) => ({
            cart: (p.cart || []).filter(
              (it) => getService(it.id) && !getService(it.id).hidden,
            ),
            catalogVersion: Date.now(),
          }));
          setSvc((p) =>
            p.category && CATEGORIES.some((c) => c.id === p.category)
              ? p
              : {
                  ...p,
                  category:
                    (
                      CATEGORIES.find((c) =>
                        SERVICES.some((x) => x.category === c.id),
                      ) || CATEGORIES[0]
                    )?.id || null,
                },
          );
        }
        if (cfgRes.ok && cfgRes.data) {
          syncPolicyFromBackend(cfgRes.data);
          const tech = cfgRes.data.technician || {};
          const late = (cfgRes.data.lateness?.tiers || []).reduce(
            (m, t) => ({ ...m, [t.tier]: t.max_minutes }),
            {},
          );
          if (tech.max_active_jobs != null)
            TECH_POLICY.maxActiveJobs = Number(tech.max_active_jobs);
          if (tech.free_release_minutes != null)
            TECH_POLICY.freeCancelMs = Number(tech.free_release_minutes) * 60000;
          if (tech.near_slot_minutes != null)
            TECH_POLICY.nearSlotMs = Number(tech.near_slot_minutes) * 60000;
          if (late.ok != null) TECH_POLICY.lateGraceMin = Number(late.ok);
          if (late.soft != null) TECH_POLICY.lateMidMin = Number(late.soft);
          if (late.mid != null) TECH_POLICY.lateSevereMin = Number(late.mid);
          up(() => ({ policy: cfgRes.data }));
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[HRMSS Sync Error][Catalog]", e);
      } finally {
        catalogSyncPromiseRef.current = null;
      }
    })();
    return catalogSyncPromiseRef.current;
  };

  const syncFromBackend = async (overrideAccount = null, force = false) => {
    const acc = overrideAccount || s.auth;
    if (!acc) return;
    // Sync chạy qua nhiều await: nếu trong lúc đó người dùng đăng xuất / đổi tài khoản thì KHÔNG được
    // ghi dữ liệu của tài khoản cũ (đơn, địa chỉ, SĐT, điểm) vào state hiện tại.
    const isSameAccount = (p) =>
      Boolean(p?.auth) &&
      (!acc.id || !p.auth.id || String(p.auth.id) === String(acc.id));

    // Chống gọi dồn dập (throttling): tối thiểu 3 giây giữa 2 lần sync, trừ khi gọi trực tiếp với force = true
    const now = Date.now();
    if (!force && now - lastSyncAt.current < 3000) return;
    if (syncingRef.current) {
      if (force) pendingForceSyncRef.current = acc;
      return;
    }
    syncingRef.current = true;
    lastSyncAt.current = now;

    try {
      // Đảm bảo access token còn hạn trước khi bắn hàng loạt request đồng bộ song song
      const hasValidToken = await ensureAccessToken();
      if (!hasValidToken) return;
      await syncPublicCatalog();

      if (acc.role === "customer") {
        try {
          const [
            meRes,
            addrRes,
            reqRes,
            verRes,
            notifRes,
            loyaltyRes,
            walletRes,
            catalogRes,
          ] = await Promise.all([
            hrmssApi.getMe(),
            hrmssApi.getCustomerAddresses(),
            hrmssApi.getCustomerRequests("ALL"),
            hrmssApi.getEmailVerificationStatus(),
            hrmssApi.getNotifications(),
            hrmssApi.getLoyalty(),
            hrmssApi.getVoucherWallet("AVAILABLE"),
            hrmssApi.getVoucherCatalog(),
          ]);
          if (!authTokens.get()) return;
          const serverProfile =
            meRes.ok && meRes.data?.profile ? meRes.data.profile : null;
          const serverAccount =
            meRes.ok && meRes.data?.account ? meRes.data.account : null;
          const serverName =
            serverProfile?.full_name || serverAccount?.username || acc.name;
          // getMe lỗi -> giữ SĐT đang có (không ghi "" đè lên).
          const serverPhone = meRes.ok
            ? serverProfile?.phone || ""
            : acc.phone || "";
          const serverEmail = serverAccount?.email || acc.email;

          const remoteAddrs = okItems(addrRes)
            ? addrRes.data.items.map(mapBackendAddressToApp).filter(Boolean)
            : null;
          // Thông tin thợ thật của các đơn đã có thợ (tên, SĐT, điểm): GET /customer/requests/:id/tracking.
          const rawRequests = okItems(reqRes);
          if (rawRequests) {
            const isFinished = (r) =>
              r.request_status === "COMPLETED" ||
              String(r.request_status || "").startsWith("CANCELLED");
            // Đơn đã xong / huỷ đã tải đủ ở lần trước (cùng trạng thái & phiên bản cache mới): dùng lại, không gọi API.
            const cached = (r) => {
              const c = isFinished(r)
                ? finishedOrderCache.current.get(String(r.request_id))
                : null;
              return c && c.cacheVer === 4 && c.status === r.request_status && (c.updatedAt || null) === (r.updated_at || null) ? c : null;
            };
            rawRequests.forEach((r) => {
              const c = cached(r);
              if (c)
                Object.assign(r, {
                  ...(c.items ? { items: c.items } : {}),
                  ...(c.quotations ? { quotations: c.quotations } : {}),
                  ...(c.diagnoses ? { diagnoses: c.diagnoses } : {}),
                  ...(c.visits ? { visits: c.visits } : {}),
                  ...(c.timeline ? { timeline: c.timeline } : {}),
                  ...(c._detailAttachments ? { _detailAttachments: c._detailAttachments } : {}),
                  ...(c.review ? { review: c.review } : {}),
                  ...(c.warranty ? { warranty: c.warranty } : {}),
                  ...(c.warranty_days !== undefined ? { warranty_days: c.warranty_days } : {}),
                  ...(c.warranty_start_date !== undefined ? { warranty_start_date: c.warranty_start_date } : {}),
                  ...(c.warranty_end_date !== undefined ? { warranty_end_date: c.warranty_end_date } : {}),
                  ...(c.customer_tier_code !== undefined ? { customer_tier_code: c.customer_tier_code } : {}),
                  ...(c.customer_tier_label !== undefined ? { customer_tier_label: c.customer_tier_label } : {}),
                  ...(c.customer_tier_name !== undefined ? { customer_tier_name: c.customer_tier_name } : {}),
                  technician: c.technician,
                  journey: c.journey,
                  bill: c.bill,
                  ...(c._evidence ? { _evidence: c._evidence } : {}),
                  ...(c._evidenceFetched ? { _evidenceFetched: true } : {}),
                  ...(c._detailLoaded ? { _detailLoaded: true } : {}),
                });
            });
            // Ưu tiên đơn đang hoạt động lên trước để không bị trôi khỏi giới hạn tải chi tiết khi khách có nhiều đơn cũ.
            const prioritySorted = [...rawRequests].sort((x, y) => {
              const xAct = !isFinished(x) && x.request_status !== "READY_FOR_ACCEPTANCE" ? 0 : 1;
              const yAct = !isFinished(y) && y.request_status !== "READY_FOR_ACCEPTANCE" ? 0 : 1;
              if (xAct !== yAct) return xAct - yAct;
              return (
                new Date(y.updated_at || y.created_at || 0).getTime() -
                new Date(x.updated_at || x.created_at || 0).getTime()
              );
            });
            // Chi tiết đầy đủ của đơn (quotations + items, diagnoses, visits, timeline): GET /customer/requests/:id.
            const needDetail = prioritySorted
              .filter(
                (r) =>
                  r.request_id &&
                  r.request_status !== "RECEIVED" &&
                  !cached(r),
              )
              .slice(0, 25);
            const needTech = prioritySorted
              .filter(
                (r) =>
                  r.request_status !== "RECEIVED" &&
                  !String(r.request_status || "").startsWith("CANCELLED") &&
                  !cached(r),
              )
              .slice(0, 20);
            // Hoá đơn thật (tiền phải trả, đã trả, giảm giá, phí kiểm tra): GET /customer/requests/:id/bill.
            const needBill = prioritySorted
              .filter((r) => r.request_status !== "RECEIVED" && !cached(r))
              .slice(0, 20);
            const [details, trackings, bills] = await Promise.all([
              Promise.all(
                needDetail.map((r) =>
                  hrmssApi.getCustomerRequestDetail(r.request_id).catch(() => null),
                ),
              ),
              Promise.all(
                needTech.map((r) =>
                  hrmssApi.getRequestTracking(r.request_id).catch(() => null),
                ),
              ),
              Promise.all(
                needBill.map((r) =>
                  hrmssApi.getBill(r.request_id).catch(() => null),
                ),
              ),
            ]);
            needDetail.forEach((r, i) => {
              const d = details[i];
              if (d?.ok && d.data) {
                Object.assign(r, mergeCustomerRequestDetail(r, d.data));
                r._detailLoaded = true;
              }
            });
            needTech.forEach((r, i) => {
              const t = trackings[i];
              if (t?.ok && t.data?.technician) r.technician = t.data.technician;
              if (t?.ok && t.data?.journey) r.journey = t.data.journey;
            });
            needBill.forEach((r, i) => {
              if (bills[i]?.ok && bills[i].data?.bill) r.bill = bills[i].data;
            });
            // Ảnh minh chứng & triệu chứng trên đơn (kể cả đơn mới tạo / đang xử lý / chờ thanh toán): GET /uploads?request_id=
            const needPhotos = prioritySorted
              .filter((r) => {
                const st = String(r.request_status || "").toUpperCase();
                return r.request_id && !st.startsWith("CANCEL") && (!cached(r) || !r._evidence);
              })
              .slice(0, 25);
            const photoLists = await Promise.all(
              needPhotos.map((r) =>
                hrmssApi.listRequestPhotos(r.request_id).catch(() => null),
              ),
            );
            needPhotos.forEach((r, i) => {
              const res = photoLists[i];
              const rows = res?.ok
                ? res.data?.items ||
                  res.data?.attachments ||
                  (Array.isArray(res.data) ? res.data : [])
                : null;
              const combined = [...(Array.isArray(rows) ? rows : []), ...(Array.isArray(r._detailAttachments) ? r._detailAttachments : [])]
                .filter(
                  (row) =>
                    row &&
                    (!row.procedure_step_id || ["AFTER_REPAIR", "DOCUMENT"].includes(String(row.evidence_type || "").toUpperCase())),
                );
              if (rows || combined.length) {
                const seen = new Set();
                const mergedRows = [];
                combined.forEach((row) => {
                  const key = row.attachment_id != null ? `id:${row.attachment_id}` : `uri:${row.image_url || row.file_url || row.url || row.uri || ''}`;
                  if (!key || key === 'uri:' || seen.has(key)) return;
                  seen.add(key);
                  mergedRows.push(row);
                });
                r._evidence = mergedRows.map(mapBackendPhotoToEvidence);
              }
              if (res?.ok) r._evidenceFetched = true;
            });
            // Nếu đơn ngoài top needPhotos nhưng detail đã trả ảnh -> vẫn map _evidence.
            rawRequests.forEach((r) => {
              if (!r._evidence && Array.isArray(r._detailAttachments) && r._detailAttachments.length) {
                r._evidence = r._detailAttachments.map(mapBackendPhotoToEvidence);
              }
            });
            // Ghi nhớ đơn đã xong / huỷ khi đã có hoá đơn & chi tiết (không cache đơn huỷ còn nợ phí kiểm tra).
            rawRequests
              .filter(
                (r) => {
                  if (!isFinished(r) || !r.bill || !r._detailLoaded || cached(r)) return false;
                  const isCancelled = String(r.request_status || "").toUpperCase().startsWith("CANCELLED");
                  if (isCancelled) {
                    const due = Number(r.bill?.bill?.amount_due) || 0;
                    const ps = String(r.bill?.payment_status || "").toUpperCase();
                    if (due > 0 && !["PAID", "NOTHING_TO_PAY"].includes(ps)) return false;
                  }
                  return true;
                },
              )
              .forEach((r) => {
                finishedOrderCache.current.set(String(r.request_id), {
                  cacheVer: 4,
                  status: r.request_status,
                  updatedAt: r.updated_at || null,
                  items: r.items,
                  quotations: r.quotations,
                  diagnoses: r.diagnoses,
                  visits: r.visits,
                  timeline: r.timeline,
                  _detailAttachments: r._detailAttachments,
                  review: r.review,
                  warranty: r.warranty,
                  warranty_days: r.warranty_days,
                  warranty_start_date: r.warranty_start_date,
                  warranty_end_date: r.warranty_end_date,
                  customer_tier_code: r.customer_tier_code,
                  customer_tier_label: r.customer_tier_label,
                  customer_tier_name: r.customer_tier_name,
                  technician: r.technician,
                  journey: r.journey,
                  bill: r.bill,
                  _evidence: r._evidence,
                  _evidenceFetched: Boolean(r._evidenceFetched),
                  _detailLoaded: Boolean(r._detailLoaded),
                });
              });
          }
          const remoteOrders = rawRequests
            ? rawRequests
                .map((r) => {
                  const mapped = mapBackendCustomerRequestToOrder(
                    r,
                    serverPhone || acc.phone,
                  );
                  if (!mapped) return null;
                  const ev = r._evidence || null;
                  const atts = extractInitialAttachments(ev || [], mapped.attachments);
                  return {
                    ...mapped,
                    ...(ev ? { evidence: ev } : {}),
                    ...(atts.length ? { attachments: atts } : {}),
                    ...(r._detailLoaded ? { _detailHydrated: true } : {}),
                  };
                })
                .filter(Boolean)
            : null;
          const remoteEmailVerified =
            verRes.ok && verRes.data
              ? Boolean(verRes.data.email_verified)
              : null;
          const loyalty = loyaltyRes.ok ? loyaltyRes.data : null;
          const wallet = okItems(walletRes);
          const catalog = catalogRes.ok ? catalogRes.data : null;

          const curAuthBeforeUp = stateRef.current?.auth;
          const syncedAuth =
            curAuthBeforeUp &&
            (!acc?.id || String(curAuthBeforeUp.id) === String(acc.id))
              ? upsertBackendAccount({
                  ...curAuthBeforeUp,
                  name: serverName,
                  phone: meRes.ok ? serverPhone : curAuthBeforeUp.phone ?? acc.phone,
                  email: serverEmail,
                  emailVerified:
                    remoteEmailVerified !== null
                      ? remoteEmailVerified
                      : curAuthBeforeUp.emailVerified,
                })
              : null;

          up((p) => {
            if (!isSameAccount(p)) return {};
            syncSeqRef.current += 1;
            const prevAddrById = new Map((p.addresses || []).map((ad) => [ad.id, ad]));
            const genderMap = p.addressGenderMap || {};
            const nextAddresses =
              remoteAddrs !== null
                ? remoteAddrs.map((ad) => ({
                    ...ad,
                    gender:
                      genderMap[String(ad.dbAddressId)] ||
                      genderMap[ad.id] ||
                      prevAddrById.get(ad.id)?.gender ||
                      ad.gender ||
                      "Nam",
                  }))
                : p.addresses;
            const defaultAddr =
              nextAddresses.find((x) => x.isDefault) ||
              nextAddresses[0] ||
              null;
            const nextSelectedId = nextAddresses.some(
              (x) => x.id === p.selectedAddressId,
            )
              ? p.selectedAddressId
              : defaultAddr?.id || null;
            const remoteWithAcc = remoteOrders
              ? remoteOrders.map((o) => ({
                  ...o,
                  customerAccountId: acc.id || o.customerAccountId || null,
                }))
              : null;
            const nextOrdersRaw = remoteWithAcc
              ? mergeBackendOrdersWithLocal(p.orders, remoteWithAcc)
              : p.orders;
            // Báo khách khi trạng thái đơn đổi (thợ nhận, thợ trả việc / hết hạn -> điều phối lại, chờ thanh toán, hoàn thành...).
            const { orders: nextOrders, notifs: detectedNotifs } = remoteWithAcc
              ? detectCustomerStatusChanges(p.orders, nextOrdersRaw)
              : { orders: nextOrdersRaw, notifs: [] };
            const notifItems = okItems(notifRes);
            // Server vừa gửi thông báo cho đúng đơn đó (≤ 2 phút) thì không tạo thêm bản trên máy (tránh trùng).
            const recentServerCodes = new Set(
              (notifItems || [])
                .filter(
                  (n) =>
                    n.created_at &&
                    Date.now() - new Date(n.created_at).getTime() <
                      2 * 60 * 1000,
                )
                .map(
                  (n) =>
                    nextOrders.find(
                      (o) => String(o.dbRequestId) === String(n.request_id),
                    )?.code,
                )
                .filter(Boolean),
            );
            const statusNotifs = detectedNotifs.filter(
              (n) => !recentServerCodes.has(n.link?.params?.code),
            );
            if (statusNotifs.length) statusToastRef.current = statusNotifs[0];
            // Thông báo tạo trên máy (đổi trạng thái, quá hạn...) không có trên server: giữ lại khi tải danh sách server.
            const localNotifs = [
              ...statusNotifs,
              ...p.notifications.filter((n) => !n.dbNotificationId),
            ].filter((n) =>
              shouldKeepNotificationAfterClear(
                n,
                p.notifClearedAt,
                p.notifKeptIds,
              ),
            );
            const nextAuth = syncedAuth || p.auth;
            return {
              user: {
                ...(p.user || {}),
                name: serverName,
                phone: meRes.ok
                  ? serverPhone
                  : (p.user?.phone ?? acc.phone ?? ""),
                email: serverEmail,
              },
              ...(nextAuth ? { auth: nextAuth } : {}),
              addresses: nextAddresses,
              selectedAddressId: nextSelectedId,
              orders: nextOrders,
              ...(notifItems
                ? {
                    notifications: [
                      ...notifItems
                        .map((n) =>
                          mapBackendNotification(n, nextOrders, "order"),
                        )
                        .filter((n) =>
                          shouldKeepNotificationAfterClear(
                            n,
                            p.notifClearedAt,
                            p.notifKeptIds,
                          ),
                        ),
                      ...localNotifs,
                    ]
                      .sort((x, y) => (y.at || 0) - (x.at || 0))
                      .slice(0, 50),
                  }
                : statusNotifs.length
                  ? {
                      notifications: [
                        ...statusNotifs,
                        ...p.notifications,
                      ].slice(0, 50),
                    }
                  : {}),
              ...(loyalty
                ? {
                    points: Number(loyalty.points) || 0,
                    lifetimePoints: Number(loyalty.lifetime_points) || 0,
                    pointHistory: (loyalty.history || [])
                      .map((h) => mapPointHistory(h, nextOrders))
                      .filter(Boolean),
                  }
                : {}),
              ...(wallet
                ? { myVouchers: wallet.map(mapWalletVoucher).filter(Boolean) }
                : {}),
              ...(catalog
                ? {
                    publicVouchers: (catalog.public_vouchers || [])
                      .map(mapPublicVoucher)
                      .filter(Boolean),
                    redeemOptions: (catalog.redeem_options || [])
                      .map(mapRedeemOption)
                      .filter(Boolean),
                  }
                : {}),
            };
          });
          setTimeout(() => {
            const n = statusToastRef.current;
            if (!n) return;
            statusToastRef.current = null;
            playNotificationSound("notification");
            uiRef.current?.toast(n.title, n.icon || "🔔");
          }, 0);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[HRMSS Sync Error][Customer]", e);
        }
      } else if (acc.role === "tech") {
        try {
          const [jobsRes, openRes, techMatRes, notifRes, profRes, reviewRes] =
            await Promise.all([
              hrmssApi.getTechnicianJobs("ALL"),
              hrmssApi.getTechnicianOpenRequests(),
              hrmssApi.getTechnicianMaterials(),
              hrmssApi.getNotifications(),
              hrmssApi.getTechnicianProfile(),
              hrmssApi.getTechnicianReviews(),
            ]);
          if (!authTokens.get()) return;
          if (!jobsRes.ok) {
            // eslint-disable-next-line no-console
            console.warn("[HRMSS Sync Warn][Tech.getTechnicianJobs]", jobsRes.status, jobsRes.code, jobsRes.message);
          }
          if (!techMatRes.ok) {
            // eslint-disable-next-line no-console
            console.warn("[HRMSS Sync Warn][Tech.getTechnicianMaterials]", techMatRes.status, techMatRes.code, techMatRes.message);
          }
          if (okItems(techMatRes))
            syncCatalogFromBackend({ materials: techMatRes.data.items });
          const summary = reviewRes.ok ? reviewRes.data?.summary : null;
          const specialtyInfo = profRes.ok
            ? readTechnicianSpecialties(profRes.data)
            : null;
          // Hoá đơn: ưu tiên toàn bộ việc đang chờ thanh toán / trả thiếu (kể cả khi assignment_status='ENDED'), sau đó mới tới ACTIVE khác.
          const PAYMENT_STATUSES = [
            "PENDING_PAYMENT",
            "PARTIALLY_PAID_RECEIVABLE",
            "PENDING_REVIEW",
          ];
          const isBillPriorityJob = (j) =>
            PAYMENT_STATUSES.includes(j.request?.request_status) ||
            (String(j.request?.request_status || "").toUpperCase().startsWith("CANCELLED") &&
              Boolean(j.arrived_at || Number(j.request?.inspection_fee) > 0 || Number(j.bill?.bill?.amount_due) > 0));
          const allJobsRaw =
            jobsRes.ok && Array.isArray(jobsRes.data?.items)
              ? jobsRes.data.items
              : [];
          const activeJobsList = [
            ...allJobsRaw.filter((j) => j.assignment_status === "ACTIVE" && j.assignment_id),
            ...allJobsRaw.filter(
              (j) =>
                j.assignment_status !== "ACTIVE" &&
                j.assignment_id &&
                isBillPriorityJob(j),
            ),
            ...allJobsRaw.filter(
              (j) =>
                j.assignment_status !== "ACTIVE" &&
                j.assignment_id &&
                !isBillPriorityJob(j),
            ),
          ].slice(0, 15);
          const activeJobIds = activeJobsList.map((j) => String(j.assignment_id));
          const paymentJobIds = allJobsRaw
            .filter(
              (j) =>
                j.assignment_id &&
                isBillPriorityJob(j),
            )
            .map((j) => String(j.assignment_id));
          const billJobIds = [
            ...new Set([
              ...activeJobIds,
              ...paymentJobIds,
            ]),
          ].slice(0, 25);
          const [photoLists, reqPhotoLists, jobBills] = await Promise.all([
            Promise.all(
              activeJobsList.map((j) =>
                hrmssApi.listJobPhotos(String(j.assignment_id)).catch(() => null),
              ),
            ),
            Promise.all(
              activeJobsList.map((j) =>
                j.request?.request_id
                  ? hrmssApi.listRequestPhotos(j.request.request_id).catch(() => null)
                  : Promise.resolve(null),
              ),
            ),
            // Hoá đơn của việc (tiền mặt cần thu, giảm giá): GET /technician/jobs/:id/bill.
            Promise.all(
              billJobIds.map((id) =>
                hrmssApi.getTechnicianJobBill(id).catch(() => null),
              ),
            ),
          ]);
          const billByJob = new Map();
          billJobIds.forEach((id, i) => {
            if (jobBills[i]?.ok && jobBills[i].data?.bill)
              billByJob.set(id, jobBills[i].data);
          });
          const evidenceByJob = new Map();
          const fetchedEvidenceIds = new Set();
          activeJobsList.forEach((j, i) => {
            const id = String(j.assignment_id);
            const extractRows = (res) =>
              res?.ok
                ? res.data?.items ||
                  res.data?.attachments ||
                  (Array.isArray(res.data) ? res.data : [])
                : [];
            const jobRows = extractRows(photoLists[i]);
            const reqRows = extractRows(reqPhotoLists[i]);
            if (photoLists[i]?.ok || reqPhotoLists[i]?.ok) {
              fetchedEvidenceIds.add(id);
              const seen = new Set();
              const mergedRows = [];
              [...jobRows, ...reqRows]
                .filter(
                  (r) =>
                    r &&
                    (!r.procedure_step_id || ["AFTER_REPAIR", "DOCUMENT"].includes(String(r.evidence_type || "").toUpperCase())),
                )
                .forEach((r) => {
                  const key = r.attachment_id != null ? `id:${r.attachment_id}` : `uri:${r.image_url || r.file_url || r.url || ''}`;
                  if (!key || key === 'uri:' || seen.has(key)) return;
                  seen.add(key);
                  mergedRows.push(r);
                });
              evidenceByJob.set(id, mergedRows.map(mapBackendPhotoToEvidence));
            }
          });
          up((p) => {
            if (!isSameAccount(p)) return {};
            syncSeqRef.current += 1;
            const base = p.techProfile || mergeTechProfile(null, acc);
            const techProf = {
              ...base,
              ...(profRes.ok
                ? {
                    area: profRes.data?.work_area || profRes.data?.profile?.work_area || base.area || "Hà Nội",
                    specialtiesAvailable: Boolean(specialtyInfo?.available),
                    specialties: specialtyInfo?.specialties || [],
                    specialtyCategoryIds: specialtyInfo?.categoryIds || [],
                    acceptsAllCategories:
                      specialtyInfo?.acceptsAllCategories || false,
                  }
                : { area: base.area || "Hà Nội" }),
              ...(summary
                ? {
                    rating: summary.rating_average,
                    ratingCount: summary.rating_count,
                    satisfactionPercent: summary.satisfaction_percent,
                  }
                : {}),
              reviews: reviewRes.ok
                ? reviewRes.data?.items || []
                : base.reviews || [],
            };
            // Đánh giá của khách (GET /technician/jobs/reviews) -> gắn vào đúng việc để màn chi tiết hiện "Khách đánh giá".
            const reviewItems =
              reviewRes.ok && Array.isArray(reviewRes.data?.items)
                ? reviewRes.data.items
                : [];
            const reviewOf = (j) =>
              reviewItems.find(
                (r) =>
                  (r.request_code &&
                    r.request_code === j.request?.request_code) ||
                  (r.request_id != null &&
                    String(r.request_id) === String(j.request?.request_id)) ||
                  (r.assignment_id != null &&
                    String(r.assignment_id) === String(j.assignment_id)),
              );
            const assignedOrders =
              jobsRes.ok && Array.isArray(jobsRes.data?.items)
                ? jobsRes.data.items
                    .map((j) => {
                      const b = billByJob.get(String(j.assignment_id));
                      let o = mapBackendTechJobToOrder(
                        b ? { ...j, bill: b } : j,
                        techProf,
                      );
                      const ev = evidenceByJob.get(String(j.assignment_id));
                      const evFetched = fetchedEvidenceIds.has(String(j.assignment_id));
                      if (o && (ev || evFetched)) {
                        const mergedAtts = extractInitialAttachments(ev || [], o.attachments);
                        o = {
                          ...o,
                          ...(evFetched ? { _evidenceFetched: true } : {}),
                          ...(ev ? { evidence: ev } : {}),
                          ...(mergedAtts.length ? { attachments: mergedAtts } : {}),
                        };
                      }
                      const rv = o && !o.rating ? reviewOf(j) : null;
                      if (rv)
                        o = {
                          ...o,
                          rating: {
                            stars: Number(rv.rating) || 5,
                            text: rv.review_text || "",
                            at: rv.created_at
                              ? new Date(rv.created_at).getTime()
                              : null,
                          },
                        };
                      return o;
                    })
                    .filter(Boolean)
                : (p.orders || []).filter(
                    (o) => o.assignmentActive || o.status !== "pending",
                  );
            const assignedCodes = new Set(assignedOrders.map((o) => o.code));
            // Đơn bắn cho thợ đã quá hạn tiếp nhận: bỏ hẳn khỏi danh sách (không lưu, không hiển thị).
            const syncNow = Date.now();
            const openOrders =
              openRes.ok && Array.isArray(openRes.data?.items)
                ? openRes.data.items
                    .map(mapBackendOpenRequestToOrder)
                    .filter(
                      (o) =>
                        o &&
                        !assignedCodes.has(o.code) &&
                        !isOfferExpired(o, syncNow),
                    )
                : (p.orders || []).filter(
                    (o) =>
                      o.status === "pending" &&
                      !assignedCodes.has(o.code) &&
                      !isOfferExpired(o, syncNow),
                  );
            const remoteOrders = [
              ...assignedOrders.filter((o) => !isOfferExpired(o, syncNow)),
              ...openOrders,
            ];
            const nextOrders = mergeBackendOrdersWithLocal(
              p.orders,
              remoteOrders,
            );
            const completedJobsCount = assignedOrders.filter(
              (o) => o.status === "done",
            ).length;
            const notifItems = okItems(notifRes);
            return {
              orders: nextOrders,
              techProfile: { ...techProf, jobs: completedJobsCount },
              ...(notifItems
                ? {
                    techNotifs: notifItems
                      .map((n) =>
                        mapBackendNotification(n, nextOrders, "tech-job"),
                      )
                      .filter((n) =>
                        shouldKeepNotificationAfterClear(
                          n,
                          p.techNotifClearedAt,
                          p.techNotifKeptIds,
                        ),
                      ),
                  }
                : {}),
            };
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[HRMSS Sync Error][Tech]", e);
        }
      }
    } finally {
      syncingRef.current = false;
      const queued = pendingForceSyncRef.current;
      if (queued) {
        pendingForceSyncRef.current = null;
        if (
          authIdRef.current &&
          String(queued.id) === String(authIdRef.current) &&
          stateRef.current?.auth?.id &&
          String(queued.id) === String(stateRef.current.auth.id)
        ) {
          setTimeout(() => { syncRef.current?.(queued, true); }, 0);
        }
      }
    }
  };

  // Mô tả + các bước thực hiện chuẩn của một dịch vụ (màn chi tiết dịch vụ).
  const loadServiceDetail = async (serviceDbId) => {
    if (!serviceDbId) return null;
    const [det, proc] = await Promise.all([
      hrmssApi.getServiceDetail(serviceDbId).catch(() => null),
      hrmssApi.getServiceProcedure(serviceDbId).catch(() => null),
    ]);
    if (!det?.ok && !proc?.ok) return null;
    const svcDetail = det?.ok ? det.data?.service : null;
    const warrantyDays =
      svcDetail && Object.prototype.hasOwnProperty.call(svcDetail, "warranty_days")
        ? parseWarrantyDays(svcDetail.warranty_days)
        : undefined;
    const catalogChanged =
      warrantyDays !== undefined ? setServiceWarrantyDays(serviceDbId, warrantyDays) : false;
    const info = {
      description: svcDetail?.description || "",
      bookingCount: svcDetail?.booking_count ?? null,
      ratingAverage: svcDetail?.rating?.average ?? null,
      ratingCount: svcDetail?.rating?.count ?? null,
      warrantyDays,
      images: Array.isArray(svcDetail?.images) ? svcDetail.images : [],
      steps: proc?.ok ? proc.data?.steps || [] : null,
      at: Date.now(),
    };
    up((p) => ({
      serviceDetails: { ...(p.serviceDetails || {}), [serviceDbId]: info },
      ...(catalogChanged ? { catalogVersion: Date.now() } : {}),
    }));
    return info;
  };

  // Điểm + nhận xét của khách cho một dịch vụ (màn chi tiết dịch vụ). Lưu theo dbId để không gọi lại liên tục.
  const loadServiceReviews = async (serviceDbId) => {
    if (!serviceDbId) return null;
    const res = await hrmssApi
      .getServiceReviews(serviceDbId, { limit: 5 })
      .catch(() => null);
    if (!res?.ok) return null;
    up((p) => ({
      serviceReviews: {
        ...(p.serviceReviews || {}),
        [serviceDbId]: { ...res.data, at: Date.now() },
      },
    }));
    return res.data;
  };

  // Dựng tài khoản app từ phản hồi đăng nhập / làm mới phiên của backend ({ account }) + hồ sơ (/auth/me).
  const buildBackendAccount = async (data) => {
    const roleCode = String(
      data.role || data.account?.role?.role_code || "CUSTOMER",
    ).toUpperCase();
    const isTech = roleCode === "TECHNICIAN" || roleCode === "TECH";
    const account = {
      id: `be-${data.user_id || data.account?.user_id}`,
      role: isTech ? "tech" : "customer",
      name: data.account?.username || "",
      phone: "",
      email: data.account?.email || "",
    };
    try {
      const [meRes, verRes, infoRes] = await Promise.all([
        hrmssApi.getMe(),
        hrmssApi.getEmailVerificationStatus(),
        hrmssApi.getUserProfile().catch(() => null),
      ]);
      if (meRes.ok && meRes.data) {
        account.name =
          meRes.data.profile?.full_name ||
          meRes.data.account?.username ||
          account.name;
        account.phone = meRes.data.profile?.phone || "";
        account.email = meRes.data.account?.email || account.email;
      }
      // Ngày sinh: GET /users/me -> profile.dateOfBirth (YYYY-MM-DD).
      const info = infoRes?.ok ? infoRes.data?.user || infoRes.data : null;
      if (info?.profile?.dateOfBirth) {
        account.dob = isoToDob(info.profile.dateOfBirth);
      } else if (infoRes?.ok) {
        account.dob = "";
      }
      if (verRes.ok && verRes.data)
        account.emailVerified = Boolean(verRes.data.email_verified);
    } catch (meErr) {
      /* hồ sơ lỗi: vẫn đăng nhập với thông tin tối thiểu */
    }
    account.username = data.account?.username || "";
    if (isTech) account.techCode = account.username || account.id;
    return upsertBackendAccount(account);
  };

  useEffect(() => {
    (async () => {
      if (!IS_WEB_STORAGE) {
        try {
          await Promise.all([hydrateAuthStore(), authTokens.restore()]);
          const savedNative = await readJson(KEY, "local");
          const hydratedSession = getSession();
          if (!authIdRef.current && !stateRef.current?.auth && (savedNative || hydratedSession)) {
            const rawSaved = savedNative || {};
            const savedAccId = rawSaved.savedAccountId || rawSaved.auth?.id || null;
            const sameSavedAcc =
              Boolean(savedAccId && hydratedSession?.id && String(savedAccId) === String(hydratedSession.id)) ||
              (!hydratedSession && !savedAccId);
            const fromBackend = (list, idKey) =>
              Array.isArray(list) ? list.filter((x) => x && x[idKey] != null) : [];
            const { devices: _legacyDevices, savedAccountId: _ignoredSavedAccId, ...savedRest } = rawSaved;
            const role = hydratedSession?.role || rawSaved.role || "customer";
            const cleanUser = hydratedSession
              ? {
                  name: hydratedSession.name || "",
                  phone: hydratedSession.phone || "",
                  email: hydratedSession.email || "",
                }
              : rawSaved.user;
            if (hydratedSession?.id) authIdRef.current = hydratedSession.id;
            const sessKey = customerProfileKey(hydratedSession);
            const rawProfiles = rawSaved.customerProfiles || {};
            const savedProfileSlice = sessKey
              ? (rawProfiles[sessKey] || (hydratedSession?.phone ? rawProfiles[hydratedSession.phone] : null))
              : null;
            const sliceSource = savedProfileSlice || (sameSavedAcc ? rawSaved : null);
            const customerHydrated = role === "tech"
              ? makeCustomerSlice()
              : sliceSource
                ? {
                    ...makeCustomerSlice(),
                    ...sliceSource,
                    addresses: fromBackend(sliceSource.addresses, "dbAddressId"),
                    notifications: fromBackend(sliceSource.notifications, "dbNotificationId"),
                    pointHistory: (sliceSource.pointHistory || []).filter((h) =>
                      String(h?.id || "").startsWith("pt-db-"),
                    ),
                    myVouchers: (sliceSource.myVouchers || []).filter(
                      (v) => v?.customerVoucherId != null,
                    ),
                    points: sliceSource.points ?? 0,
                    lifetimePoints: sliceSource.lifetimePoints ?? 0,
                  }
                : makeCustomerSlice();
            delete customerHydrated.devices;
            delete customerHydrated.favorites;
            up((p) => ({
              ...(sameSavedAcc ? savedRest : {}),
              orders: sameSavedAcc
                ? (rawSaved.orders || []).filter(
                    (o) => o && (o.dbRequestId != null || o.dbAssignmentId != null),
                  )
                : [],
              ...customerHydrated,
              ...(sessKey ? { customerProfiles: { ...rawProfiles, [sessKey]: customerHydrated } } : {}),
              techNotifs:
                role === "tech" && sameSavedAcc
                  ? fromBackend(rawSaved.techNotifs, "dbNotificationId")
                  : [],
              user: cleanUser || p.user,
              techProfile:
                role === "tech"
                  ? mergeTechProfile(sameSavedAcc ? (rawSaved.techProfile || p.techProfile) : null, hydratedSession || { role: "tech" })
                  : null,
              auth: hydratedSession || p.auth,
              role: role || p.role,
              catalogVersion: p.catalogVersion || rawSaved.catalogVersion,
              policy: p.policy || rawSaved.policy,
            }));
            if (hydratedSession?.role === "tech") setTab("tech-jobs");
          }
        } finally {
          storageHydratedRef.current = true;
        }
      }
      // Tải danh mục & cấu hình công khai ngay khi mở app (dù chưa đăng nhập).
      syncPublicCatalog();
      // Bản native lưu phiên trong SecureStore (sessionStorage/localStorage không có trên điện thoại):
      // mở lại app mà chưa có phiên trên máy -> dùng refresh token đã lưu để vào lại, không phải đăng nhập lại.
      // Sau hydrate, `s.auth` của lần render đầu đã cũ: luôn đọc lại phiên từ kho lưu trữ.
      const session = getSession() || stateRef.current?.auth || null;
      if (!session) {
        const resumed = await hrmssApi.resumeSession().catch(() => null);
        if (resumed?.ok && resumed.data?.account) {
          a.applyAuth(await buildBackendAccount(resumed.data));
          return; // applyAuth tự đồng bộ dữ liệu
        }
        return;
      }
      syncFromBackend(session);
    })();
  }, []);

  // Kết nối Socket.IO thời gian thực khi có người dùng đăng nhập (backend/README.md, mục Realtime).
  // Hàm xử lý sự kiện đọc syncFromBackend / ui qua ref để luôn dùng bản của lần render mới nhất.
  const syncRef = useRef(null);
  syncRef.current = syncFromBackend;
  const uiRef = useRef(null);
  uiRef.current = ui;
  // State mới nhất cho các handler socket / foreground / timer (closure của effect giữ `s` cũ).
  const stateRef = useRef(s);
  stateRef.current = s;

  // Tự động đồng bộ khi app quay lại foreground (mobile + focus/visibility trên Web) và định kỳ:
  // mỗi 10s khi còn đơn đang xử lý (dự phòng realtime), 60s khi rảnh.
  useEffect(() => {
    let lastFocusSync = 0;
    const syncOnResume = () => {
      const now = Date.now();
      if (now - lastFocusSync < 2000) return;
      lastFocusSync = now;
      syncRef.current?.(null, true);
      reconnectSocket(); // socket bị ngắt khi app chạy nền: kết nối lại ngay (không làm gì nếu đang kết nối)
    };
    const onAppStateChange = (nextState) => {
      if (nextState === "active") syncOnResume();
    };
    const sub = AppState.addEventListener("change", onAppStateChange);

    const hasWin = typeof window !== "undefined" && typeof window.addEventListener === "function";
    const hasDoc = typeof document !== "undefined" && typeof document.addEventListener === "function";
    const onFocus = () => syncOnResume();
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncOnResume();
    };
    if (hasWin) window.addEventListener("focus", onFocus);
    if (hasDoc) document.addEventListener("visibilitychange", onVisibility);

    let timer = null;
    if (s.auth) {
      let tickCount = 0;
      timer = setInterval(() => {
        tickCount += 1;
        const hasActive = (stateRef.current?.orders || []).some(isActiveOrder);
        if (hasActive || tickCount % 6 === 0) {
          syncRef.current?.(null, true);
        }
        if (hasActive || tickCount % 6 === 0) {
          reconnectSocket();
        }
      }, 10000);
    }
    return () => {
      sub.remove();
      if (hasWin) window.removeEventListener("focus", onFocus);
      if (hasDoc) document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearInterval(timer);
    };
  }, [s.auth?.id]);
  useEffect(() => {
    if (!s.auth?.id) return undefined;
    initSocket(() => authTokens.get());

    // Một thao tác có thể phát cả request:status lẫn request:updated / notification:new -> gộp thành 1 lần tải lại.
    let syncTimer = null;
    let lastReauth = 0;
    const syncSoon = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => syncRef.current?.(null, true), 500);
    };

    const unsubs = [
      // Thông báo mới cho chính tài khoản này (thợ có việc mới, khách có thợ nhận, báo giá, tiền về...).
      subscribeSocketEvent("notification:new", (n) => {
        syncSoon();
        const nType = n?.notification_type || n?.type;
        if (n?.title || isAttendanceNotifType(nType))
          uiRef.current?.toast(viNotification(n).title, n?.icon || "🔔");
        // Thợ bị gỡ khỏi đơn (văn phòng đổi thợ / trả việc): thoát màn chi tiết và ngừng chờ cập nhật của đơn đó.
        if (
          stateRef.current?.auth?.role === "tech" &&
          nType === "JOB_REASSIGNED" &&
          n?.request_id != null
        ) {
          // Xác định đơn bị gỡ từ state hiện tại TRƯỚC khi setS (updater chạy trễ, không gán biến ngoài được).
          const target = (stateRef.current?.orders || []).find(
            (o) => String(o.dbRequestId) === String(n.request_id),
          );
          const removedCode = target?.code || null;
          if (removedCode) {
            setS((p) => ({
              ...p,
              orders: p.orders.filter((o) => o.code !== removedCode),
            }));
            setStack((st) => st.filter((x) => x.params?.code !== removedCode));
          }
        }
      }),
      subscribeSocketEvent("request:status", syncSoon),
      subscribeSocketEvent("request:updated", syncSoon),
      // Vị trí thợ đang đến (latitude = null: thợ đã tắt chia sẻ).
      subscribeSocketEvent("technician:location", (data) => {
        if (data?.request_id == null) return;
        setS((prev) => {
          const idx = prev.orders.findIndex(
            (o) => String(o.dbRequestId) === String(data.request_id),
          );
          if (idx < 0) return prev;
          const cur = prev.orders[idx];
          const next = [...prev.orders];
          if (data.latitude == null || data.longitude == null) {
            next[idx] = { ...cur, tracking: null };
            return { ...prev, orders: next };
          }
          next[idx] = {
            ...cur,
            tracking: {
              ...(cur.tracking || {}),
              lat: data.latitude,
              lng: data.longitude,
              accuracy: data.location_accuracy,
              updatedAt: data.updated_at
                ? new Date(data.updated_at).getTime()
                : Date.now(),
              label: "Vị trí trực tiếp của thợ",
            },
          };
          return { ...prev, orders: next };
        });
      }),
      // Token hết hạn (server từ chối / gửi session:expired): gọi 1 API có xác thực để app tự refresh token,
      // rồi kết nối lại (socket lấy token mới qua authTokens.get()). Refresh thất bại -> authTokens.onExpired xử lý.
      subscribeSocketEvent("auth_required", async () => {
        if (Date.now() - lastReauth < 10000) return; // tối đa 1 lần / 10 giây, tránh vòng lặp khi server vẫn từ chối
        lastReauth = Date.now();
        const res = await hrmssApi.getMe().catch(() => null);
        if (res?.ok) reconnectSocket();
      }),
      // Vừa kết nối lại sau khi mất mạng: tải lại để bù sự kiện bị lỡ (chặn loop reconnect liên tục).
      subscribeSocketEvent("connection_change", (c) => {
        if (c?.connected && Date.now() - lastSyncAt.current >= 4000) {
          syncSoon();
        }
      }),
    ];

    return () => {
      clearTimeout(syncTimer);
      unsubs.forEach((off) => off());
      disconnectSocket();
    };
  }, [s.auth?.id]);

  const inFlight = useRef(new Set()); // thao tác ghi đang chạy (chống bấm đúp)
  // Stack mã đơn của thao tác thợ đang chạy (chống ghi đè sai khi 2 thao tác chạy song song).
  const actionCodeRef = useRef(null);
  const actionCodeStackRef = useRef([]);
  useEffect(() => {
    apiEvents.onJobGone((_code, endpoint) => {
      if (s.auth?.role !== "tech") return;
      const ep = String(endpoint || "");
      const jobMatch = /\/technician\/jobs\/(\d+)/i.exec(ep);
      const openMatch = /\/technician\/(?:jobs\/)?open-requests\/(\d+)/i.exec(ep);
      const orders = stateRef.current?.orders || [];
      let targetCode = null;
      if (jobMatch) {
        targetCode =
          orders.find((o) => String(o.dbAssignmentId) === jobMatch[1])?.code ||
          null;
      } else if (openMatch) {
        targetCode =
          orders.find((o) => String(o.dbRequestId) === openMatch[1])?.code ||
          null;
      } else if (inFlight.current.size <= 1) {
        targetCode = actionCodeRef.current;
      }
      // Chỉ gỡ đơn khi chính thao tác người dùng trên đơn đó nhận được thông báo việc đã hết hạn / đã chuyển
      if (!targetCode) return;
      setS((p) => ({
        ...p,
        orders: p.orders.filter((o) => o.code !== targetCode),
      }));
      setStack((st) => st.filter((x) => x.params?.code !== targetCode));
      setTimeout(() => syncRef.current?.(null, true), 300);
    });
    return () => apiEvents.onJobGone(null);
  }, [s.auth?.role]);
  // Phiên hết hạn / bị thu hồi (refresh token hết hạn): xoá dữ liệu tài khoản trên máy, về màn chính và báo đăng nhập lại.
  // Trước đây token bị xoá nhưng app vẫn "đã đăng nhập", mọi thao tác chỉ báo "chưa đồng bộ".
  useEffect(() => {
    authTokens.onExpired(() => {
      if (!authIdRef.current && !stateRef.current?.auth) return;
      authIdRef.current = null;
      clearSessionCaches();
      disconnectSocket();
      clearSession();
      resetTransientUiState();
      setS((prev) => (prev.auth ? { ...prev, ...signedOutState(prev) } : prev));
      setStack([]);
      setTab("home");
      ui.alert(
        "Phiên đăng nhập đã hết hạn",
        "Vui lòng đăng nhập lại để tiếp tục.",
        "🔐",
      );
    });
    return () => authTokens.onExpired(null);
  }, []);

  // Thao tác ghi: gọi server trước. Lỗi -> báo (mã lỗi tiếng Việt nếu có) + tải lại dữ liệu thật, trả false.
  // Thành công -> báo toast + tải lại dữ liệu thật, trả true. Không tự sửa dữ liệu trên máy.
  const serverDone = async (
    res,
    { title = "Không thực hiện được", codes = {}, toast, icon = "✓" } = {},
  ) => {
    if (!res?.ok) {
      // eslint-disable-next-line no-console
      console.warn("[HRMSS Action Error]", {
        title,
        status: res?.status,
        code: res?.code,
        message: res?.message,
        errors: res?.errors,
      });
      ui.alert(
        title,
        codes[res?.code] || (res?.status > 0 ? res.message : networkError(res)),
        "⚠️",
      );
      await syncFromBackend(null, true);
      return false;
    }
    if (toast) ui.toast(toast, icon);
    await syncFromBackend(null, true);
    return true;
  };
  // Ghi chẩn đoán của lần đến hiện tại. Gửi lại cùng nội dung (báo giá lỗi rồi bấm gửi lại) thì không ghi thêm bản
  // trùng (trước đây mỗi lần bấm lại tạo thêm 1 "ghi chú sửa chữa"). Đã check-in thì lượt đến đã bắt đầu sẵn:
  // không gọi /start (server trả 409). Trả kết quả API, hoặc null khi đã ghi đúng nội dung này rồi.
  const lastDiagnosis = useRef(new Map()); // assignment_id -> nội dung chẩn đoán đã ghi thành công
  const clearSessionCaches = () => {
    pendingForceSyncRef.current = null;
    finishedOrderCache.current.clear();
    lastDiagnosis.current.clear();
  };
  const saveDiagnosisOnce = async (
    o,
    { diagnosis, symptoms, recommendation, needsQuotation },
  ) => {
    const findings =
      diagnosis && String(diagnosis).trim().length >= 5
        ? String(diagnosis).trim()
        : "Đã kiểm tra thực tế thiết bị tại nhà khách hàng";
    const payload = {
      symptoms: symptoms || null,
      findings,
      repair_recommendation: recommendation || null,
      needs_quotation: needsQuotation,
    };
    const signature = JSON.stringify(payload);
    if (lastDiagnosis.current.get(String(o.dbAssignmentId)) === signature)
      return null;
    if (!o.arrivedAt && !o.checkIn) {
      return {
        ok: false,
        status: 409,
        code: "CHECK_IN_REQUIRED",
        message: 'Bạn chưa xác nhận đến nơi tại nhà khách. Hãy bấm "Đã đến nơi" trước khi chẩn đoán.',
      };
    }
    const res = await hrmssApi.submitDiagnosis(o.dbAssignmentId, payload);
    if (res.ok) lastDiagnosis.current.set(String(o.dbAssignmentId), signature);
    return res;
  };
  const notSynced = (what = "Việc này") => {
    ui.alert(
      "Chưa đồng bộ",
      `${what} chưa có trên hệ thống. Kéo làm mới rồi thử lại.`,
      "ℹ️",
    );
    return false;
  };

  const isExternalQuoteItem = (it) =>
    Boolean(
      it?.quotation_item_id &&
        (it.is_external_purchase ||
          it.external_purchase ||
          (it.item_type === "MATERIAL" && !it.material_id)),
    );

  // Tự động rà soát & gắn các ảnh biên lai đã tải lên (POST /uploads) vào các dòng
  // linh kiện mua ngoài chưa được liên kết receipt_attachment_id trên server.
  const reconcileMissingPartReceipts = async (assignmentId) => {
    if (!assignmentId || !authTokens.get()) return 0;
    const [detailRes, photosRes] = await Promise.all([
      hrmssApi.getTechnicianJobDetail(assignmentId).catch(() => null),
      hrmssApi.listJobPhotos(assignmentId).catch(() => null),
    ]);
    const jobData = detailRes?.data?.job || detailRes?.data || {};
    const quotes = Array.isArray(jobData.quotations) ? jobData.quotations : [];
    const approvedQuotes = quotes.filter(
      (q) => q.quotation_status === "APPROVED" || q.customer_decision === "APPROVED",
    );
    const orderedQuotes = sortQuotationsAsc(approvedQuotes);
    const unlinkedItems = orderedQuotes
      .flatMap((q) => (Array.isArray(q.items) ? q.items : []))
      .filter((it) => isExternalQuoteItem(it) && !it.receipt_attachment_id);
    if (!unlinkedItems.length) return 0;

    const rows = photosRes?.ok
      ? photosRes.data?.items ||
        photosRes.data?.attachments ||
        (Array.isArray(photosRes.data) ? photosRes.data : [])
      : [];
    const jobUploads = (Array.isArray(rows) ? rows : []).filter(
      (r) => !r.procedure_step_id && r.attachment_id,
    );
    if (!jobUploads.length) return 0;

    const sortedUploads = [...jobUploads].sort(
      (x, y) => Number(y.attachment_id) - Number(x.attachment_id),
    );
    const docUploads = sortedUploads.filter(
      (r) => String(r.evidence_type || "").toUpperCase() === "DOCUMENT",
    );
    const usedAttIds = new Set(
      orderedQuotes
        .flatMap((q) => (Array.isArray(q.items) ? q.items : []))
        .map((it) => it.receipt_attachment_id)
        .filter(Boolean)
        .map(String),
    );

    let linkedCount = 0;
    for (const it of unlinkedItems) {
      const cleanName =
        parseExternalPartDesc(it.description_snapshot)?.cleanName ||
        it.description_snapshot ||
        "";
      const normName = normalizeExternalPartName(cleanName);
      const matchesDesc = (r) => {
        if (!normName) return false;
        const rawNote = r.description || r.note || "";
        const d = extractReceiptPartName(rawNote) || normalizeExternalPartName(rawNote);
        return Boolean(d && (d.includes(normName) || normName.includes(d)));
      };
      const isReceiptDoc = (r) =>
        String(r.evidence_type || "").toUpperCase() === "DOCUMENT" ||
        /biên lai|hóa đơn|hoá đơn|receipt/i.test(String(r.description || r.note || ""));
      const receiptUploads = sortedUploads.filter(isReceiptDoc);
      const candidate =
        docUploads.find((r) => !usedAttIds.has(String(r.attachment_id)) && matchesDesc(r)) ||
        docUploads.find(matchesDesc) ||
        (unlinkedItems.length === 1
          ? docUploads.find((r) => !usedAttIds.has(String(r.attachment_id)))
          : null) ||
        receiptUploads.find((r) => !usedAttIds.has(String(r.attachment_id)) && matchesDesc(r)) ||
        receiptUploads.find(matchesDesc);
      if (!candidate) continue;
      const res = await hrmssApi
        .attachPartReceipt(assignmentId, it.quotation_item_id, candidate.attachment_id)
        .catch(() => null);
      if (res?.ok) {
        linkedCount += 1;
        usedAttIds.add(String(candidate.attachment_id));
      }
    }
    return linkedCount;
  };

  const a = {
    syncFromBackend,
    syncCatalog: syncPublicCatalog,
    ensureOrderHydrated: async (code) => {
      if (!code || s.auth?.role !== "customer" || !authTokens.get()) return false;
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || o._detailHydrated) return false;
      const seqBefore = syncSeqRef.current;
      const [detRes, photoRes, billRes] = await Promise.all([
        hrmssApi.getCustomerRequestDetail(o.dbRequestId).catch(() => null),
        hrmssApi.listRequestPhotos(o.dbRequestId).catch(() => null),
        o.bill ? Promise.resolve(null) : hrmssApi.getBill(o.dbRequestId).catch(() => null),
      ]);
      if (!detRes?.ok && !photoRes?.ok && !billRes?.ok) return false;
      if (syncSeqRef.current !== seqBefore) return false;
      const baseReq = {
        request_id: o.dbRequestId,
        request_code: o.code,
        request_status: o.backendStatus || "COMPLETED",
        request_type: o.kind === "warranty" ? "WARRANTY" : o.kind === "followup" ? "FOLLOW_UP" : "NORMAL",
        out_of_warranty: Boolean(o.outOfWarranty),
        problem_description: o.note || "",
        goods_amount: o.goods ?? null,
        product_discount_amount: o.productDiscount ?? 0,
        combo_discount_amount: o.comboDiscount ?? 0,
        voucher_discount_amount: o.voucherDiscount ?? 0,
        estimated_total: o.total ?? o.finalTotal ?? null,
        created_at: new Date(o.createdAt || Date.now()).toISOString(),
        updated_at: new Date(o.doneAt || o.createdAt || Date.now()).toISOString(),
      };
      let mergedReq =
        detRes?.ok && detRes.data
          ? mergeCustomerRequestDetail(baseReq, detRes.data)
          : baseReq;
      if (billRes?.ok && billRes.data?.bill) mergedReq.bill = billRes.data;
      const photoRows = photoRes?.ok
        ? photoRes.data?.items ||
          photoRes.data?.attachments ||
          (Array.isArray(photoRes.data) ? photoRes.data : [])
        : [];
      const rawRows = [
        ...(Array.isArray(photoRows) ? photoRows : []),
        ...(Array.isArray(mergedReq._detailAttachments) ? mergedReq._detailAttachments : []),
      ].filter(
        (r) =>
          r &&
          (!r.procedure_step_id || ["AFTER_REPAIR", "DOCUMENT"].includes(String(r.evidence_type || "").toUpperCase())),
      );
      const seen = new Set();
      const dedupRows = [];
      rawRows.forEach((r) => {
        const key = r.attachment_id != null ? `id:${r.attachment_id}` : `uri:${r.image_url || r.file_url || r.url || r.uri || ""}`;
        if (!key || key === "uri:" || seen.has(key)) return;
        seen.add(key);
        dedupRows.push(r);
      });
      const ev = dedupRows.map(mapBackendPhotoToEvidence);
      mergedReq._evidence = ev;
      if (photoRes?.ok) mergedReq._evidenceFetched = true;
      const remapped = detRes?.ok || billRes?.ok
        ? mapBackendCustomerRequestToOrder(mergedReq, o.customerPhone || s.auth?.phone || "")
        : null;
      const mergedAtts = extractInitialAttachments(ev, remapped?.attachments || o.attachments);
      updateOrder(code, (cur) => {
        const keepBill = (billRes?.ok || detRes?.data?.bill || detRes?.data?.request?.bill)
          ? (remapped?.bill || cur.bill || null)
          : (cur.bill || null);
        const nextStatus = detRes?.ok && remapped?.status && !remapped?.statusUnknown
          ? remapped.status
          : cur.status;
        const resolvedInspFee = nextStatus === "cancelled"
          ? ((billRes?.ok && remapped?.inspectionFee != null)
              ? remapped.inspectionFee
              : (Number(cur.inspectionFee) || Number(remapped?.inspectionFee) || 0))
          : (remapped?.inspectionFee ?? cur.inspectionFee);
        const nextTotal =
          keepBill && nextStatus !== "quoted" && (["pending_payment", "done"].includes(nextStatus) || keepBill.quotationTotal != null || keepBill.supplementalTotal > 0)
            ? keepBill.amountDue
            : (detRes?.ok && remapped?.total != null ? remapped.total : cur.total);
        const nextPaid = isPaid({ bill: keepBill, report: remapped?.report || cur.report });
        const nextReport = (detRes?.ok && remapped?.report) || cur.report
          ? {
              ...(cur.report || {}),
              ...(detRes?.ok && remapped?.report ? remapped.report : {}),
              paid: nextPaid,
            }
          : null;
        return {
          order: {
            ...cur,
            ...(detRes?.ok && remapped?.backendStatus ? { backendStatus: remapped.backendStatus } : {}),
            ...(nextStatus ? { status: nextStatus } : {}),
            ...(keepBill ? { bill: keepBill } : {}),
            ...(nextTotal != null ? { total: nextTotal, finalTotal: nextTotal } : {}),
            ...(resolvedInspFee != null ? { inspectionFee: resolvedInspFee } : {}),
            ...(detRes?.ok && remapped?.items?.length ? { items: remapped.items } : {}),
            ...(detRes?.ok && remapped?.goods != null ? { goods: remapped.goods } : {}),
            ...(detRes?.ok && remapped?.productDiscount != null ? { productDiscount: remapped.productDiscount } : {}),
            ...(detRes?.ok && remapped?.comboDiscount != null ? { comboDiscount: remapped.comboDiscount } : {}),
            ...(detRes?.ok && remapped?.comboLabel ? { comboLabel: remapped.comboLabel } : {}),
            ...(detRes?.ok && remapped?.voucherDiscount != null ? { voucherDiscount: remapped.voucherDiscount } : {}),
            ...(detRes?.ok && remapped?.warrantyDays !== undefined ? { warrantyDays: remapped.warrantyDays } : {}),
            ...(detRes?.ok && remapped?.warrantyStartAt != null ? { warrantyStartAt: remapped.warrantyStartAt } : {}),
            ...(detRes?.ok && remapped?.warrantyEndAt != null ? { warrantyEndAt: remapped.warrantyEndAt } : {}),
            ...(detRes?.ok && remapped?.warrantyCertificateCode ? { warrantyCertificateCode: remapped.warrantyCertificateCode } : {}),
            ...(detRes?.ok && remapped?.rating ? { rating: remapped.rating } : {}),
            ...(detRes?.ok && remapped?.customerTier ? { customerTier: remapped.customerTier } : {}),
            ...(detRes?.ok && remapped?.customerTierLabel ? { customerTierLabel: remapped.customerTierLabel } : {}),
            ...(detRes?.ok && remapped?.outOfWarranty !== undefined ? { outOfWarranty: remapped.outOfWarranty } : {}),
            ...(detRes?.ok && remapped?.outOfWarrantyReason ? { outOfWarrantyReason: remapped.outOfWarrantyReason } : {}),
            ...(detRes?.ok && remapped?.followUpRequested !== undefined ? { followUpRequested: remapped.followUpRequested } : {}),
            ...(detRes?.ok && remapped?.followUpReason ? { followUpReason: remapped.followUpReason } : {}),
            ...(detRes?.ok && remapped?.kind ? { kind: remapped.kind } : {}),
            ...(detRes?.ok && remapped?.doneAt != null ? { doneAt: remapped.doneAt } : {}),
            ...(detRes?.ok && remapped?.materials ? { materials: remapped.materials } : {}),
            ...(detRes?.ok && remapped?.pendingExternalEstimates ? { pendingExternalEstimates: remapped.pendingExternalEstimates } : {}),
            ...(detRes?.ok && remapped?.finalizedExternalParts ? { finalizedExternalParts: remapped.finalizedExternalParts } : {}),
            ...(detRes?.ok && remapped?.externalPriceState ? { externalPriceState: remapped.externalPriceState } : {}),
            ...(detRes?.ok && remapped?.history?.length ? { history: remapped.history } : {}),
            ...(remapped?.tech?.code ? { tech: remapped.tech } : {}),
            ...(detRes?.ok && remapped?.quote ? { quote: remapped.quote } : {}),
            ...(detRes?.ok && remapped?.diagnosisReport ? { diagnosisReport: remapped.diagnosisReport } : {}),
            ...(nextReport ? { report: nextReport } : {}),
            ...(photoRes?.ok ? { evidence: ev, _evidenceFetched: true } : (ev.length ? { evidence: ev } : {})),
            ...(mergedAtts.length ? { attachments: mergedAtts } : {}),
            ...(detRes?.ok ? { _detailHydrated: true } : {}),
          },
        };
      });
      return true;
    },
    reconcilePartReceipts: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return 0;
      const n = await reconcileMissingPartReceipts(o.dbAssignmentId);
      if (n > 0) syncFromBackend(null, true);
      return n;
    },
    completeProcedureStep: async (
      code,
      step,
      {
        status = "DONE",
        checkedItems,
        measurements,
        photoUris = [],
        note,
      } = {},
    ) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get())
        return { ok: false, error: "Việc chưa đồng bộ với hệ thống." };
      const photoIds = [];
      for (const uri of photoUris) {
        const up = await hrmssApi.uploadJobPhoto(
          o.dbAssignmentId,
          uri,
          step.step_no === 1 ? "BEFORE_REPAIR" : "AFTER_REPAIR",
        );
        if (!up.ok)
          return {
            ok: false,
            error:
              up.code === "FILE_TOO_LARGE"
                ? "Ảnh quá lớn."
                : up.message || "Không tải được ảnh.",
          };
        photoIds.push(up.data?.attachment?.attachment_id);
      }
      const body = { status };
      if (Array.isArray(checkedItems) && checkedItems.length)
        body.checked_items = checkedItems;
      if (measurements && Object.keys(measurements).length)
        body.measurements = measurements;
      if (photoIds.length) body.photo_ids = photoIds;
      if (note) body.note = note;
      const res = await hrmssApi.updateProcedureStep(
        o.dbAssignmentId,
        step.step_id,
        body,
      );
      if (!res.ok) {
        const msg = {
          INVALID_VISIT_STATE:
            'Bấm "Đã đến nơi" trước khi làm các bước.',
          PHOTO_REQUIRED: "Bước này cần ít nhất 1 ảnh.",
          MEASUREMENTS_REQUIRED: "Nhập đủ các chỉ số đo của bước.",
          INVALID_PHOTO: "Ảnh không thuộc việc này. Chụp lại ảnh.",
          STEP_REQUIRED: "Bước bắt buộc, không bỏ qua được.",
          PROCEDURE_STEP_NOT_FOUND:
            "Không tìm thấy bước này. Làm mới lại việc.",
        }[res.code];
        return {
          ok: false,
          code: res.code,
          error: msg || res.message || "Không cập nhật được bước.",
        };
      }
      const proc = res.data?.job?.procedure;
      if (proc !== undefined)
        updateOrder(code, (ord) => ({ order: { ...ord, procedure: proc } }));
      return { ok: true };
    },
    loadServiceReviews,
    loadServiceDetail,
    // Giỏ hàng
    addToCart: (id, qty = 1, silent = false) => {
      const existing = s.cart.find((it) => it.id === id);
      if (existing && existing.qty >= 20) {
        if (!silent) ui.toast("Mỗi dịch vụ chọn tối đa 20 lần/đơn", "⚠️");
        return;
      }
      up((p) => {
        const i = p.cart.findIndex((it) => it.id === id);
        const cart =
          i >= 0
            ? p.cart.map((it, j) =>
                j === i ? { ...it, qty: Math.min(20, it.qty + qty) } : it,
              )
            : [...p.cart, { id, qty: Math.min(20, Math.max(1, qty)) }];
        return { cart };
      });
      if (!silent) ui.toast("Đã thêm vào giỏ hàng", "🛒");
    },
    setCartQty: (id, qty) =>
      up((p) => ({
        cart: p.cart.map((it) =>
          it.id === id ? { ...it, qty: Math.min(20, Math.max(1, qty)) } : it,
        ),
      })),
    removeFromCart: (id) =>
      up((p) => ({ cart: p.cart.filter((it) => it.id !== id) })),
    clearCart: () => up(() => ({ cart: [] })),

    // Địa chỉ + hồ sơ (Ghi trực tiếp vào bảng hrmss.service_address trên PostgreSQL)
    // Lưu địa chỉ: gửi backend TRƯỚC (POST/PATCH /customer/addresses). address_text = số nhà + đường; ward_code = phường/xã
    // Hà Nội (backend tự ghép "…, Phường X, Thành phố Hà Nội"). Trả { ok, id } hoặc { ok:false, error }.
    saveAddress: async (addr) => {
      if (!authTokens.get())
        return { ok: false, error: "Vui lòng đăng nhập để lưu địa chỉ." };
      const cleanPhone = String(addr.phone || s.user?.phone || "").replace(
        /\D/g,
        "",
      );
      const existing = addr.id
        ? s.addresses.find((x) => x.id === addr.id)
        : null;
      const chosenGender = addr.gender || existing?.gender || "Nam";
      const body = {
        address_text: String(addr.street || addr.full || "").trim(),
        ...(addr.wardCode ? { ward_code: Number(addr.wardCode) } : {}),
        contact_name: addr.name || s.user?.name || "",
        contact_phone: cleanPhone,
        is_default: Boolean(addr.isDefault),
      };
      const res = existing?.dbAddressId
        ? await hrmssApi.updateCustomerAddress(existing.dbAddressId, body)
        : await hrmssApi.createCustomerAddress(body);
      if (!res.ok) {
        const msg = {
          ADDRESS_OUTSIDE_SERVICE_AREA:
            "Hiện chỉ phục vụ tại Hà Nội. Chọn phường/xã Hà Nội.",
          WARD_NOT_IN_SERVICE_AREA: "Phường/xã không thuộc khu vực phục vụ.",
        }[res.code];
        return {
          ok: false,
          code: res.code,
          error: msg || (res.status > 0 ? res.message : networkError(res)),
        };
      }
      const mappedSaved = mapBackendAddressToApp(res.data?.address);
      if (!mappedSaved)
        return { ok: false, error: "Không đọc được địa chỉ vừa lưu." };
      const saved = { ...mappedSaved, gender: chosenGender };
      up((p) => {
        let list = existing
          ? p.addresses.map((x) => (x.id === existing.id ? saved : x))
          : [...p.addresses.filter((x) => x.id !== saved.id), saved];
        if (saved.isDefault)
          list = list.map((x) => ({ ...x, isDefault: x.id === saved.id }));
        const nextGenderMap = {
          ...(p.addressGenderMap || {}),
          [saved.id]: chosenGender,
          ...(saved.dbAddressId != null ? { [String(saved.dbAddressId)]: chosenGender } : {}),
        };
        return {
          addresses: list,
          addressGenderMap: nextGenderMap,
          selectedAddressId:
            saved.isDefault || !p.selectedAddressId
              ? saved.id
              : p.selectedAddressId,
          user: {
            ...p.user,
            name: p.user.name || saved.name,
            phone: p.user.phone || saved.phone,
          },
        };
      });
      ui.toast("Đã lưu địa chỉ", "📍");
      return { ok: true, id: saved.id };
    },
    // Xóa địa chỉ: backend trước, thành công mới bỏ khỏi danh sách.
    deleteAddress: async (id) => {
      const addr = s.addresses.find((x) => x.id === id);
      if (addr?.dbAddressId) {
        const res = await hrmssApi.deleteCustomerAddress(addr.dbAddressId);
        if (!res.ok) {
          ui.alert(
            "Không xóa được địa chỉ",
            res.status > 0 ? res.message : networkError(res),
            "📍",
          );
          return false;
        }
      }
      up((p) => {
        const list = p.addresses.filter((x) => x.id !== id);
        if (list.length && !list.some((x) => x.isDefault))
          list[0] = { ...list[0], isDefault: true };
        return {
          addresses: list,
          selectedAddressId:
            p.selectedAddressId === id
              ? list[0]?.id || null
              : p.selectedAddressId,
        };
      });
      return true;
    },
    selectAddress: (id) => up(() => ({ selectedAddressId: id })),
    // Hồ sơ khách: PATCH /auth/me/profile { full_name, phone } TRƯỚC; thành công mới cập nhật trên máy.
    // Email / ngày sinh backend chưa có trường sửa -> không đổi (email đổi qua tài khoản).
    updateUser: async (u) => {
      const body = {
        ...(u.name ? { full_name: String(u.name).trim() } : {}),
        ...(u.phone !== undefined
          ? { phone: u.phone ? String(u.phone) : null }
          : {}),
      };
      const committed = {};
      const commitLocal = () => {
        if (!Object.keys(committed).length) return;
        const curP = stateRef.current;
        const nextUser = { ...curP.user, ...committed };
        const nextAuth = curP.auth
          ? upsertBackendAccount({
              ...curP.auth,
              ...(committed.name !== undefined ? { name: committed.name } : {}),
              ...(committed.phone !== undefined ? { phone: committed.phone } : {}),
              ...(committed.dob !== undefined ? { dob: committed.dob } : {}),
            })
          : null;
        up(() => ({ user: nextUser, ...(nextAuth ? { auth: nextAuth } : {}) }));
      };
      const fail = (res) => {
        commitLocal();
        ui.alert(
          "Không lưu được",
          res.status > 0 ? res.message : networkError(res),
          "⚠️",
        );
        return false;
      };
      if (authTokens.get() && Object.keys(body).length) {
        const res = await hrmssApi.updateProfile(body);
        if (!res.ok) return fail(res);
        if (u.name) committed.name = body.full_name;
        if (u.phone !== undefined) committed.phone = u.phone;
      } else {
        if (u.name !== undefined) committed.name = u.name;
        if (u.phone !== undefined) committed.phone = u.phone;
      }
      if (authTokens.get() && u.dob !== undefined) {
        const isoDob = dobToIso(u.dob);
        if (String(u.dob || "").trim() && !isoDob) {
          commitLocal();
          ui.alert("Ngày sinh chưa hợp lệ", "Vui lòng nhập ngày sinh đúng định dạng ngày/tháng/năm.", "⚠️");
          return false;
        }
        const res = await hrmssApi.updateMyInfo({ dateOfBirth: isoDob });
        if (!res.ok) return fail(res);
        committed.dob = isoDob ? u.dob : "";
      } else if (u.dob !== undefined) {
        committed.dob = u.dob;
      }
      commitLocal();
      ui.toast("Đã cập nhật thông tin");
      return true;
    },

    // Đơn hàng (Ghi trực tiếp vào bảng hrmss.service_request, service_request_service, repair_visit)
    // Đặt lịch: POST /customer/requests TRƯỚC; mã đơn, giá, trạng thái lấy từ server. Lỗi thì báo, không tạo đơn trên máy.
    placeOrder: async (payload) => {
      if (s.auth?.role === "customer" && !s.auth.emailVerified) {
        ui.alert(
          "Chưa xác thực thư điện tử",
          `Vui lòng xác thực địa chỉ thư điện tử (${s.user?.email || s.auth?.email || ""}) bằng mã xác thực 6 chữ số trước khi đặt lịch dịch vụ.`,
          "📧",
        );
        return null;
      }
      if (!authTokens.get()) {
        ui.alert("Chưa đăng nhập", "Đăng nhập để đặt lịch.", "🔐");
        return null;
      }
      if (!address?.dbAddressId) {
        ui.alert(
          "Địa chỉ chưa lưu",
          "Địa chỉ này chưa lưu lên hệ thống. Mở Sổ địa chỉ, lưu lại rồi đặt lịch.",
          "📍",
        );
        return null;
      }
      const svc0 = getService(payload.items[0]?.id);
      const orderedItems = (payload.items || []).slice(0, 10);
      const items = orderedItems.map((it) => ({
        service_id: resolveDbServiceId(it.id),
        quantity: Math.min(20, Math.max(1, Number(it.qty) || 1)),
      }));
      const method =
        PAYMENT_METHODS.find(
          (m) => m.label === payload.payment || m.id === payload.payment,
        )?.apiMethod || "CASH";
      const res = await hrmssApi.createCustomerRequest({
        service_address_id: String(address.dbAddressId),
        preferred_time: buildPreferredTimeIso(payload.dateKey, payload.slot),
        problem_description: payload.note || svc0?.name || null,
        ...(payload.siteCondition?.id
          ? { site_condition: payload.siteCondition.id }
          : {}),
        preferred_payment_method: method,
        ...(payload.voucher?.code
          ? { voucher_code: payload.voucher.code }
          : {}),
        items,
      });
      if (!res.ok || !res.data?.request) {
        const msg = {
          VOUCHER_NOT_APPLICABLE: "Mã giảm giá không dùng được cho đơn này.",
          VOUCHER_EXPIRED: "Mã giảm giá đã hết hạn.",
          VOUCHER_NOT_AVAILABLE: "Mã giảm giá đã hết lượt dùng.",
          VOUCHER_NOT_FOUND: "Mã giảm giá không tồn tại.",
          ADDRESS_NOT_FOUND: "Địa chỉ không còn trong sổ địa chỉ.",
          INVALID_SERVICE:
            "Có dịch vụ đã ngừng phục vụ. Tải lại danh sách dịch vụ.",
          DUPLICATE_REQUEST: "Bạn đã có đơn trùng dịch vụ và khung giờ này.",
        }[res.code];
        ui.alert(
          "Chưa đặt được lịch",
          msg || (res.status > 0 ? res.message : networkError(res)),
          "⚠️",
        );
        return null;
      }
      const dbReq = res.data.request;
      const created = mapBackendCustomerRequestToOrder(
        dbReq,
        address?.phone || "",
      );
      // Ảnh khách đính kèm: POST /uploads (request_id). Đợi tải xong trước khi sync để đơn có ảnh ngay.
      const pics = (payload.attachments || [])
        .filter((x) => x?.uri)
        .slice(0, 5);
      if (pics.length) {
        const rs = await Promise.all(
          pics.map((x) =>
            hrmssApi
              .uploadRequestPhoto(dbReq.request_id, x.uri)
              .catch(() => null),
          ),
        );
        if (rs.some((r) => !r?.ok))
          ui.toast("Một số ảnh chưa tải lên được", "⚠️");
      }
      const createdWithPics =
        created && pics.length
          ? {
              ...created,
              attachments: pics,
              evidence: pics.map((x, idx) => ({
                id: x.id || `local-att-${idx}`,
                uri: x.uri,
                stage: "diagnosis",
                note: x.note || "",
                isCustomerInitial: true,
                at: x.at || Date.now(),
              })),
            }
          : created;
      up((p) => ({
        orders: createdWithPics
          ? [
              { ...createdWithPics, customerAccountId: s.auth?.id || null },
              ...p.orders.filter((x) => x.code !== createdWithPics.code),
            ]
          : p.orders,
        cart: payload.fromCart
          ? p.cart.filter((c) => !orderedItems.some((it) => it.id === c.id))
          : p.cart,
      }));
      syncFromBackend(null, true);
      return dbReq.request_code;
    },

    // ------------------------- PHÍA THỢ -------------------------
    // Nhận việc được giao (ghi trực tiếp vào bảng hrmss.technician_assignment & hrmss.service_request)
    // Nhận việc: với đơn ở chợ việc, gọi backend TRƯỚC (POST /technician/jobs/open-requests/:id/accept); chỉ khi
    // backend nhận mới đổi trạng thái trên máy. Đơn hệ thống/văn phòng đã gán (có dbAssignmentId) thì chỉ xác nhận trên máy.
    acceptJob: async (code) => {
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0 || o0.status !== "pending") {
        ui.alert(
          "Không nhận được",
          "Việc không còn ở trạng thái chờ nhận.",
          "ℹ️",
        );
        return false;
      }
      if (isOfferExpired(o0)) {
        setS((p) => ({
          ...p,
          orders: p.orders.filter((x) => x.code !== code),
        }));
        ui.alert(
          "Đơn đã quá hạn",
          "Đơn này đã quá hạn tiếp nhận và đã được gỡ khỏi danh sách.",
          "⏰",
        );
        return false;
      }
      // Việc hệ thống đã gán (có assignment) là của thợ rồi: không tự đổi trạng thái trên máy, chỉ tải lại từ server.
      if (o0.dbAssignmentId) {
        await syncFromBackend(null, true);
        ui.toast("Việc đã được giao cho bạn", "👍");
        return true;
      }
      let acceptedAssignmentId = null;
      {
        if (!authTokens.get() || !o0.dbRequestId) {
          ui.alert(
            "Không nhận được",
            "Việc này chưa đồng bộ với hệ thống. Kéo làm mới danh sách việc rồi thử lại.",
            "ℹ️",
          );
          return false;
        }
        const res = await hrmssApi.acceptTechnicianOpenRequest(o0.dbRequestId);
        if (!res.ok) {
          const msg = {
            TOO_MANY_ACTIVE_JOBS: `Bạn đang giữ tối đa ${TECH_POLICY.maxActiveJobs} việc. Hoàn thành hoặc trả việc trước khi nhận thêm.`,
            SPECIALTY_MISMATCH: "Việc này không thuộc chuyên môn của bạn.",
            NOT_ACCEPTING_JOBS:
              "Tài khoản đang tạm ngưng nhận việc. Liên hệ điều phối để mở lại.",
            REQUEST_NOT_AVAILABLE:
              "Việc đã có thợ khác nhận hoặc đã hết hạn. Việc đã được gỡ khỏi danh sách.",
            REQUEST_DECLINED:
              "Đơn này bạn đã từ chối hoặc trả trước đó nên không thể nhận lại.",
            TIME_CONFLICT:
              "Khung giờ của đơn này đang trùng với một việc bạn đang phụ trách.",
          }[res.code];
          if (res.code === "REQUEST_DECLINED") {
            up((p) => ({
              ...markDeclined(p, p.techProfile?.code || TECH_ME.code, code),
              orders: p.orders.filter((x) => x.code !== code),
            }));
          }
          ui.alert(
            "Không nhận được",
            msg || (res.status > 0 ? res.message : networkError(res)),
            "ℹ️",
          );
          syncFromBackend(null, true);
          return false;
        }
        acceptedAssignmentId = res.data?.job?.assignment_id || null;
      }
      up((p) => {
        const tech0 = p.techProfile || TECH_ME;
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status !== "pending") return {};
        const tech = { ...normalizeTechRep(tech0), ...tech0 };
        const now = Date.now();
        return {
          orders: p.orders.map((x) =>
            x.code === code
              ? withStatus(o, "confirmed", now, {
                  tech: { ...tech },
                  dispatchNote: null,
                  acceptedAt: now,
                  dbAssignmentId: acceptedAssignmentId || o.dbAssignmentId,
                })
              : x,
          ),
          ...clearDeclined(p, tech0.code, code),
        };
      });
      ui.toast("Đã nhận việc", "👍");
      resubscribeOrderRoom(o0.dbRequestId);
      await syncFromBackend(null, true);
      return true;
    },
    // Từ chối việc chưa nhận → không phạt uy tín (chỉ ẩn với đúng thợ này)
    // Từ chối việc chưa nhận (không phạt): việc ở chợ việc -> POST /open-requests/:id/decline;
    // việc hệ thống đã gán cho mình -> trả việc (POST /technician/jobs/:id/release) để backend gán thợ khác.
    declineJob: async (code, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== "pending") return false;
      if (!authTokens.get() || !o.dbRequestId) return notSynced();
      const why = String(reason || "Thợ bỏ qua việc").slice(0, 500);
      const res = o.dbAssignmentId
        ? await hrmssApi.releaseTechnicianJob(
            o.dbAssignmentId,
            why.length >= 3 ? why : "Thợ từ chối việc",
          )
        : await hrmssApi.declineTechnicianOpenRequest(o.dbRequestId, why);
      if (!res.ok) return serverDone(res, { title: "Không từ chối được" });
      up((p) => ({
        ...markDeclined(p, p.techProfile?.code || TECH_ME.code, code),
        orders: p.orders.filter((x) => x.code !== code),
      }));
      return serverDone(res, { toast: "Đã chuyển việc cho điều phối" });
    },
    // Trả việc sau khi đã nhận — phạt uy tín theo mức (cửa sổ 15 phút / sát giờ / đang đến / đang sửa)
    // Trả việc: POST /technician/jobs/:id/release { reason } TRƯỚC. Backend ghi mức trả việc, tự phát voucher xin lỗi cho
    // khách (nếu đã đi / sát giờ) và tự gán thợ khác. Thành công mới bỏ việc khỏi danh sách của thợ.
    releaseJob: async (code, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (
        !o ||
        ![
          "confirmed",
          "onway",
          "diagnosing",
          "quoted",
          "repairing",
          "out_of_warranty",
        ].includes(o.status)
      ) {
        ui.alert(
          "Không trả việc được",
          "Chỉ trả được việc đang phụ trách (chưa hoàn thành).",
          "ℹ️",
        );
        return { ok: false };
      }
      if (!authTokens.get() || !o.dbAssignmentId) {
        ui.alert(
          "Không trả việc được",
          "Việc này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.",
          "ℹ️",
        );
        return { ok: false };
      }
      const res = await hrmssApi.releaseTechnicianJob(
        o.dbAssignmentId,
        String(reason || "").trim() || "Thợ trả việc",
      );
      if (!res.ok) {
        ui.alert(
          "Không trả việc được",
          res.status > 0 ? res.message : networkError(res),
          "ℹ️",
        );
        return { ok: false };
      }
      up((p) => ({ orders: p.orders.filter((x) => x.code !== code) }));
      setStack((st) => st.filter((x) => x.params?.code !== code));
      const rel = res.data?.release || {};
      ui.toast(
        rel.reassigned
          ? "Đã trả việc · Hệ thống đã gán thợ khác"
          : "Đã trả việc cho điều phối",
        "↩️",
      );
      syncFromBackend(null, true);
      return { ok: true, release: rel };
    },
    // Nhắc khách duyệt báo giá đang chờ
    // Nhắc khách duyệt báo giá: POST /technician/jobs/:id/remind-quote (server chống gửi dồn 10 phút).
    remindQuote: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.remindQuotation(o.dbAssignmentId);
      return serverDone(res, {
        title: "Không gửi được",
        codes: {
          NO_PENDING_QUOTATION:
            "Chỉ nhắc được khi đơn đang chờ khách duyệt báo giá.",
          REMIND_TOO_SOON:
            "Bạn vừa nhắc khách. Vui lòng đợi ít phút rồi nhắc lại.",
        },
        toast: "Đã gửi nhắc cho khách",
        icon: "📨",
      });
    },
    // Hồ sơ thợ: tên/SĐT -> PATCH /auth/me/profile; khu vực -> PATCH /technician/profile. Gọi server TRƯỚC.
    // Chuyên môn do admin gán: bỏ qua nếu màn hình nào đó vẫn gửi lên.
    updateTechProfile: async (input) => {
      const {
        skills: _ignoredSkills,
        specialties: _ignoredSpecs,
        specialtyCategoryIds: _ignoredIds,
        ...patch
      } = input || {};
      if (!authTokens.get()) return notSynced("Hồ sơ");
      const committed = {};
      const commitLocal = () => {
        if (!Object.keys(committed).length) return;
        const curP = stateRef.current;
        const base = curP.techProfile || TECH_ME;
        const nextAuth = curP.auth
          ? upsertBackendAccount({
              ...curP.auth,
              ...(committed.name !== undefined ? { name: committed.name } : {}),
              ...(committed.phone !== undefined ? { phone: committed.phone } : {}),
              ...(committed.dob !== undefined ? { dob: committed.dob } : {}),
            })
          : curP.auth;
        up((p) => ({
          ...(nextAuth ? { auth: nextAuth } : {}),
          techProfile: {
            ...base,
            ...committed,
            ...normalizeTechRep({ ...base, ...committed }),
          },
          user: {
            ...p.user,
            name: committed.name !== undefined ? committed.name : p.user.name,
            phone: committed.phone !== undefined ? committed.phone : p.user.phone,
            dob: committed.dob !== undefined ? committed.dob : p.user.dob,
          },
        }));
      };
      const fail = (res) => {
        commitLocal();
        ui.alert(
          "Không lưu được hồ sơ",
          res.status > 0 ? res.message : networkError(res),
          "⚠️",
        );
        return false;
      };
      if (patch.name || patch.phone !== undefined) {
        const res = await hrmssApi.updateProfile({
          ...(patch.name ? { full_name: patch.name } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
        });
        if (!res.ok) return fail(res);
        if (patch.name) committed.name = patch.name;
        if (patch.phone !== undefined) committed.phone = patch.phone;
      }
      if (patch.area !== undefined) {
        const res = await hrmssApi.updateTechnicianWorkArea(patch.area || null);
        if (!res.ok) return fail(res);
        committed.area = patch.area;
      }
      if (patch.dob !== undefined) {
        const isoDob = dobToIso(patch.dob);
        if (String(patch.dob || "").trim() && !isoDob) {
          commitLocal();
          ui.alert("Ngày sinh chưa hợp lệ", "Vui lòng nhập ngày sinh đúng định dạng ngày/tháng/năm.", "⚠️");
          return false;
        }
        const res = await hrmssApi.updateMyInfo({ dateOfBirth: isoDob });
        if (!res.ok) return fail(res);
        committed.dob = isoDob ? patch.dob : "";
      }
      commitLocal();
      ui.toast("Đã cập nhật hồ sơ thợ");
      return true;
    },
    // Xuất phát: PATCH /technician/jobs/:id/travel (backend báo khách "thợ đang đến"), rồi gửi vị trí GPS thật nếu có.
    startTravel: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== "confirmed") {
        ui.alert(
          "Không cập nhật được",
          "Chỉ bấm “Đang đến” khi đã nhận việc.",
          "ℹ️",
        );
        return false;
      }
      if (
        o.quote &&
        !o.quote.approved &&
        (o.quote.status === "SENT" || o.quote.revisionRequested)
      ) {
        ui.alert(
          o.quote.revisionRequested
            ? "Khách yêu cầu báo giá lại"
            : "Chờ khách đồng ý",
          o.quote.revisionRequested
            ? "Gửi báo giá mới cho khách. Khách đồng ý thì mới xuất phát."
            : "Khách hàng chưa đồng ý báo giá trên ứng dụng. Thợ chỉ xuất phát sau khi khách đồng ý.",
          "⏳",
        );
        return false;
      }
      if (!authTokens.get() || !o.dbAssignmentId) {
        ui.alert(
          "Không cập nhật được",
          "Việc này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.",
          "ℹ️",
        );
        return false;
      }
      const res = await hrmssApi.travelTechnicianJob(o.dbAssignmentId);
      if (!res.ok) {
        ui.alert(
          "Không cập nhật được",
          QUOTE_BLOCK_MESSAGES[res.code] ||
            (res.status > 0 ? res.message : networkError(res)),
          "⚠️",
        );
        syncFromBackend(null, true);
        return false;
      }
      const now = Date.now();
      updateOrder(code, (ord) => ({
        order: withStatus(ord, "onway", now, {
          travelStartedAt: now,
          tracking: { updatedAt: now, label: "Thợ vừa xuất phát" },
        }),
      }));
      getCheckInLocation().then((loc) => {
        if (loc)
          hrmssApi
            .updateTechnicianLocation({
              latitude: loc.lat,
              longitude: loc.lng,
              location_accuracy: loc.accuracy,
              location_sharing_enabled: true,
            })
            .catch(() => {});
      });
      ui.toast("Đã báo khách: đang di chuyển", "🛵");
      await syncFromBackend(null, true);
      return true;
    },
    // Đang đến: thợ gửi vị trí GPS thật lên server; khách đọc vị trí thật từ GET /customer/requests/:id/tracking.
    tickTracking: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== "onway" || !authTokens.get()) return;
      if (s.auth?.role === "tech") {
        const loc = await getCheckInLocation();
        if (loc) {
          // Server phát technician:location cho khách ngay khi nhận vị trí này (không gửi qua socket).
          hrmssApi
            .updateTechnicianLocation({
              latitude: loc.lat,
              longitude: loc.lng,
              location_accuracy: loc.accuracy,
              location_sharing_enabled: true,
            })
            .catch(() => {});
          updateOrder(code, (ord) => ({
            order: {
              ...ord,
              tracking: {
                ...(ord.tracking || {}),
                lat: loc.lat,
                lng: loc.lng,
                accuracy: loc.accuracy,
                updatedAt: Date.now(),
                label: "Đang chia sẻ vị trí với khách",
              },
            },
          }));
        }
        return;
      }
      if (!o.dbRequestId) return;
      const res = await hrmssApi.getRequestTracking(o.dbRequestId);
      if (!res.ok) return;
      const loc = res.data?.location;
      updateOrder(code, (ord) => ({
        order: {
          ...ord,
          tracking: loc
            ? {
                lat: loc.latitude,
                lng: loc.longitude,
                accuracy: loc.accuracy,
                updatedAt: loc.recorded_at
                  ? new Date(loc.recorded_at).getTime()
                  : Date.now(),
                label: "Vị trí thợ trên đường tới",
              }
            : {
                ...(ord.tracking || {}),
                label: "Thợ đang di chuyển (chưa có vị trí mới)",
              },
        },
      }));
      if (res.data?.journey?.arrived_at) syncFromBackend(null, true);
    },
    // Check-in: PATCH /technician/jobs/:id/arrive với GPS. Không giả tọa độ địa chỉ khách khi quá xa.
    arrive: async (code, checkIn = null) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== "onway") {
        ui.alert(
          "Không thể xác nhận đến nơi",
          "Chỉ xác nhận đến nơi khi đang ở trạng thái “Đang đến”.",
          "ℹ️",
        );
        return false;
      }
      if (!checkIn || checkIn.lat == null || checkIn.lng == null) {
        ui.alert(
          "Không thể lấy vị trí định vị",
          "Bật định vị và thử lại khi đã đến gần nhà khách.",
          "📍",
        );
        return false;
      }
      const effectiveCheckIn = {
        lat: Number(checkIn.lat),
        lng: Number(checkIn.lng),
        accuracy: checkIn.accuracy != null ? Number(checkIn.accuracy) : 15,
        label: checkIn.label || "Đã xác thực vị trí tại điểm hẹn",
        at: checkIn.at || Date.now(),
      };
      if (!authTokens.get() || !o.dbAssignmentId) {
        ui.alert(
          "Không thể xác nhận đến nơi",
          "Việc này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.",
          "ℹ️",
        );
        return false;
      }
      const res = await hrmssApi.arriveTechnicianJob(o.dbAssignmentId, {
        latitude: effectiveCheckIn.lat,
        longitude: effectiveCheckIn.lng,
        location_accuracy: effectiveCheckIn.accuracy,
      });
      if (!res.ok) {
        const msg = {
          TOO_FAR_FROM_CUSTOMER:
            res.message ||
            "Bạn đang ở quá xa địa chỉ khách. Đến đúng địa chỉ rồi xác nhận đến nơi lại.",
          TRAVEL_NOT_STARTED: "Bấm “Bắt đầu di chuyển” trước khi xác nhận đến nơi.",
          ALREADY_ARRIVED: "Việc này đã xác nhận đến nơi rồi.",
          ...QUOTE_BLOCK_MESSAGES,
        }[res.code];
        ui.alert(
          "Không thể xác nhận đến nơi",
          msg || (res.status > 0 ? res.message : networkError(res)),
          "📍",
        );
        syncFromBackend(null, true);
        return false;
      }
      const lateness = res.data?.lateness || {};
      const now = Date.now();
      const checkInPayload = {
        lat: effectiveCheckIn.lat,
        lng: effectiveCheckIn.lng,
        accuracy: effectiveCheckIn.accuracy,
        label: effectiveCheckIn.label,
        at: now,
      };
      updateOrder(code, (ord) => ({
        order: withStatus(ord, "diagnosing", now, {
          arrivedAt: now,
          checkIn: checkInPayload,
          lateCompensation:
            lateness.tier && lateness.tier !== "ok"
              ? {
                  minutesLate: lateness.minutes_late,
                  tier: lateness.tier,
                  voucherIssued: Boolean(lateness.compensation_voucher_issued),
                  at: now,
                }
              : null,
          tracking: {
            ...(ord.tracking || {}),
            updatedAt: now,
            label: "Đã xác nhận đến nơi tại nhà khách",
            lat: effectiveCheckIn.lat,
            lng: effectiveCheckIn.lng,
          },
        }),
      }));
      syncFromBackend(null, true);
      if (lateness.tier && lateness.tier !== "ok") {
        ui.alert(
          `Đến nơi muộn ${lateness.minutes_late} phút`,
          lateness.compensation_voucher_issued
            ? "Hệ thống đã phát mã giảm giá bồi thường cho khách theo chính sách đúng giờ."
            : "Lần sau vui lòng đến đúng khung giờ hẹn.",
          "⏰",
        );
      } else ui.toast("Đã xác nhận vị trí tại nhà khách", "📍");
      return true;
    },
    // Khách đổi hình thức thanh toán qua lại: CASH ↔ BANK_TRANSFER (VietQR).
    // PATCH /customer/requests/:id/payment-method { method }.
    // Nếu BE chặn (GD VietQR đang chờ / validate) → bỏ qua lỗi, áp dụng trên app cả 2 chiều.
    switchPaymentMethod: async (code, method) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || !authTokens.get()) return notSynced("Đơn này");
      if (isPaid(o)) {
        ui.alert("Không đổi được", "Đơn đã thanh toán đủ, không thể đổi hình thức.", "💳");
        return false;
      }
      const raw = String(method || "").toUpperCase();
      const toQr = raw === "BANK_TRANSFER" || raw === "VIETQR" || raw === "QR";
      const apiMethod = toQr ? "BANK_TRANSFER" : "CASH";
      const toastOk = toQr
        ? "Đã chuyển sang VietQR · Thợ không thu tiền mặt"
        : "Đã chuyển sang tiền mặt · Có thể trả trực tiếp cho thợ";
      const iconOk = toQr ? "🏦" : "💵";
      const applyLocal = (opts = {}) => {
        updateOrder(code, (x) => {
          const nextBill = x.bill
            ? {
                ...x.bill,
                cashClaimPending: false,
                paymentMethod: toQr ? "vietqr" : "cash",
                cashToCollect: toQr ? 0 : Math.max(0, Number(x.bill.remainingAmount ?? x.bill.amountDue ?? 0)),
              }
            : x.bill;
          return {
            order: {
              ...x,
              payment: toQr ? "Chuyển khoản VietQR" : "Tiền mặt tại nhà",
              paymentMethod: toQr ? "vietqr" : "cash",
              qrPaymentRequested: toQr,
              cashClaimLocked: false,
              cashToCollect: toQr ? 0 : Math.max(0, Number(nextBill?.remainingAmount ?? nextBill?.amountDue ?? orderTotal(x))),
              bill: nextBill,
              // Giữ lựa chọn local khi sync nếu BE chưa nhận method mới.
              paymentMethodLocked: Boolean(opts.lock),
            },
          };
        });
      };
      const res = await hrmssApi.setPaymentMethod(o.dbRequestId, apiMethod);
      // Chỉ đổi trên máy khi SERVER đồng ý. Trước đây lỗi VALIDATION_ERROR/CONFLICT/ERROR... vẫn đổi local
      // + khoá qua sync → khách và thợ hiểu khác nhau về hình thức thanh toán (dẫn tới thu tiền mặt sai).
      if (res.ok) applyLocal({ lock: false });
      return serverDone(res, {
        title: "Không đổi được",
        codes: {
          ALREADY_PAID: "Đơn đã được thanh toán.",
          REQUEST_CLOSED: "Đơn đã huỷ.",
          INVALID_REQUEST_STATE: "Đơn chưa ở trạng thái cho phép đổi hình thức thanh toán.",
          PAYMENT_IN_PROGRESS:
            "Đang có một giao dịch thanh toán chờ xử lý. Vui lòng đợi giao dịch kết thúc rồi thử lại.",
          CONFLICT: "Trạng thái thanh toán vừa thay đổi. Vui lòng tải lại đơn rồi thử lại.",
        },
        toast: toastOk,
        icon: iconOk,
      });
    },
      // Mở lại form báo giá để sửa / thêm phát sinh: chỉ là chế độ màn hình trên máy (không đổi dữ liệu server).
    //  - 'webhook': VietQRPay đã thấy hóa đơn PAID trên server (SePay báo) -> chỉ tải lại dữ liệu thật.
    //  - 'manual': khách xác nhận đã trả TIỀN MẶT -> POST /customer/requests/:id/payments/confirm { method: CASH }.
    //    Nếu BE còn GD VietQR chờ (PAYMENT_IN_PROGRESS) → bỏ qua, đánh dấu đã báo trả tiền mặt trên app.
    confirmPayment: async (code, mode = "manual") => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || !authTokens.get()) return notSynced("Đơn này");
      finishedOrderCache.current.delete(String(o.dbRequestId));
      if (mode === "webhook" || isQRPayment(o)) {
        if (mode === "webhook")
          ui.toast("Đã nhận thanh toán chuyển khoản", "✅");
        else
          ui.alert(
            "Chờ ngân hàng xác nhận",
            "Chuyển khoản được hệ thống tự xác nhận khi tiền về. Vui lòng đợi ít phút.",
            "🏦",
          );
        await syncFromBackend(null, true);
        return mode === "webhook";
      }
      const applyCashClaimLocal = () => {
        const nowClaim = Date.now();
        updateOrder(code, (x) => ({
          order: {
            ...x,
            payment: "Tiền mặt tại nhà",
            paymentMethod: "cash",
            qrPaymentRequested: false,
            paymentMethodLocked: true,
            cashClaimLocked: true,
            cashClaimAt: nowClaim,
            bill: {
              ...(x.bill || {}),
              cashClaimPending: true,
              paymentMethod: "cash",
              amountDue: x.bill?.amountDue ?? orderTotal(x),
              remainingAmount: x.bill?.remainingAmount ?? orderTotal(x),
            },
          },
        }));
      };
      const res = await hrmssApi.confirmCashPayment(o.dbRequestId);
      // Chỉ ghi nhận "đã báo trả tiền mặt" khi server đã nhận. Lỗi thì báo rõ, không giả thành công.
      if (res.ok) {
        applyCashClaimLocal();
      }
      return serverDone(res, {
        title: "Không xác nhận được",
        codes: {
          PAYMENT_IN_PROGRESS:
            "Đang có giao dịch VietQR chờ xử lý. Vui lòng hoàn tất chuyển khoản, hoặc đổi sang tiền mặt rồi thử lại.",
          BANK_TRANSFER_AUTO_CONFIRMED:
            "Đơn thanh toán bằng chuyển khoản — hệ thống tự xác nhận khi tiền về, không cần báo trả tiền mặt.",
          CONFLICT: "Trạng thái thanh toán vừa thay đổi. Vui lòng tải lại đơn rồi thử lại.",
          NOT_PAYABLE_YET: "Đơn chưa đến bước thanh toán.",
          NOTHING_TO_PAY: "Đơn không còn khoản nào phải trả.",
          ALREADY_PAID: "Đơn đã được thanh toán.",
        },
        toast: "Đã báo đã trả tiền mặt · chờ thợ xác nhận",
        icon: "✅",
      });
    },
    // Mở lại form báo giá để sửa / thêm phát sinh: chỉ là chế độ màn hình trên máy (không đổi dữ liệu server).
    // Đồng bộ giữ chế độ này tới khi thợ gửi báo giá mới (POST /technician/jobs/:id/quotation qua submitQuote).
    reopenQuote: (code) => {
      const now = Date.now();
      // Tính điều kiện từ state hiện tại TRƯỚC khi cập nhật (updater của setState chạy trễ).
      const cur = s.orders.find((x) => x.code === code);
      const ok = Boolean(
        cur && (cur.status === "repairing" || cur.quote?.revisionRequested),
      );
      if (!ok) {
        if (cur?.status === "quoted") {
          ui.alert(
            "Báo giá đang chờ khách duyệt",
            "Chưa sửa được báo giá khi khách chưa phản hồi. Nhắc khách duyệt hoặc chờ khách yêu cầu báo giá lại rồi mới điều chỉnh.",
            "ℹ️",
          );
        } else {
          ui.alert(
            "Chưa mở lại được báo giá",
            "Chỉ điều chỉnh báo giá khi đang sửa chữa hoặc khi khách yêu cầu báo giá lại.",
            "ℹ️",
          );
        }
        return;
      }
      updateOrder(code, (o) => {
        const isOnSite = Boolean(
          o.arrivedAt ||
          o.checkIn ||
          o.status === "out_of_warranty" ||
          o.status === "repairing",
        );
        return {
          order: withStatus(o, isOnSite ? "diagnosing" : "confirmed", now, {
            quote: o.quote ? { ...o.quote, revisionRequested: true } : null,
            quoteEditing: true,
            quoteEditingFrom: o.quote?.dbQuotationId || null,
            quoteEditingFromApproved: Boolean(o.quote?.approved),
          }),
        };
      });
      ui.toast("Mở lại báo giá để điều chỉnh phát sinh", "✏️");
    },
    cancelReopenQuote: async (code) => {
      updateOrder(code, (o) => ({
        order: {
          ...o,
          quoteEditing: false,
          quoteEditingFrom: null,
          quoteEditingFromApproved: undefined,
        },
      }));
      await syncFromBackend(null, true);
    },
    // Lập chẩn đoán / báo giá:
    //  - Trước khi xuất phát (confirmed): gửi báo giá trên app, khách đồng ý thì thợ mới đi. Khách huỷ -> 0đ.
    //  - Sau khi kiểm tra tại nhà (diagnosing): gửi báo giá hiện trường. Khách huỷ -> mất phí kiểm tra 100k.
    // Lập chẩn đoán / báo giá: gửi server TRƯỚC (đang ở nhà khách: start + diagnosis rồi quotation).
    // Trạng thái, tổng tiền, thông báo cho khách đều do server tạo; app tải lại sau khi gửi.
    submitQuote: async (
      code,
      { diagnosis, symptoms, recommendation, lines },
    ) => {
      const o = s.orders.find((x) => x.code === code);
      if (
        !o ||
        !["diagnosing", "confirmed", "quoted", "repairing", "out_of_warranty"].includes(o.status)
      ) {
        ui.alert(
          "Không gửi được",
          "Chỉ gửi báo giá khi đã nhận việc hoặc đang kiểm tra thiết bị.",
          "ℹ️",
        );
        return false;
      }
      if (!authTokens.get() || !o.dbAssignmentId) return notSynced();
      if (!Array.isArray(lines) || !lines.length) {
        ui.alert(
          "Thiếu hạng mục",
          "Thêm ít nhất 1 hạng mục vào báo giá.",
          "🧾",
        );
        return false;
      }
      const aid = o.dbAssignmentId;
      // Đồng bộ hậu tố (Thay thế)/(Sửa chữa) lên ghi chú ảnh [Triệu chứng] trước khi lưu chẩn đoán / báo giá
      // để kể cả báo giá trước khi xuất phát (không gọi /diagnosis) vẫn giữ đủ dữ liệu collapsible cho khách.
      const symptomTokens = splitSymptomTokens(symptoms);
      const actionByTitle = new Map();
      symptomTokens.forEach((tok) => {
        const m = /^(.+?)\s*\((Thay thế|Sửa chữa)\)\s*$/i.exec(tok);
        if (m) {
          actionByTitle.set(m[1].trim().toLowerCase(), {
            title: m[1].trim(),
            action: /^thay/i.test(m[2]) ? "replace" : "repair",
          });
        }
      });
      if (actionByTitle.size > 0 && Array.isArray(o.evidence)) {
        const noteSyncs = [];
        for (const ev of o.evidence) {
          if (ev?.stage !== "diagnosis" || !ev.dbAttachmentId) continue;
          const meta = parseSymptomPhotoMeta(ev.note);
          if (!meta?.title) continue;
          const target = actionByTitle.get(meta.title.toLowerCase());
          if (!target) continue;
          const desiredNote = formatSymptomPhotoNote(target.title, target.action);
          if (desiredNote && ev.note !== desiredNote) {
            noteSyncs.push(
              hrmssApi.updatePhotoNote(ev.dbAttachmentId, desiredNote).catch(() => null),
            );
          }
        }
        if (noteSyncs.length) await Promise.all(noteSyncs);
      }

      const isPre =
        o.status === "confirmed" ||
        (o.status === "diagnosing" &&
          !o.arrivedAt &&
          !o.checkIn &&
          Boolean(o.quote?.revisionRequested) &&
          !(o.quote?.quotationType === "SUPPLEMENTAL" || o.quote?.isSupplemental === true));
      const isSupplemental = Boolean(
        o.quote &&
          (o.quote.approved ||
            o.status === "repairing" ||
            o.quote.quotationType === "SUPPLEMENTAL"),
      );
      const hasExtra = lines.some((l) => !l.isOriginal);
      if (o.kind === "warranty" && hasExtra) {
        ui.alert(
          "Đơn bảo hành miễn phí (0đ)",
          "Nếu thiết bị hư hỏng ngoài phạm vi bảo hành và cần báo giá có phí, hãy bấm «Từ chối bảo hành → Báo giá có phí» trước.",
          "🛡️",
        );
        return false;
      }
      // Tại nhà khách: nếu không có phát sinh thêm, chuyển sang xác nhận chẩn đoán và bắt đầu làm (không gửi báo giá trùng)
      if (!isPre && !hasExtra) {
        return a.startRepairWithoutQuote(code, {
          diagnosis,
          symptoms,
          recommendation,
        });
      }
      const hasDiagPayload = Boolean(
        String(symptoms || "").trim() ||
          String(diagnosis || "").trim() ||
          String(recommendation || "").trim(),
      );
      if (!isPre && hasDiagPayload && (!isSupplemental || o.arrivedAt || o.checkIn)) {
        const dRes = await saveDiagnosisOnce(o, {
          diagnosis,
          symptoms,
          recommendation,
          needsQuotation: true,
        });
        if (!isSupplemental && dRes && !dRes.ok)
          return serverDone(dRes, {
            title: "Không lưu được chẩn đoán",
            codes: {
              CHECK_IN_REQUIRED:
                'Bạn chưa xác nhận đến nơi tại nhà khách. Hãy bấm "Đã đến nơi" trước khi chẩn đoán.',
            },
          });
      }
      const rawSendLines =
        !isPre || isSupplemental ? lines.filter((l) => !l.isOriginal) : lines;
      const sendLines = rawSendLines.map((l) => {
        // Chỉ vật tư tự nhập (mua ngoài) mới được tự gắn khoảng giá dự kiến.
        if (
          !l.isEstimatedRange &&
          l.isCustom &&
          Number(l.minPrice) > 0 &&
          Number(l.maxPrice) > Number(l.minPrice)
        ) {
          return { ...l, isEstimatedRange: true };
        }
        return l;
      });
      for (const l of sendLines) {
        if (!l.isOriginal && !l.isEstimatedRange && !(Number(l.price) > 0)) {
          ui.alert(
            "Thiếu đơn giá",
            `Vui lòng nhập đơn giá lớn hơn 0đ cho hạng mục "${l.name || "Vật tư / phát sinh"}" trước khi gửi báo giá.`,
            "⚠️",
          );
          return false;
        }
      }
      const buildQuoteItemPayload = (l) => {
        if (l.isCustom && l.isEstimatedRange) {
          return {
            item_type: "SERVICE",
            description_snapshot: formatEstimatedExternalDesc({
              name: l.name,
              minPrice: l.minPrice,
              maxPrice: l.maxPrice,
            }),
            quantity: Math.max(1, Number(l.qty) || 1),
            unit_price: 0,
          };
        }
        return l.type === "part"
          ? {
              item_type: "MATERIAL",
              ...(l.isCustom
                ? { external_purchase: true }
                : { material_id: resolveDbMaterialId(l.matId, l.name) }),
              description_snapshot: l.name || "Linh kiện vật tư",
              quantity: Math.max(1, Number(l.qty) || 1),
              unit_price: Math.max(0, Number(l.price) || 0),
            }
          : {
              item_type: "SERVICE",
              description_snapshot: l.name || "Dịch vụ sửa chữa & bảo dưỡng",
              quantity: Math.max(1, Number(l.qty) || 1),
              unit_price: Math.max(0, Number(l.price) || 0),
            };
      };
      const items = sendLines.map(buildQuoteItemPayload);
      const hasEstimatedLines = sendLines.some(
        (l) => l.isCustom && l.isEstimatedRange,
      );
      // Không gửi quotation_type: server tự xác định (trước khi xuất phát INITIAL, sau check-in SUPPLEMENTAL).
      let qRes = await hrmssApi.submitQuotation(aid, { items });
      // Dự phòng nếu backend từ chối unit_price = 0 ở bước dự kiến: gửi kèm đơn giá min ban đầu (sau đó Bước 2 trừ phần đã tạm tính).
      // Chỉ thử lại khi lỗi thật sự là lỗi kiểm tra dữ liệu liên quan đơn giá (không retry với QUOTATION_PENDING, JOB_NOT_ACTIVE...).
      const isZeroPriceRejection = (res) => {
        if (!res || res.ok) return false;
        if (![400, 422].includes(Number(res.status))) return false;
        if (!["VALIDATION_ERROR", "BAD_REQUEST"].includes(res.code)) return false;
        const errs = Array.isArray(res.errors) ? res.errors : [];
        const errText = errs
          .map((e) =>
            typeof e === "string"
              ? e
              : [e?.field, e?.path, e?.param, e?.message, e?.msg]
                  .filter(Boolean)
                  .join(" "),
          )
          .join(" ");
        const text = `${errText} ${res.message || ""}`.toLowerCase();
        // Không có chi tiết lỗi để xác định -> vẫn cho retry (đã giới hạn ở VALIDATION_ERROR/BAD_REQUEST).
        if (!errText.trim()) return true;
        return /unit_price|price|đơn giá/.test(text);
      };
      if (hasEstimatedLines && isZeroPriceRejection(qRes)) {
        const firstRes = qRes;
        const fallbackItems = sendLines.map((l) =>
          l.isCustom && l.isEstimatedRange
            ? {
                item_type: "SERVICE",
                description_snapshot: formatEstimatedExternalDesc({
                  name: l.name,
                  minPrice: l.minPrice,
                  maxPrice: l.maxPrice,
                }),
                quantity: Math.max(1, Number(l.qty) || 1),
                unit_price: Math.max(1, Number(l.minPrice) || 0),
              }
            : buildQuoteItemPayload(l),
        );
        const retryRes = await hrmssApi.submitQuotation(aid, {
          items: fallbackItems,
        });
        // Lần thử lại cũng lỗi -> báo lỗi gốc (lần 1) để thợ thấy nguyên nhân thật.
        qRes = retryRes?.ok ? retryRes : firstRes;
      }
      return serverDone(qRes, {
        title: "Không gửi được báo giá",
        codes: {
          QUOTATION_PENDING:
            "Đang có báo giá chờ khách duyệt. Nhắc khách duyệt hoặc chờ khách yêu cầu báo giá lại.",
          QUOTATION_DUPLICATES_BOOKED_SERVICE:
            "Báo giá phát sinh chỉ ghi phần làm thêm, không ghi lại dịch vụ khách đã đặt.",
          QUOTATION_ALREADY_APPROVED:
            "Khách đã đồng ý báo giá. Hãy xuất phát đến nhà khách.",
          INVALID_VISIT_STATE: "Việc chưa ở bước báo giá.",
          JOB_NOT_ACTIVE:
            "Việc không còn được giao cho bạn (đã hết hạn hoặc đã chuyển cho thợ khác). Việc đã được gỡ khỏi danh sách.",
        },
        toast: "Đã gửi báo giá cho khách",
        icon: "🧾",
      });
    },
    // Bước 2: Khi kết thúc sửa chữa, thợ nhập lại giá thực tế vật tư mua ngoài + ảnh biên lai để khách nghiệm thu.
    submitExternalPartsActualPrice: async (code, { parts, summary } = {}) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      if (!Array.isArray(parts) || !parts.length) {
        ui.alert(
          "Thiếu vật tư",
          "Không có vật tư mua ngoài nào cần chốt giá.",
          "ℹ️",
        );
        return false;
      }

      for (const p of parts) {
        const name = String(p.name || "").trim();
        if (!name) {
          ui.alert(
            "Thiếu tên vật tư",
            "Vui lòng nhập tên vật tư phát sinh trước khi gửi hoá đơn.",
            "⚠️",
          );
          return false;
        }
        const actualPrice = Math.round(Number(p.actualPrice) || 0);
        if (actualPrice <= 0) {
          ui.alert(
            "Giá không hợp lệ",
            `Vui lòng nhập mức giá cuối cùng lớn hơn 0đ cho "${name}".`,
            "⚠️",
          );
          return false;
        }
        const priorDeposit = Math.max(
          0,
          Math.round(Number(p.alreadyBilledUnitPrice ?? p.priorDeposit) || 0),
        );
        const qty = Math.max(1, Number(p.qty) || 1);
        const origQty = Math.max(1, Number(p.origQty ?? p.qty) || 1);
        if (priorDeposit > 0 && actualPrice * qty < priorDeposit * origQty) {
          ui.alert(
            "Giá thấp hơn mức tạm tính",
            `Mức giá cuối của "${name}" không thể thấp hơn mức tối thiểu đã tạm tính (${qty !== origQty ? formatVND(priorDeposit * origQty) : formatVND(priorDeposit)}).`,
            "⚠️",
          );
          return false;
        }
      }

      // 1. Tải ảnh biên lai lên server nếu thợ có đính kèm (không bắt buộc nếu vật tư phát sinh không có hoá đơn).
      const resolved = [];
      for (const p of parts) {
        const cleanName = String(p.name || "").trim();
        const receiptDesc = `Biên lai vật tư phát sinh: ${cleanName}`;
        let attachmentId = p.receiptId || null;
        if (p.receiptUri) {
          const upRes = await hrmssApi.uploadJobPhoto(
            o.dbAssignmentId,
            p.receiptUri,
            "DOCUMENT",
            receiptDesc,
          );
          const newAttId = upRes?.data?.attachment?.attachment_id;
          if (!upRes?.ok || !newAttId) {
            return serverDone(upRes, {
              title: "Không tải được ảnh biên lai",
            });
          }
          if (!upRes.data?.attachment?.description) {
            await hrmssApi.updatePhotoNote(newAttId, receiptDesc).catch(() => null);
          }
          attachmentId = newAttId;
        } else if (attachmentId) {
          const existingEv = (o.evidence || []).find(
            (e) => String(e.dbAttachmentId) === String(attachmentId),
          );
          if (existingEv && !String(existingEv.note || "").trim()) {
            await hrmssApi.updatePhotoNote(attachmentId, receiptDesc).catch(() => null);
          }
        }
        const priorDeposit = Math.max(
          0,
          Math.round(Number(p.alreadyBilledUnitPrice ?? p.priorDeposit) || 0),
        );
        resolved.push({
          part: { ...p, name: cleanName },
          attachmentId,
          priorDeposit,
        });
      }

      // 2. Gửi báo giá phụ chốt chi phí cuối cùng để khách xác nhận Bill.
      // Dòng có ảnh hoá đơn -> MATERIAL + external_purchase để gắn biên lai; dòng không kèm hoá đơn -> SERVICE kèm thẻ [VT ngoài chốt giá] để BE không chặn 422 RECEIPT_REQUIRED.
      const items = resolved.map(({ part, attachmentId, priorDeposit }) => {
        const actualPrice = Math.round(Number(part.actualPrice) || 0);
        const qty = Math.max(1, Number(part.qty) || 1);
        const origQty = Math.max(1, Number(part.origQty ?? part.qty) || 1);
        if (part.isWarehouse && (part.matId || part.dbMaterialId)) {
          const dbMatId = part.dbMaterialId || resolveDbMaterialId(part.matId, part.name);
          if (dbMatId) {
            return {
              item_type: "MATERIAL",
              material_id: dbMatId,
              description_snapshot: part.name,
              quantity: qty,
              unit_price: actualPrice,
            };
          }
        }
        const totalDelta =
          priorDeposit > 0
            ? Math.max(0, actualPrice * qty - priorDeposit * origQty)
            : actualPrice * qty;
        const unitPrice = Math.round(totalDelta / qty);
        const desc = formatFinalizedExternalDesc({
          name: part.name,
          minPrice: part.minPrice,
          maxPrice: part.maxPrice,
          priorDeposit,
          priorDepositQty: origQty !== qty ? origQty : null,
        });
        if (attachmentId) {
          return {
            item_type: "MATERIAL",
            external_purchase: true,
            description_snapshot: desc,
            quantity: qty,
            unit_price: unitPrice,
          };
        }
        return {
          item_type: "SERVICE",
          description_snapshot: desc,
          quantity: qty,
          unit_price: unitPrice,
        };
      });
      const applyZeroDepositFinalization = async (zeroEntries) => {
        const uploadedAtts = zeroEntries.filter((e) => Boolean(e.resolved.attachmentId));
        if (uploadedAtts.length) {
          const detailRes = await hrmssApi
            .getTechnicianJobDetail(o.dbAssignmentId)
            .catch(() => null);
          const quotes =
            detailRes?.data?.job?.quotations ||
            detailRes?.data?.quotations ||
            [];
          const approvedExtItems = sortQuotationsAsc(Array.isArray(quotes) ? quotes : [])
            .filter((q) => q.quotation_status === "APPROVED" || q.customer_decision === "APPROVED")
            .flatMap((q) => (Array.isArray(q.items) ? q.items : []))
            .filter((it) => isExternalQuoteItem(it) || Boolean(parseExternalPartDesc(it.description_snapshot)));
          for (const { resolved: { part, attachmentId } } of uploadedAtts) {
            const norm = normalizeExternalPartName(part.name);
            const target = approvedExtItems.find(
              (it) =>
                normalizeExternalPartName(
                  parseExternalPartDesc(it.description_snapshot)?.cleanName ||
                    it.description_snapshot,
                ) === norm,
            );
            if (target?.quotation_item_id) {
              await hrmssApi
                .attachPartReceipt(o.dbAssignmentId, target.quotation_item_id, attachmentId)
                .catch(() => null);
            }
          }
        }
        const rawNames = zeroEntries.map((e) => String(e.resolved.part.name || "").trim()).filter(Boolean);
        if (rawNames.length) {
          await hrmssApi
            .addJobProgress(o.dbAssignmentId, { note: `[Chốt VT ngoài bằng tạm tính] ${rawNames.join(" | ")}` })
            .catch(() => null);
        }
        const finalizedNames = rawNames.map(normalizeExternalPartName).filter(Boolean);
        updateOrder(code, (ord) => ({
          order: {
            ...ord,
            locallyFinalizedExternalNames: [
              ...new Set([...(ord.locallyFinalizedExternalNames || []), ...finalizedNames]),
            ],
          },
        }));
      };
      let qRes = await hrmssApi.submitQuotation(o.dbAssignmentId, { items });
      let activeResolved = resolved;
      const pairedEntries = resolved.map((r, idx) => ({ resolved: r, item: items[idx] }));
      const zeroDeltaEntries = pairedEntries.filter((e) => Number(e.item.unit_price) === 0 && e.resolved.priorDeposit > 0);
      const positiveEntries = pairedEntries.filter((e) => Number(e.item.unit_price) > 0);
      if (!qRes.ok && zeroDeltaEntries.length > 0 && [400, 422].includes(Number(qRes.status))) {
        if (positiveEntries.length === 0) {
          await applyZeroDepositFinalization(zeroDeltaEntries);
          ui.toast("Giá thực tế khớp tiền tạm tính ban đầu (0đ phát sinh thêm)", "✅");
          await syncFromBackend(null, true);
          return true;
        }
        const retryRes = await hrmssApi.submitQuotation(o.dbAssignmentId, {
          items: positiveEntries.map((e) => e.item),
        });
        if (retryRes.ok) {
          qRes = retryRes;
          activeResolved = positiveEntries.map((e) => e.resolved);
          await applyZeroDepositFinalization(zeroDeltaEntries);
        }
      }
      if (!qRes.ok) {
        return serverDone(qRes, {
          title: "Không gửi được giá cuối",
          codes: {
            QUOTATION_PENDING:
              "Đang có báo giá chờ khách nghiệm thu. Nhắc khách xác nhận hoặc chờ khách phản hồi.",
            INVALID_VISIT_STATE: "Việc chưa ở trạng thái cho phép gửi hoá đơn chi phí cuối.",
            JOB_NOT_ACTIVE:
              "Việc không còn được giao cho bạn.",
            VALIDATION_ERROR:
              qRes.message || "Giá chốt chưa hợp lệ (kiểm tra lại số lượng/đơn giá hoặc chênh lệch phải lớn hơn 0đ).",
            INVALID_PRICE: "Đơn giá vật tư chưa hợp lệ.",
          },
        });
      }

      // 3. Gắn ảnh biên lai vào từng dòng linh kiện mua ngoài có đính kèm ảnh.
      const createdQuotationId =
        qRes.data?.quotation?.quotation_id || qRes.data?.quotation_id || null;
      let createdItems =
        qRes.data?.quotation?.items ||
        qRes.data?.items ||
        [];
      const neededReceiptCount = activeResolved.filter((r) => Boolean(r.attachmentId)).length;
      if (
        neededReceiptCount > 0 &&
        (!Array.isArray(createdItems) ||
          createdItems.filter(isExternalQuoteItem).length < neededReceiptCount)
      ) {
        const detailRes = await hrmssApi
          .getTechnicianJobDetail(o.dbAssignmentId)
          .catch(() => null);
        const quotes =
          detailRes?.data?.job?.quotations ||
          detailRes?.data?.quotations ||
          [];
        const sortedQuotes = sortQuotationsAsc(Array.isArray(quotes) ? quotes : []);
        const targetQuote =
          (createdQuotationId != null
            ? sortedQuotes.find((q) => String(q.quotation_id) === String(createdQuotationId))
            : null) ||
          (sortedQuotes.length ? sortedQuotes[sortedQuotes.length - 1] : null);
        if (Array.isArray(targetQuote?.items) && targetQuote.items.length) {
          createdItems = targetQuote.items;
        }
      }
      // Chỉ dòng mua ngoài thật (is_external_purchase / MATERIAL không có material_id) mới gắn được biên lai.
      const extItems = (createdItems || []).filter(isExternalQuoteItem);
      const usedItemIds = new Set();
      const failedReceipts = [];
      for (let i = 0; i < activeResolved.length; i += 1) {
        const { part, attachmentId } = activeResolved[i];
        if (!attachmentId) continue;
        const normTarget = normalizeExternalPartName(part.name);
        const matched =
          extItems.find(
            (it) =>
              !usedItemIds.has(String(it.quotation_item_id)) &&
              normalizeExternalPartName(
                parseExternalPartDesc(it.description_snapshot)?.cleanName ||
                  it.description_snapshot,
              ) === normTarget,
          ) ||
          extItems.find(
            (it) => !usedItemIds.has(String(it.quotation_item_id)),
          );
        const qItemId = matched?.quotation_item_id;
        if (!qItemId) {
          failedReceipts.push(part.name);
          continue;
        }
        usedItemIds.add(String(qItemId));
        const attRes = await hrmssApi
          .attachPartReceipt(o.dbAssignmentId, qItemId, attachmentId)
          .catch(() => null);
        if (!attRes?.ok) {
          // Một số phiên bản backend chỉ cho gắn biên lai sau khi báo giá được duyệt (409/400) — ảnh đã lưu sẵn trên job để tự gắn trước khi hoàn thành.
          const isPendingLock =
            Number(attRes?.status) === 409 ||
            /APPROV|PENDING|STATUS|QUOTATION/i.test(String(attRes?.code || ""));
          if (!isPendingLock) failedReceipts.push(part.name);
        }
      }
      if (failedReceipts.length) {
        ui.alert(
          "Chưa gắn được biên lai",
          `Đã gửi giá nhưng chưa gắn được biên lai cho ${failedReceipts
            .map((n) => `"${n}"`)
            .join(", ")} — hãy gắn lại ở thẻ Biên lai.`,
          "⚠️",
        );
      }

      // 4. Lưu nhật ký tóm tắt hoàn tất sửa chữa nếu có.
      if (summary && String(summary).trim()) {
        await hrmssApi
          .addJobProgress(o.dbAssignmentId, {
            progress_percent: 100,
            note: `Hoàn tất sửa chữa & chốt chi phí vật tư phát sinh: ${String(summary).trim()}`,
          })
          .catch(() => null);
      }

      if (!failedReceipts.length)
        ui.toast("Đã gửi chi phí vật tư cuối cùng · Chờ khách xác nhận hoá đơn", "🧾");
      syncFromBackend(null, true);
      return true;
    },
    // Tại nhà khách, không có phát sinh: chỉ ghi chẩn đoán (needs_quotation = false) rồi sửa theo dịch vụ đã đặt.
    // KHÔNG gửi báo giá chứa lại dịch vụ đã đặt (báo giá tại nhà được cộng thêm vào giá đã đặt -> tính tiền 2 lần).
    startRepairWithoutQuote: async (
      code,
      { diagnosis, symptoms, recommendation },
    ) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || !["diagnosing", "out_of_warranty"].includes(o.status)) {
        ui.alert(
          "Không bắt đầu được",
          "Việc chưa ở bước kiểm tra thiết bị.",
          "ℹ️",
        );
        return false;
      }
      if (!authTokens.get() || !o.dbAssignmentId) return notSynced();
      const dRes = await saveDiagnosisOnce(o, {
        diagnosis,
        symptoms,
        recommendation,
        needsQuotation: false,
      });
      if (dRes && !dRes.ok)
        return serverDone(dRes, {
          title: "Không lưu được chẩn đoán",
          codes: {
            CHECK_IN_REQUIRED:
              'Bạn chưa xác nhận đến nơi tại nhà khách. Hãy bấm "Đã đến nơi" trước khi chẩn đoán.',
          },
        });
      updateOrder(code, (ord) => ({
        order: withStatus(
          {
            ...ord,
            quoteEditing: false,
            quoteEditingFrom: null,
            quoteEditingFromApproved: undefined,
            noQuoteConfirmedAt: Date.now(),
            ...(ord.quote ? { quote: { ...ord.quote, revisionRequested: false } } : {}),
          },
          "repairing",
          Date.now(),
        ),
      }));
      return serverDone(
        { ok: true },
        { toast: "Đã xác nhận · bắt đầu sửa theo dịch vụ đã đặt", icon: "🔧" },
      );
    },
    // Khách duyệt / yêu cầu sửa báo giá / từ chối & huỷ đơn (Ghi vào hrmss.quotation & service_request)
    // - Nếu thợ chưa đến nhà: huỷ miễn phí 100%. Khách đồng ý thì thợ mới đi.
    // - Chỉ khi thợ đã đến kiểm tra báo giá tại nhà mà khách huỷ thì mới thu phí kiểm tra (100.000đ).
    // Khách duyệt / yêu cầu sửa / từ chối báo giá: POST /customer/requests/:id/quotation-decision.
    // Phí kiểm tra, hoàn voucher, huỷ đơn do server quyết định; app tải lại sau đó.
    respondQuote: async (code, decision, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || !authTokens.get()) return notSynced("Đơn này");
      // Chỉ quyết định được báo giá đang chờ duyệt; trước đây trả false im lặng -> khách bấm mà "không có gì xảy ra".
      if (o.quote?.status !== "SENT") {
        ui.alert(
          "Báo giá không còn chờ duyệt",
          o.quote?.revisionRequested
            ? "Bạn đã yêu cầu thợ báo giá lại. Vui lòng chờ báo giá mới."
            : "Báo giá này đã được xử lý. Đang tải lại đơn.",
          "ℹ️",
        );
        syncFromBackend(null, true);
        return false;
      }
      const approve = decision === true || decision === "approve";
      const res = await hrmssApi.decideQuotation(o.dbRequestId, {
        decision: approve
          ? "APPROVED"
          : decision === "revise"
            ? "REVISE"
            : "REJECTED",
        rejection_reason: reason || null,
      });
      return serverDone(res, {
        title: "Không gửi được",
        codes: {
          QUOTATION_NOT_FOUND: "Báo giá này không còn chờ duyệt.",
          INVALID_REQUEST_STATE: "Đơn không còn ở bước duyệt báo giá.",
        },
        toast: approve
          ? "Đã duyệt báo giá"
          : decision === "revise"
            ? "Đã gửi yêu cầu báo giá lại cho thợ"
            : "Đã từ chối báo giá",
        icon: approve ? "✅" : "🔄",
      });
    },

    // Hủy đơn: gửi backend TRƯỚC (PATCH /customer/requests/:id/cancel); backend từ chối thì giữ nguyên đơn và báo lý do.
    // Vật tư: sửa số lượng / xoá theo usage_id trên server (PATCH / DELETE /technician/jobs/:id/materials/:usageId).
    setMaterialQty: async (code, id, qty) => {
      const o = s.orders.find((x) => x.code === code);
      const m = (o?.materials || []).find((x) => x.id === id);
      if (!o?.dbAssignmentId || !m?.dbUsageId || !authTokens.get())
        return notSynced("Vật tư này");
      const res = await hrmssApi.updateMaterialUsage(
        o.dbAssignmentId,
        m.dbUsageId,
        Math.max(1, Number(qty) || 1),
      );
      return serverDone(res, {
        title: "Không sửa được vật tư",
        codes: { MATERIAL_USAGE_NOT_FOUND: "Vật tư này không còn trong việc." },
      });
    },
    addMaterial: async (code, mat) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.recordMaterialUsage(o.dbAssignmentId, {
        material_id: resolveDbMaterialId(mat.dbId || mat.id, mat.name),
        used_quantity: 1,
      });
      return serverDone(res, {
        title: "Không thêm được vật tư",
        codes: {
          MATERIAL_NOT_FOUND: "Vật tư không có trong kho của hệ thống.",
        },
        toast: "Đã thêm vật tư",
        icon: "🔩",
      });
    },
    removeMaterial: async (code, id) => {
      const o = s.orders.find((x) => x.code === code);
      const m = (o?.materials || []).find((x) => x.id === id);
      if (!o?.dbAssignmentId || !m?.dbUsageId || !authTokens.get())
        return notSynced("Vật tư này");
      const res = await hrmssApi.deleteMaterialUsage(
        o.dbAssignmentId,
        m.dbUsageId,
      );
      return serverDone(res, {
        title: "Không xoá được vật tư",
        toast: "Đã xoá vật tư",
        icon: "🗑️",
      });
    },
    // Ảnh minh chứng: lưu trên server (POST /uploads job_id + evidence_type; PATCH / DELETE /uploads/:id).
    addEvidence: async (code, { uri, stage, note }) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const type =
        {
          diagnosis: "PROBLEM_PHOTO",
          before: "BEFORE_REPAIR",
          after: "AFTER_REPAIR",
        }[stage] || "AFTER_REPAIR";
      const res = await hrmssApi.uploadJobPhoto(
        o.dbAssignmentId,
        uri,
        type,
        note || null,
      );
      if (
        res.ok &&
        note &&
        res.data?.attachment?.attachment_id &&
        !res.data.attachment.description
      ) {
        await hrmssApi
          .updatePhotoNote(res.data.attachment.attachment_id, note)
          .catch(() => null);
      }
      return serverDone(res, {
        title: "Không tải được ảnh",
        codes: { INVALID_PHOTO: "Ảnh không hợp lệ (chỉ nhận JPG, PNG, WEBP)." },
        toast:
          stage === "diagnosis"
            ? "Đã thêm ảnh chẩn đoán"
            : "Đã thêm ảnh minh chứng",
        icon: "📷",
      });
    },
    removeEvidence: async (code, id) => {
      const o = s.orders.find((x) => x.code === code);
      const e = (o?.evidence || []).find((x) => x.id === id);
      if (!e?.dbAttachmentId || !authTokens.get()) return notSynced("Ảnh này");
      const res = await hrmssApi.deletePhoto(e.dbAttachmentId);
      return serverDone(res, {
        title: "Không xoá được ảnh",
        toast: "Đã xoá ảnh",
        icon: "🗑️",
      });
    },
    updateEvidenceNote: async (code, id, note) => {
      const o = s.orders.find((x) => x.code === code);
      const e = (o?.evidence || []).find((x) => x.id === id);
      if (!e?.dbAttachmentId || !authTokens.get()) return notSynced("Ảnh này");
      const res = await hrmssApi.updatePhotoNote(e.dbAttachmentId, note);
      return serverDone(res, { title: "Không lưu được ghi chú ảnh" });
    },
    // Biên lai linh kiện mua ngoài: tải ảnh (POST /uploads, DOCUMENT) rồi gắn vào dòng báo giá
    // (PATCH /technician/jobs/:id/quotation-items/:itemId/receipt). Thiếu biên lai thì backend không cho nộp hoàn thành.
    uploadPartReceipt: async (code, itemId, uri) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !itemId || !authTokens.get())
        return notSynced();
      const partObj =
        (o.externalParts || []).find((p) => String(p.itemId) === String(itemId)) ||
        (o.quote?.lines || []).find((l) => String(l.dbItemId) === String(itemId));
      const cleanPartName = String(partObj?.name || "").trim();
      const receiptDesc = cleanPartName
        ? `Biên lai vật tư phát sinh: ${cleanPartName}`
        : "Biên lai linh kiện mua ngoài";
      const up1 = await hrmssApi.uploadJobPhoto(
        o.dbAssignmentId,
        uri,
        "DOCUMENT",
        receiptDesc,
      );
      const attId = up1.data?.attachment?.attachment_id;
      if (!up1.ok || !attId)
        return serverDone(up1, { title: "Không tải được ảnh biên lai" });
      if (!up1.data?.attachment?.description) {
        await hrmssApi.updatePhotoNote(attId, receiptDesc).catch(() => null);
      }
      const res = await hrmssApi.attachPartReceipt(
        o.dbAssignmentId,
        itemId,
        attId,
      );
      return serverDone(res, {
        title: "Không gắn được biên lai",
        codes: {
          INVALID_VISIT_STATE: "Xác nhận đến nơi tại nhà khách trước khi gắn biên lai.",
          NOT_EXTERNAL_PURCHASE: "Dòng này không phải linh kiện mua ngoài.",
        },
        toast: "Đã gắn biên lai",
        icon: "🧾",
      });
    },
    // Thợ xác nhận ĐÃ NHẬN tiền mặt: POST /technician/jobs/:id/payments/confirm-cash. Khách bấm "đã trả" chỉ là báo,
    // đơn chỉ tính là đã trả khi thợ (hoặc văn phòng) xác nhận.
    // Nếu BE còn GD VietQR chờ nhưng khách đã đổi/sang TM trên app → bỏ qua và đánh dấu đã thu local.
    confirmCashReceived: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const markPaidLocal = (cashAmount = 0) => {
        const prevRem = amountRemaining(o) || orderTotal(o) || 0;
        const collected =
          Number(cashAmount) > 0 ? Number(cashAmount) : prevRem;
        const nextRem = Math.max(0, prevRem - collected);
        const isFull = nextRem <= 0;
        updateOrder(code, (x) => {
          const nextPaidAmt = (Number(x.bill?.paidAmount) || 0) + collected;
          return {
            order: {
              ...x,
              payment: "Tiền mặt tại nhà",
              paymentMethod: "cash",
              qrPaymentRequested: false,
              paymentMethodLocked: false,
              cashClaimLocked: false,
              status: x.status === "cancelled" ? "cancelled" : (isFull ? "done" : x.status),
              report: {
                ...(x.report || {}),
                paid: isFull,
                at: Date.now(),
              },
              bill: {
                ...(x.bill || {}),
                cashClaimPending: false,
                paymentStatus: isFull ? "PAID" : "PARTIALLY_PAID",
                amountDue: x.bill?.amountDue ?? orderTotal(x),
                paidAmount: nextPaidAmt,
                remainingAmount: nextRem,
                cashToCollect: nextRem,
                paymentMethod: "cash",
              },
            },
          };
        });
      };
      const res = await hrmssApi.confirmCashReceived(o.dbAssignmentId);
      // Chỉ đánh dấu "đã thu tiền" khi server xác nhận. Lỗi (khách trả QR, đang có GD chờ, lỗi server...)
      // phải hiện rõ để thợ KHÔNG thu tiền mặt sai / rời đi khi server chưa ghi nhận.
      if (res.ok) markPaidLocal(res.data?.cash_collected);
      return serverDone(res, {
        title: "Không xác nhận được",
        codes: {
          ALREADY_PAID: "Đơn đã được thanh toán đủ.",
          NOT_PAYABLE_YET: "Đơn chưa đến bước thanh toán.",
          CUSTOMER_PAYS_BY_QR:
            "Khách đã chọn thanh toán VietQR — KHÔNG thu tiền mặt. Hệ thống sẽ tự xác nhận khi tiền về.",
          PAYMENT_IN_PROGRESS:
            "Khách đang có giao dịch VietQR chờ xử lý. Đợi giao dịch kết thúc (hoặc khách đổi sang tiền mặt) rồi thử lại.",
          CONFLICT: "Trạng thái thanh toán vừa thay đổi. Vui lòng tải lại việc rồi thử lại.",
        },
        toast: res.ok
          ? `Đã xác nhận nhận ${formatVND(res.data?.cash_collected || 0)} tiền mặt`
          : "",
        icon: "💵",
      });
    },
    // Nhật ký sửa chữa: thêm / sửa / xóa trên server (POST / PATCH / DELETE /technician/jobs/:id/progress).
    addRepairNote: async (code, text) => {
      const note = String(text || "").trim();
      if (!note) {
        ui.alert("Thiếu nội dung", "Nhập ghi chú công việc đã làm.", "📝");
        return false;
      }
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.addJobProgress(o.dbAssignmentId, { note });
      return serverDone(res, { title: 'Không lưu được ghi chú', toast: 'Đã lưu ghi chú sửa chữa', icon: '📝' });
    },
    updateRepairNote: async (code, noteId, nextText) => {
      const clean = String(nextText || '').trim();
      if (!clean) {
        ui.alert(
          "Thiếu nội dung",
          "Nội dung ghi chú không được để trống.",
          "✏️",
        );
        return false;
      }
      const o = s.orders.find((x) => x.code === code);
      const n = (o?.repairNotes || []).find((x) => x.id === noteId);
      if (!o?.dbAssignmentId || !n?.dbProgressId || !authTokens.get()) return notSynced('Ghi chú này');
      const res = await hrmssApi.updateJobProgress(o.dbAssignmentId, n.dbProgressId, { note: clean });
      return serverDone(res, {
        title: 'Không cập nhật được ghi chú',
        codes: { PROGRESS_NOT_FOUND: 'Ghi chú này không còn trên hệ thống.' },
        toast: 'Đã cập nhật ghi chú',
        icon: '✏️',
      });
    },
    deleteRepairNote: async (code, noteId) => {
      const o = s.orders.find((x) => x.code === code);
      const n = (o?.repairNotes || []).find((x) => x.id === noteId);
      if (!o?.dbAssignmentId || !n?.dbProgressId || !authTokens.get()) return notSynced('Ghi chú này');
      const res = await hrmssApi.deleteJobProgress(o.dbAssignmentId, n.dbProgressId);
      return serverDone(res, {
        title: 'Không xoá được ghi chú',
        codes: { PROGRESS_NOT_FOUND: 'Ghi chú này không còn trên hệ thống.' },
        toast: 'Đã xoá ghi chú',
        icon: '🗑️',
      });
    },
    // Khách sửa đơn còn chờ: PATCH /customer/requests/:id; ảnh mới tải lên POST /uploads (request_id).
    updatePendingRequest: async (code, patch) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || !authTokens.get()) return notSynced("Đơn này");
      const prevAtts = Array.isArray(o.attachments) ? o.attachments : [];
      const body = {
        ...(patch.dateKey && patch.slot
          ? { preferred_time: buildPreferredTimeIso(patch.dateKey, patch.slot) }
          : {}),
        ...(patch.note != null
          ? { problem_description: String(patch.note).slice(0, 1000) || null }
          : {}),
      };
      const res = await hrmssApi.updateCustomerRequest(o.dbRequestId, body);
      if (res.ok) {
        if (patch.dateKey && patch.slot) {
          updateOrder(code, (ord) => ({
            order: { ...ord, expiredNotified: false },
          }));
        }
        if (Array.isArray(patch.attachments)) {
          const keptIds = new Set(
            patch.attachments
              .map((x) => x?.dbAttachmentId)
              .filter((id) => id != null)
              .map(String),
          );
          const removedIds = prevAtts
            .filter((x) => x?.dbAttachmentId != null && !keptIds.has(String(x.dbAttachmentId)))
            .map((x) => x.dbAttachmentId);
          if (removedIds.length) {
            const removedSet = new Set(removedIds.map(String));
            const delRes = await Promise.all(
              removedIds.map((attId) =>
                hrmssApi.deletePhoto(attId).catch(() => null),
              ),
            );
            if (delRes.some((r) => !r?.ok)) {
              ui.toast("Một số ảnh cũ chưa xoá được", "⚠️");
            }
            updateOrder(code, (ord) => ({
              order: {
                ...ord,
                attachments: (ord.attachments || []).filter(
                  (x) => x?.dbAttachmentId == null || !removedSet.has(String(x.dbAttachmentId)),
                ),
                evidence: (ord.evidence || []).filter(
                  (x) => x?.dbAttachmentId == null || !removedSet.has(String(x.dbAttachmentId)),
                ),
              },
            }));
          }
        }
        const fresh = (patch.attachments || [])
          .filter((x) => x?.uri && !x.dbAttachmentId)
          .slice(0, 5);
        if (fresh.length) {
          const rs = await Promise.all(
            fresh.map((x) =>
              hrmssApi
                .uploadRequestPhoto(o.dbRequestId, x.uri)
                .catch(() => null),
            ),
          );
          if (rs.some((r) => !r?.ok))
            ui.toast("Một số ảnh chưa tải lên được", "⚠️");
        }
      }
      return serverDone(res, {
        title: "Không sửa được",
        codes: {
          CANNOT_EDIT: "Chỉ sửa được khi đơn còn chờ thợ.",
          EDIT_TOO_LATE: "Đã quá thời gian được sửa đơn.",
        },
        toast: "Đã cập nhật yêu cầu",
        icon: "✏️",
      });
    },
    // Mật khẩu: backend kiểm tra (8-64 ký tự). Lỗi trả { ok:false, error }.
    changePassword: async ({ currentPassword, newPassword }) => {
      if (!s.auth?.id || !authTokens.get())
        return { ok: false, error: "Chưa đăng nhập." };
      if (String(newPassword || "").length < 8)
        return { ok: false, error: "Mật khẩu mới phải có từ 8 đến 64 ký tự." };
      const res = await hrmssApi.changePassword({
        currentPassword,
        newPassword,
      });
      if (!res.ok) {
        return {
          ok: false,
          error:
            res.code === "INVALID_CURRENT_PASSWORD" || res.status === 401
              ? "Mật khẩu hiện tại không đúng."
              : res.message || "Không đổi được mật khẩu.",
        };
      }
      ui.toast("Đã đổi mật khẩu", "🔐");
      return { ok: true };
    },
    // Quên mật khẩu bước 1: backend gửi mã OTP 6 số tới email của tài khoản (hiệu lực 10 phút).
    requestPasswordReset: async ({ identifier }) => {
      const id = String(identifier || "").trim();
      if (!id)
        return { ok: false, error: "Vui lòng nhập thư điện tử hoặc tên đăng nhập." };
      const res = await hrmssApi.forgotPassword(id);
      if (!res.ok)
        return {
          ok: false,
          error:
            res.status > 0
              ? res.message || "Không gửi được mã."
              : "Không kết nối được máy chủ.",
        };
      return { ok: true };
    },
    // Bước 2: đặt mật khẩu mới bằng mã OTP.
    resetPassword: async ({ identifier, otp, newPassword }) => {
      if (!/^\d{6}$/.test(String(otp || "").trim()))
        return { ok: false, error: "Mã xác nhận gồm đúng 6 chữ số." };
      if (String(newPassword || "").length < 8)
        return { ok: false, error: "Mật khẩu mới phải có từ 8 đến 64 ký tự." };
      const res = await hrmssApi.resetPassword({
        identifier: String(identifier || "").trim(),
        otp,
        newPassword,
      });
      if (!res.ok)
        return {
          ok: false,
          error:
            res.status > 0
              ? res.message || "Mã không đúng hoặc đã hết hạn."
              : "Không kết nối được máy chủ.",
        };
      ui.toast("Đã đặt lại mật khẩu. Hãy đăng nhập lại.", "🔐");
      return { ok: true };
    },
    // Thợ bấm hoàn thành → "Chờ thanh toán"; khách thanh toán đủ → "Hoàn thành" (không qua nghiệm thu văn phòng)
    // Nộp biên bản: gửi backend TRƯỚC (PATCH /technician/jobs/:id/complete). Backend từ chối (vd. chưa xong các bước
    // bắt buộc -> 409 PROCEDURE_INCOMPLETE) thì báo thợ và KHÔNG đổi trạng thái trên máy. Trả true khi nộp được.
    completeJob: async (
      code,
      { summary, paid, safetyChecklist, customerSignature, completionPhotoUris = [] },
    ) => {
      const now = Date.now();
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0 || o0.status !== "repairing") {
        ui.alert(
          "Không hoàn thành được",
          "Chỉ hoàn thành khi đang ở trạng thái sửa chữa.",
          "ℹ️",
        );
        return false;
      }
      if (!authTokens.get() || !o0.dbAssignmentId) {
        ui.alert(
          "Chưa nộp được biên bản",
          "Việc này chưa đồng bộ với hệ thống. Kéo làm mới danh sách việc rồi thử lại.",
          "ℹ️",
        );
        return false;
      }
      const cleanSummary =
        summary && String(summary).trim().length >= 5
          ? String(summary).trim()
          : "Đã hoàn thành sửa chữa & bảo dưỡng thiết bị theo quy trình chuẩn.";
      const sig = customerSignature ? String(customerSignature).trim() : "";
      const checklist = Array.isArray(safetyChecklist) ? safetyChecklist.filter(Boolean) : [];
      const testingBase = checklist.length > 0
        ? checklist.join("; ")
        : "Đã vận hành chạy thử thiết bị ổn định (≥15 phút)";
      const qrOrder = isQRPayment(o0);
      const cashDue = qrOrder ? 0 : cashToCollect(o0);
      const collectedCash = Boolean(paid) && !qrOrder && cashDue > 0;
      const handoverBase = collectedCash
        ? "Đã thu tiền dịch vụ, bàn giao thiết bị và kích hoạt bảo hành điện tử"
        : "Đã bàn giao thiết bị cho khách hàng và kích hoạt bảo hành điện tử";
      if (Array.isArray(completionPhotoUris) && completionPhotoUris.length) {
        for (const uri of completionPhotoUris) {
          if (!uri) continue;
          const upRes = await hrmssApi
            .uploadJobPhoto(o0.dbAssignmentId, uri, "AFTER_REPAIR", "Ảnh hoàn thành bàn giao thiết bị")
            .catch(() => null);
          if (!upRes?.ok) {
            ui.alert(
              "Chưa tải được ảnh hoàn thành",
              upRes?.message || "Không tải lên được ảnh hoàn thành. Vui lòng kiểm tra mạng và thử lại.",
              "📷",
            );
            return false;
          }
          if (
            upRes?.ok &&
            upRes.data?.attachment?.attachment_id &&
            !upRes.data.attachment.description
          ) {
            await hrmssApi
              .updatePhotoNote(upRes.data.attachment.attachment_id, "Ảnh hoàn thành bàn giao thiết bị")
              .catch(() => null);
          }
        }
      }
      if ((o0.externalParts || []).some((p) => p.itemId && !p.receiptId)) {
        await reconcileMissingPartReceipts(o0.dbAssignmentId).catch(() => 0);
      }
      const completePayload = {
        work_performed: cleanSummary,
        testing_result: testingBase,
        handover_result: sig
          ? `${handoverBase}. Khách ký nhận: ${sig}`
          : handoverBase,
        cash_collected: collectedCash,
        customer_signature: sig || null,
        safety_checklist: checklist,
      };
      let res = await hrmssApi.completeTechnicianJob(
        o0.dbAssignmentId,
        completePayload,
      );
      if (!res.ok && res.code === "RECEIPT_REQUIRED") {
        const linked = await reconcileMissingPartReceipts(
          o0.dbAssignmentId,
        ).catch(() => 0);
        if (linked > 0) {
          res = await hrmssApi.completeTechnicianJob(
            o0.dbAssignmentId,
            completePayload,
          );
        }
      }
      if (!res.ok) {
        if (res.code === "PROCEDURE_INCOMPLETE") {
          const missing = (res.errors || [])
            .map((e) => `• ${toVietnamese(e?.message, "Chưa hoàn thành bước bắt buộc")}`)
            .join("\n");
          ui.alert(
            "Chưa xong các bước thực hiện",
            `Đánh dấu xong các bước bắt buộc trong thẻ "Các bước thực hiện" rồi nộp lại.${missing ? `\n\n${missing}` : ""}`,
            "📋",
          );
        } else if (res.code === "RECEIPT_REQUIRED") {
          const missing = (res.errors || [])
            .map((e) => `• ${toVietnamese(e?.message, "Thiếu ảnh biên lai vật tư")}`)
            .join("\n");
          ui.alert(
            "Thiếu biên lai linh kiện",
            `Gắn ảnh biên lai cho từng linh kiện mua ngoài (thẻ "Biên lai linh kiện mua ngoài") rồi nộp lại.${missing ? `\n\n${missing}` : ""}`,
            "🧾",
          );
        } else {
          const msg = {
            CUSTOMER_PAYS_BY_QR:
              "Khách trả bằng chuyển khoản VietQR, thợ không thu tiền mặt.",
          }[res.code];
          ui.alert(
            "Chưa nộp được biên bản",
            msg ||
              (res.status > 0
                ? res.message || "Vui lòng thử lại."
                : networkError(res)),
            "⚠️",
          );
        }
        await syncFromBackend(null, true);
        return false;
      }
      // Trạng thái, điểm thưởng, bảo hành do server xử lý; app chỉ lưu chữ ký / checklist vừa nhập rồi tải lại.
      updateOrder(code, (o) => ({
        order: {
          ...o,
          report: {
            ...(o.report || {}),
            summary: cleanSummary,
            at: now,
            safetyChecklist: safetyChecklist || [],
            customerSignature: customerSignature || null,
          },
        },
      }));
      const stillDue = amountRemaining(o0);
      ui.toast(
        collectedCash
          ? "Đã hoàn thành · Đã thu tiền"
          : stillDue > 0 && o0.kind !== "warranty" && o0.kind !== "followup"
            ? "Đã hoàn thành · Chờ khách thanh toán"
            : "Đã hoàn thành công việc",
        "✅",
      );
      await syncFromBackend(null, true);
      return true;
    },
    // Thợ kết luận ngoài bảo hành: POST /technician/jobs/:id/out-of-warranty (đơn chuyển sang sửa có phí).
    rejectWarrantyAsOutOfWarranty: async (code, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const r =
        reason ||
        "Hư hỏng do rơi vỡ/ngoại lực tác động, không thuộc phạm vi bảo hành.";
      const res = await hrmssApi.markOutOfWarranty(o.dbAssignmentId, r);
      return serverDone(res, {
        title: "Không cập nhật được",
        codes: {
          NOT_WARRANTY_REQUEST: "Đơn này không phải đơn bảo hành.",
          ALREADY_OUT_OF_WARRANTY: "Đơn đã được ghi nhận ngoài bảo hành.",
        },
        toast: "Đã ghi nhận ngoài bảo hành · Chuyển sang báo giá",
        icon: "📋",
      });
    },
    // Hẹn tái khám: POST /technician/jobs/:id/follow-up (văn phòng xếp lịch).
    requestFollowUp: async (code, reason, remainingWork) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.requestJobFollowUp(
        o.dbAssignmentId,
        reason || "Chờ linh kiện phụ tùng",
        remainingWork || null,
      );
      return serverDone(res, {
        title: "Không gửi được",
        toast: "Đã ghi nhận yêu cầu hẹn tái khám",
        icon: "📅",
      });
    },
    // id: 1 id hoặc mảng id (cả nhóm thông báo của cùng một đơn).
    readTechNotif: (id) => {
      const ids = new Set(Array.isArray(id) ? id : [id]);
      (s.techNotifs || [])
        .filter((x) => ids.has(x.id) && x.dbNotificationId && !x.read)
        .forEach((x) =>
          hrmssApi.markNotificationRead(x.dbNotificationId).catch(() => {}),
        );
      up((p) => ({
        techNotifs: p.techNotifs.map((x) =>
          ids.has(x.id) ? { ...x, read: true } : x,
        ),
      }));
    },
    readAllTech: () => {
      hrmssApi.markAllNotificationsRead().catch(() => {});
      up((p) => ({
        techNotifs: p.techNotifs.map((n) => ({ ...n, read: true })),
      }));
    },
    clearAllTechNotifs: () => {
      // Backend không xóa thông báo: chỉ xoá các thông báo đã đọc và giữ lại toàn bộ chưa đọc (local & sync).
      const cur = s.techNotifs || [];
      const preview = clearReadNotifications(cur);
      if (preview.removedCount === 0) {
        ui.toast("Không có thông báo đã đọc để dọn", "ℹ️");
        return;
      }
      up((p) => {
        const res = clearReadNotifications(p.techNotifs || [], preview.clearedAt);
        return {
          techNotifs: res.remaining,
          techNotifClearedAt: Math.max(p.techNotifClearedAt || 0, res.clearedAt),
          techNotifKeptIds: res.keptIds,
        };
      });
      ui.toast(
        preview.remaining.length > 0
          ? `Đã xoá ${preview.removedCount} thông báo đã đọc (giữ lại ${preview.remaining.length} chưa đọc)`
          : `Đã dọn sạch ${preview.removedCount} thông báo đã đọc`,
      );
    },
    // Đăng nhập / Đăng ký — phân quyền & tách biệt dữ liệu theo tài khoản
    applyAuth: (account, link) => {
      authIdRef.current = account?.id || null;
      clearSessionCaches();
      resetTransientUiState();
      up((p) => {
        const diffAccount = !p.auth?.id || !account?.id || String(p.auth.id) !== String(account.id);
        return {
          ...switchCustomerSlice(p, account),
          auth: account,
          role: account.role,
          orders: [],
          user: {
            name: account.name || "",
            phone: account.phone || "",
            email: account.email || "",
          },
          techProfile:
            account.role === "tech"
              ? mergeTechProfile(diffAccount ? null : p.techProfile, account)
              : null,
          ...(account.role !== "tech" || diffAccount
            ? { techNotifs: [], techNotifClearedAt: 0, techNotifKeptIds: [] }
            : {}),
        };
      });
      setStack(
        link
          ? [{ name: link.name, params: link.params || {}, key: uid() }]
          : [],
      );
      setTab(account.role === "tech" ? "tech-jobs" : "home");
      syncFromBackend(account, true);
    },
    login: async (payload) => {
      let backendAccount = null;
      try {
        const beRes = await hrmssApi.login({
          identifier: payload.identifier || payload.phone,
          password: payload.password,
        });
        if (beRes.ok && beRes.data) {
          backendAccount = await buildBackendAccount(beRes.data);
        } else {
          return {
            ok: false,
            error: authErrorMessage(beRes, "login"),
          };
        }
      } catch (e) {
        return { ok: false, error: authErrorMessage({ status: 0 }, "login") };
      }

      const res = { ok: true, account: backendAccount };
      authIdRef.current = res.account?.id || null;
      clearSessionCaches();
      resetTransientUiState();
      up((p) => {
        const diffAccount = !p.auth?.id || !res.account?.id || String(p.auth.id) !== String(res.account.id);
        return {
          ...switchCustomerSlice(p, res.account),
          auth: res.account,
          role: res.account.role,
          orders: [],
          user: {
            name: res.account.name || "",
            username: res.account.username || "",
            email: res.account.email || "",
            phone: res.account.phone || "",
          },
          techProfile:
            res.account.role === "tech"
              ? mergeTechProfile(diffAccount ? null : p.techProfile, res.account)
              : null,
          ...(res.account.role !== "tech" || diffAccount
            ? { techNotifs: [], techNotifClearedAt: 0, techNotifKeptIds: [] }
            : {}),
        };
      });
      setStack([]);
      setTab(res.account.role === "tech" ? "tech-jobs" : "home");
      await syncFromBackend(res.account, true);
      ui.toast(
        res.account.role === "tech"
          ? "Đăng nhập ứng dụng Thợ thành công"
          : "Đăng nhập thành công",
        "👋",
      );
      return res;
    },
    register: async (payload) => {
      const cleanName = String(payload.name || "").trim();
      const cleanEmail = String(payload.email || "")
        .trim()
        .toLowerCase();
      const cleanUsername = String(payload.username || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
      const cleanPhone = String(payload.phone || "").replace(/\D/g, "");
      const cleanAddress = String(payload.address || "").trim();
      const pw = String(payload.password || "");

      if (cleanName.length < 2) {
        return {
          ok: false,
          error: "Vui lòng nhập họ và tên (tối thiểu 2 ký tự).",
        };
      }
      if (!cleanUsername) {
        return { ok: false, error: "Vui lòng nhập tên đăng nhập." };
      }
      if (!cleanEmail || !cleanEmail.includes("@")) {
        return { ok: false, error: "Vui lòng nhập địa chỉ thư điện tử hợp lệ." };
      }
      if (pw.length < 8) {
        return {
          ok: false,
          error:
            "Mật khẩu phải có từ 8 đến 64 ký tự (theo chuẩn bảo mật máy chủ).",
        };
      }

      let backendAccount = null;
      try {
        const beRes = await hrmssApi.register({
          username: cleanUsername,
          email: cleanEmail,
          password: pw,
          confirm_password: pw,
          full_name: cleanName,
          ...(cleanAddress ? { address: cleanAddress } : {}),
          ...(cleanPhone ? { phone: cleanPhone } : {}),
        });
        if (!beRes.ok) {
          if (beRes.status > 0) {
            return { ok: false, error: authErrorMessage(beRes, "register") };
          }
        } else {
          const createdUser = beRes.data?.account;
          const loginRes = await hrmssApi.login({
            identifier: cleanUsername,
            password: pw,
          });
          // Tạo tài khoản xong mà đăng nhập lỗi thì không vào trạng thái "đã đăng nhập" giả (không có token).
          if (
            !loginRes.ok ||
            !(loginRes.data?.user_id || createdUser?.user_id)
          ) {
            return {
              ok: false,
              error:
                "Đã tạo tài khoản nhưng chưa đăng nhập được. Vui lòng đăng nhập lại.",
            };
          }
          const userId = loginRes.data?.user_id || createdUser?.user_id;
          const roleCode = String(
            loginRes.data?.role || createdUser?.role?.role_code || "CUSTOMER",
          ).toUpperCase();
          const isTech = roleCode === "TECHNICIAN" || roleCode === "TECH";
          backendAccount = upsertBackendAccount({
            id: `be-${userId}`,
            role: isTech ? "tech" : "customer",
            username: cleanUsername,
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            emailVerified: false,
            ...(isTech ? { techCode: cleanUsername } : {}),
          });
        }
      } catch (e) {
        return {
          ok: false,
          error: authErrorMessage({ status: 0 }, "register"),
        };
      }
      if (!backendAccount) {
        return {
          ok: false,
          error: authErrorMessage({ status: 0 }, "register"),
        };
      }
      const res = { ok: true, account: backendAccount };
      authIdRef.current = res.account?.id || null;
      clearSessionCaches();
      resetTransientUiState();
      up((p) => {
        const diffAccount = !p.auth?.id || !res.account?.id || String(p.auth.id) !== String(res.account.id);
        return {
          ...switchCustomerSlice(p, res.account),
          auth: res.account,
          role: res.account.role,
          orders: [],
          user: {
            name: res.account.name || "",
            username: res.account.username || "",
            email: res.account.email || "",
            phone: res.account.phone || "",
          },
          techProfile:
            res.account.role === "tech"
              ? mergeTechProfile(diffAccount ? null : p.techProfile, res.account)
              : null,
          ...(res.account.role !== "tech" || diffAccount
            ? { techNotifs: [], techNotifClearedAt: 0, techNotifKeptIds: [] }
            : {}),
        };
      });
      setStack([]);
      setTab(res.account.role === "tech" ? "tech-jobs" : "home");
      await syncFromBackend(res.account, true);
      ui.toast(
        res.account.role === "tech"
          ? "Tạo tài khoản Thợ thành công"
          : "Tạo tài khoản thành công",
        "🎉",
      );
      return res;
    },
    sendEmailOtp: async () => {
      const targetEmail = s.user?.email || s.auth?.email || "";
      if (!targetEmail) {
        return {
          ok: false,
          error:
            "Tài khoản chưa có địa chỉ thư điện tử. Vui lòng cập nhật thư điện tử trong Thông tin cá nhân.",
        };
      }
      if (authTokens.get()) {
        const res = await hrmssApi.sendEmailVerificationOtp();
        if (res.ok && res.data) {
          if (res.data.email_verified) {
            const curAuth = stateRef.current?.auth;
            const nextAuth = curAuth
              ? upsertBackendAccount({ ...curAuth, emailVerified: true })
              : curAuth;
            up(() => ({ auth: nextAuth }));
            ui.toast("Thư điện tử của bạn đã được xác thực!", "✅");
            return { ok: true, alreadyVerified: true };
          }
          up((p) => ({
            notifications: pushNotif(p, {
              icon: "📧",
              title: "Mã xác thực thư điện tử đã được gửi",
              body: `Hệ thống vừa gửi mã xác thực 6 chữ số tới ${res.data.email || targetEmail} (hiệu lực ${OTP_TTL_MINUTES} phút). Vui lòng kiểm tra hộp thư.`,
            }),
          }));
          playNotificationSound("notification");
          ui.toast(
            `Đã gửi mã xác thực tới ${res.data.email || targetEmail}`,
            "📧",
          );
          return { ok: true, email: res.data.email || targetEmail };
        }
        return {
          ok: false,
          error: res.message || "Không thể gửi mã xác thực. Vui lòng thử lại.",
        };
      }
      return {
        ok: false,
        error: "Vui lòng đăng nhập lại để nhận mã xác thực thư điện tử.",
      };
    },
    verifyEmailOtp: async (otpInput) => {
      const cleanOtp = String(otpInput || "")
        .replace(/\D/g, "")
        .trim();
      if (cleanOtp.length !== 6) {
        return {
          ok: false,
          error: "Vui lòng nhập đủ 6 chữ số của mã xác thực.",
        };
      }
      if (!authTokens.get())
        return {
          ok: false,
          error: "Vui lòng đăng nhập lại để xác thực thư điện tử.",
        };
      const res = await hrmssApi.verifyEmailOtp(cleanOtp);
      if (!res.ok) {
        return {
          ok: false,
          error: res.message || "Mã xác thực không chính xác.",
        };
      }
      const curAuth = stateRef.current?.auth;
      const nextAuth = curAuth
        ? upsertBackendAccount({ ...curAuth, emailVerified: true })
        : curAuth;
      up((p) => ({
        ...(nextAuth ? { auth: nextAuth } : {}),
        notifications: pushNotif(p, {
          icon: "✅",
          title: "Đã xác thực thư điện tử thành công",
          body: `Địa chỉ ${p.user?.email || p.auth?.email || ""} đã được xác thực. Bạn có thể đặt lịch dịch vụ ngay!`,
        }),
      }));
      playNotificationSound("notification");
      ui.toast("Xác thực thư điện tử thành công!", "✅");
      return { ok: true };
    },

    // Hủy đơn: gửi backend TRƯỚC (PATCH /customer/requests/:id/cancel); backend từ chối thì giữ nguyên đơn và báo lý do.
    cancelOrder: async (code, reason) => {
      const now = Date.now();
      const cur = s.orders.find((x) => x.code === code);
      if (!cur || !["pending", "confirmed"].includes(cur.status)) {
        ui.alert(
          "Không huỷ được",
          "Chỉ huỷ khi thợ chưa bắt đầu di chuyển. Sau đó vui lòng gọi tổng đài.",
          "ℹ️",
        );
        return false;
      }
      const cancelCheck = getCancellationWindowStatus(cur, now);
      if (!cancelCheck.allowed) {
        ui.alert(
          "Không thể huỷ đơn",
          cancelCheck.reason ||
            `Không thể huỷ đơn khi còn dưới 1 tiếng trước giờ hẹn với thợ. Vui lòng gọi tổng đài ${HOTLINE}.`,
          "⚠️",
        );
        return false;
      }
      if (!authTokens.get() || !cur.dbRequestId) {
        ui.alert(
          "Không huỷ được",
          "Đơn này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.",
          "ℹ️",
        );
        return false;
      }
      const res = await hrmssApi.cancelCustomerRequest(
        cur.dbRequestId,
        reason || "Khách hàng hủy đơn qua ứng dụng",
      );
      if (!res.ok) {
        const msg = {
          CANCEL_TOO_LATE:
            "Còn dưới 1 giờ tới giờ hẹn nên không tự huỷ được. Vui lòng gọi tổng đài.",
          CANNOT_CANCEL:
            "Thợ đã bắt đầu di chuyển / đang làm, không tự huỷ được nữa. Vui lòng gọi tổng đài.",
        }[res.code];
        ui.alert(
          "Không huỷ được",
          msg || (res.status > 0 ? res.message : networkError(res)),
          "⚠️",
        );
        syncFromBackend(null, true);
        return false;
      }
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || !["pending", "confirmed"].includes(o.status)) return {};
        return {
          orders: p.orders.map((x) =>
            x.code === code
              ? {
                  ...x,
                  status: "cancelled",
                  cancelReason: reason,
                  history: [...x.history, { status: "cancelled", at: now }],
                }
              : x,
          ),
          notifications: pushNotif(p, {
            icon: "✖️",
            title: `Đã huỷ đơn ${code}`,
            body: reason || "Bạn đã huỷ đơn.",
            link: { name: "order", params: { code } },
          }),
        };
      });
      ui.toast("Đã huỷ đơn hàng");
      syncFromBackend(null, true);
      return true;
    },
    // Đánh giá: POST /customer/requests/:id/review. Điểm thưởng, điểm TB của thợ do server tính; app tải lại.
    rateOrder: async (code, stars, text) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== "done" || o.rating) return false;
      if (!o.dbRequestId || !authTokens.get()) return notSynced("Đơn này");
      const res = await hrmssApi.reviewCustomerRequest(o.dbRequestId, {
        rating: stars,
        review_text: text || null,
        punctuality_rating: stars,
        attitude_rating: stars,
        expertise_rating: stars,
      });
      if (res.ok) {
        finishedOrderCache.current.delete(String(o.dbRequestId));
        updateOrder(code, (x) => ({
          order: { ...x, rating: { stars, text } },
        }));
      }
      return serverDone(res, {
        title: "Không gửi được đánh giá",
        codes: {
          REVIEW_ALREADY_EXISTS: "Bạn đã đánh giá đơn này.",
          REQUEST_NOT_COMPLETED: "Chỉ đánh giá được đơn đã hoàn thành.",
        },
        toast: "Cảm ơn bạn đã đánh giá!",
        icon: "⭐",
      });
    },
    // Yêu cầu bảo hành: backend tạo đơn bảo hành (WARRANTY_PENDING), văn phòng thẩm định trên web.
    // Trả mã đơn bảo hành mới (để mở màn đơn), lỗi thì báo và trả null.
    requestWarranty: async (code, payloadOrNote) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o) return null;
      const info = warrantyInfo(o, s.orders, s.lifetimePoints);
      if (!info.ok) {
        if (info.isCutoff) {
          ui.alert(
            "Đã hết giờ tiếp nhận bảo hành",
            `Hôm nay là ngày cuối cùng trong thời hạn bảo hành và đã quá giờ làm việc của kỹ thuật viên (sau 18h00). Vui lòng liên hệ tổng đài ${HOTLINE} để được hỗ trợ.`,
            "🛡️"
          );
          return null;
        }
        ui.alert("Không thể gửi yêu cầu", info.text, "🛡️");
        return info.openCode || null;
      }
      if (!authTokens.get() || !o.dbRequestId) {
        ui.alert(
          "Chưa gửi được yêu cầu",
          "Đơn này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.",
          "🛡️",
        );
        return null;
      }
      // Kiểm tra lại ca đã chọn ngay trước khi gửi (form có thể mở từ trước, giờ đã trôi qua ca / qua 18h ngày cuối).
      if (payloadOrNote && typeof payloadOrNote === "object" && payloadOrNote.scheduled_date && payloadOrNote.time_slot) {
        const slotCheck = isWarrantySlotBookable({
          ymd: payloadOrNote.scheduled_date,
          slot: payloadOrNote.time_slot,
          now: new Date(),
          endYmd: info.endYmd || null,
        });
        const todayYmd = vnDateKey(Date.now());
        const serverOk =
          payloadOrNote.scheduled_date === todayYmd && Array.isArray(info.serverAvailableSlotsToday)
            ? info.serverAvailableSlotsToday.includes(payloadOrNote.time_slot)
            : true;
        const stillOk = slotCheck && serverOk;
        if (!stillOk) {
          ui.alert(
            "Khung giờ không còn khả dụng",
            "Ca bạn chọn đã qua hoặc vượt giờ làm việc của thợ. Vui lòng chọn lại ngày / khung giờ khác.",
            "⏰",
          );
          return null;
        }
      }
      // Upload ảnh local → URL https trước khi gửi bảo hành (API chỉ nhận https).
      let payload = payloadOrNote;
      if (payload && typeof payload === "object") {
        const localImgs = (payload.attachment_urls || payload.images || []).filter(
          (u) => u && !/^https?:\/\//i.test(String(u)),
        );
        const readyUrls = (payload.attachment_urls || payload.images || []).filter(
          (u) => /^https?:\/\//i.test(String(u)),
        );
        if (localImgs.length) {
          const uploadImgs = localImgs.slice(0, 3);
          const uploaded = await Promise.all(
            uploadImgs.map((uri) =>
              hrmssApi.uploadRequestPhoto(o.dbRequestId, uri, "[Bảo hành]").catch(() => null),
            ),
          );
          let uploadedOk = 0;
          uploaded.forEach((up) => {
            const url =
              up?.ok &&
              (up.data?.attachment?.image_url ||
                up.data?.image_url ||
                up.data?.url ||
                up.data?.attachment?.url);
            if (url && /^https?:\/\//i.test(String(url))) {
              readyUrls.push(String(url));
              uploadedOk += 1;
            }
          });
          if (uploadedOk < uploadImgs.length) {
            ui.toast("Một số ảnh bảo hành chưa tải lên được", "⚠️");
          }
        }
        payload = { ...payload, attachment_urls: readyUrls, images: readyUrls };
      }
      // Thử payload đặt lịch mới trước. Chỉ gửi lại dạng { note } khi backend cũ không nhận trường mới:
      // lỗi 404/405 hoặc 400/422 báo unknown/unsupported field. Tuyệt đối không gửi lại khi lỗi 5xx / mạng (có thể đã tạo đơn → trùng).
      let res = await hrmssApi.requestWarranty(o.dbRequestId, payload || null, "full");
      const firstError = res;
      const canFallbackLegacy =
        !res.ok &&
        typeof payload === "object" &&
        payload &&
        (Number(res.status) === 404 ||
          Number(res.status) === 405 ||
          ([400, 422].includes(Number(res.status)) &&
            ["VALIDATION_ERROR", "BAD_REQUEST"].includes(String(res.code || "")) &&
            /unknown|unexpected|unrecognized|not allowed|additional|unsupported/i.test(
              String(res.message || ""),
            )));
      if (canFallbackLegacy) {
        res = await hrmssApi.requestWarranty(o.dbRequestId, payload, "legacy");
        if (!res.ok) res = firstError;
      }
      if (!res.ok) {
        const msg = {
          WARRANTY_NOT_STARTED: "Bảo hành chỉ bắt đầu khi đơn đã hoàn thành.",
          WARRANTY_EXPIRED: "Đơn đã hết thời hạn bảo hành.",
          WARRANTY_FINAL_DAY_CUTOFF: "Hôm nay là ngày cuối bảo hành và đã quá ca tiếp nhận của thợ (sau 18h00).",
          WARRANTY_MUST_BE_TODAY: "Ngày cuối bảo hành chỉ được chọn lịch trong ngày hôm nay.",
          WARRANTY_ALREADY_OPEN:
            "Đơn này đang có một yêu cầu bảo hành chưa xử lý xong.",
          INVALID_TIME_SLOT:
            "Khung giờ đã chọn không còn khả dụng. Vui lòng chọn ca khác.",
          VALIDATION_ERROR: res.message || "Thông tin gửi bảo hành chưa hợp lệ. Vui lòng kiểm tra lại.",
        }[res.code];
        ui.alert(
          "Không thể gửi yêu cầu",
          msg || (res.status > 0 ? res.message : networkError(res)),
          "🛡️",
        );
        return null;
      }
      const rawReq = res.data?.request || res.data || null;
      let created = null;
      try {
        created = rawReq ? mapBackendCustomerRequestToOrder(rawReq, o.customerPhone) : null;
      } catch {
        created = null; // shape lạ: chờ lần đồng bộ ngay sau để lấy đơn đầy đủ
      }
      // Backend có thể trả shape rút gọn { id, code, ... } thay vì request_code → vẫn lấy được mã đơn mới.
      const newCode = created?.code || rawReq?.request_code || rawReq?.code || null;
      if (created?.code) {
        up((p) => ({
          orders: [
            {
              ...created,
              warrantyOf: code,
              customerAccountId: o.customerAccountId || p.auth?.id || null,
            },
            ...p.orders.filter((x) => x.code !== created.code),
          ],
        }));
      }
      ui.toast("Đã gửi yêu cầu bảo hành · Chờ Văn phòng thẩm định", "🛡️");
      finishedOrderCache.current.delete(String(o.dbRequestId));
      syncFromBackend(null, true);
      return newCode;
    },
    checkWarrantyEligibility: async (code) => {
      if (!warrantyEligibilitySupportedRef.current || !authTokens.get()) return null;
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || o.status !== "done" || o.kind === "warranty") return null;
      const res = await hrmssApi.getWarrantyEligibility(o.dbRequestId).catch(() => null);
      if (!res) return null;
      if (!res.ok) {
        if ([404, 405, 501].includes(Number(res.status))) {
          warrantyEligibilitySupportedRef.current = false;
        }
        return null;
      }
      if (res.data && typeof res.data === "object") {
        const eligData = { ...res.data, fetchedAt: Date.now() };
        const srvDays = parseWarrantyDays(res.data.warranty_days ?? res.data.warrantyDays);
        const endYmdStr = normalizeWarrantyEndYmd(
          res.data.warranty_end_date ?? res.data.warrantyEndDate,
        );
        const srvEndMs = endYmdStr ? new Date(`${endYmdStr}T23:59:59+07:00`).getTime() : null;
        up((p) => ({
          orders: p.orders.map((ord) =>
            ord.code === code
              ? {
                  ...ord,
                  serverWarrantyEligibility: eligData,
                  ...(typeof srvDays === "number" ? { warrantyDays: srvDays } : {}),
                  ...(srvEndMs && Number.isFinite(srvEndMs) ? { warrantyEndAt: srvEndMs } : {}),
                }
              : ord,
          ),
        }));
        return res.data;
      }
      return null;
    },

    // Điểm thưởng
    redeem: async (optId) => {
      const opt = (s.redeemOptions || []).find((x) => x.id === String(optId));
      if (!opt) return false;
      if (s.points < opt.cost) {
        ui.alert(
          "Chưa đủ điểm",
          `Bạn cần ${opt.cost} điểm, hiện có ${s.points} điểm. Hoàn thành đơn hoặc đánh giá để tích thêm điểm.`,
          "🎯",
        );
        return false;
      }
      const res = await hrmssApi.redeemVoucher(opt.id);
      if (!res.ok) {
        ui.alert(
          "Chưa đổi được điểm",
          res.code === "INSUFFICIENT_POINTS"
            ? "Số điểm hiện có không đủ để đổi ưu đãi này."
            : res.message || "Vui lòng thử lại.",
          "🎯",
        );
        return false;
      }
      const v = mapWalletVoucher(res.data?.voucher);
      up((p) => ({
        points: res.data?.points ?? p.points,
        myVouchers: v
          ? [v, ...p.myVouchers.filter((x) => x.code !== v.code)]
          : p.myVouchers,
      }));
      ui.toast(v ? `Đã nhận mã giảm giá ${v.code}` : "Đổi điểm thành công", "🎁");
      syncFromBackend(null, true);
      return true;
    },

    // Thông báo
    // id: 1 id hoặc mảng id (cả nhóm thông báo của cùng một đơn).
    readNotif: (id) => {
      const ids = new Set(Array.isArray(id) ? id : [id]);
      s.notifications
        .filter((x) => ids.has(x.id) && x.dbNotificationId && !x.read)
        .forEach((x) =>
          hrmssApi.markNotificationRead(x.dbNotificationId).catch(() => {}),
        );
      up((p) => ({
        notifications: p.notifications.map((x) =>
          ids.has(x.id) ? { ...x, read: true } : x,
        ),
      }));
    },
    readAll: () => {
      hrmssApi.markAllNotificationsRead().catch(() => {});
      up((p) => ({
        notifications: p.notifications.map((n) => ({ ...n, read: true })),
      }));
    },
    clearAllNotifs: () => {
      const cur = s.notifications || [];
      const preview = clearReadNotifications(cur);
      if (preview.removedCount === 0) {
        ui.toast("Không có thông báo đã đọc để dọn", "ℹ️");
        return;
      }
      up((p) => {
        const res = clearReadNotifications(
          p.notifications || [],
          preview.clearedAt,
        );
        return {
          notifications: res.remaining,
          notifClearedAt: Math.max(p.notifClearedAt || 0, res.clearedAt),
          notifKeptIds: res.keptIds,
        };
      });
      ui.toast(
        preview.remaining.length > 0
          ? `Đã xoá ${preview.removedCount} thông báo đã đọc (giữ lại ${preview.remaining.length} chưa đọc)`
          : `Đã dọn sạch ${preview.removedCount} thông báo đã đọc`,
      );
    },

    // Tìm kiếm
    addSearch: (q) => {
      const t = q.trim();
      if (!t) return;
      up((p) => ({
        searches: [t, ...p.searches.filter((x) => x !== t)].slice(0, 8),
      }));
    },
    clearSearches: () => up(() => ({ searches: [] })),

    logout: () => {
      authIdRef.current = null;
      clearSessionCaches();
      disconnectSocket();
      hrmssApi.logout();
      clearSession();
      resetTransientUiState();
      up((p) => signedOutState(p));
      setStack([]);
      setTab("home");
      ui.toast("Đã đăng xuất");
    },
    // Xoá tài khoản: DELETE /auth/me (cần mật khẩu). Server xoá xong mới xoá dữ liệu trên máy.
    deleteAccount: async (password) => {
      if (!password) {
        ui.alert(
          "Thiếu mật khẩu",
          "Nhập mật khẩu để xác nhận xoá tài khoản.",
          "🔐",
        );
        return false;
      }
      const res = await hrmssApi.deleteMyAccount(password);
      if (!res.ok) {
        const msg = {
          UNAUTHENTICATED: "Mật khẩu không đúng.",
          HAS_OPEN_REQUESTS:
            "Bạn còn đơn đang xử lý. Hoàn thành hoặc huỷ các đơn đó trước khi xoá tài khoản.",
        }[res.code];
        ui.alert(
          "Không xoá được tài khoản",
          msg || (res.status > 0 ? res.message : networkError(res)),
          "⚠️",
        );
        return false;
      }
      authIdRef.current = null;
      const currentId = s.auth?.id;
      if (currentId) deleteAccountById(currentId);
      clearSessionCaches();
      disconnectSocket();
      hrmssApi.logout();
      clearSession();
      resetTransientUiState();
      up((p) => {
        // Tài khoản đã xoá: bỏ luôn dữ liệu riêng trên máy (giỏ hàng, yêu thích) của nó.
        const next = signedOutState(p);
        const key = customerProfileKey(p.auth);
        if (key) delete next.customerProfiles[key];
        return next;
      });
      setStack([]);
      setTab("home");
      ui.toast("Đã xoá tài khoản", "🗑️");
      return true;
    },
    toggleSound: () => {
      const next = toggleSoundMuted();
      setSoundMutedState(next);
      ui.toast(
        next ? "Đã tắt âm thanh thông báo" : "Đã bật âm thanh thông báo",
        next ? "bell-off" : "bell",
      );
      return !next;
    },
    isSoundMuted: () => soundMutedState,
    // Socket.IO helpers
    joinOrderRoom,
    leaveOrderRoom,
  };
  // Chống bấm đúp: cùng một thao tác ghi trên cùng một đơn đang chạy thì lần bấm sau bị bỏ qua
  // (tránh đặt 2 đơn, nhận việc 2 lần, xác nhận trả tiền 2 lần...). Dùng ref nên chặn được cả 2 lần bấm trong cùng 1 nhịp.
  const NULL_DUPE_ACTIONS = new Set(["placeOrder", "requestWarranty", "checkWarrantyEligibility"]);
  [
    "placeOrder",
    "acceptJob",
    "declineJob",
    "releaseJob",
    "confirmPayment",
    "switchPaymentMethod",
    "respondQuote",
    "submitQuote",
    "submitExternalPartsActualPrice",
    "startRepairWithoutQuote",
    "completeJob",
    "cancelOrder",
    "rateOrder",
    "requestWarranty",
    "checkWarrantyEligibility",
    "redeem",
    "remindQuote",
    "startTravel",
    "arrive",
    "requestFollowUp",
    "rejectWarrantyAsOutOfWarranty",
    "uploadPartReceipt",
    "confirmCashReceived",
  ].forEach((name) => {
    const fn = a[name];
    if (typeof fn !== "function") return;
    a[name] = async (...args) => {
      const key = `${name}:${typeof args[0] === "object" ? "new" : args[0]}`;
      if (inFlight.current.has(key)) {
        if (name === "releaseJob") return { ok: false };
        if (NULL_DUPE_ACTIONS.has(name)) return null;
        return false;
      }
      inFlight.current.add(key);
      const token = typeof args[0] === "string" ? { code: args[0] } : null;
      if (token) {
        actionCodeStackRef.current.push(token);
        actionCodeRef.current = token.code;
      }
      try {
        return await fn(...args);
      } finally {
        inFlight.current.delete(key);
        if (token) {
          const stack = actionCodeStackRef.current;
          const idx = stack.lastIndexOf(token);
          if (idx >= 0) stack.splice(idx, 1);
          actionCodeRef.current = stack.length ? stack[stack.length - 1].code : null;
        }
      }
    };
  });

  const myCode = s.techProfile?.code || TECH_ME.code;
  const custPhone = s.auth?.role === "customer" ? s.auth.phone : null;
  const custAccId = s.auth?.role === "customer" ? s.auth.id : null;
  const visibleCustomerOrders = useMemo(
    () => (s.auth?.role === "customer"
      ? s.orders.filter((o) => isOrderOfCustomer(o, custPhone, custAccId))
      : s.orders),
    [s.auth?.role, s.orders, custPhone, custAccId],
  );
  const viewS = useMemo(
    () => (s.auth?.role === "customer"
      ? { ...s, orders: visibleCustomerOrders, soundMuted: soundMutedState }
      : { ...s, soundMuted: soundMutedState }),
    [s, visibleCustomerOrders, soundMutedState],
  );
  const meTech = s.techProfile || TECH_ME;

  const derived = useMemo(() => ({
    address,
    cartCount: s.cart.reduce((sum, it) => sum + it.qty, 0),
    // Số chưa đọc đếm theo nhóm (mỗi đơn 1 thông báo) cho khớp danh sách hiển thị.
    unread: latestNotifPerOrder(s.notifications).filter((n) => !n.read).length,
    activeOrders: visibleCustomerOrders.filter(isActiveOrder),
    // Phía thợ
    techUnread: latestNotifPerOrder(s.techNotifs || []).filter((n) => !n.read)
      .length,
    newJobs: s.orders
      .filter((o) => {
        if (o.status !== "pending") return false;
        if (declinedFor(s, myCode).includes(o.code)) return false;
        if (isOfferExpired(o, nowTick)) return false; // quá hạn tiếp nhận -> không hiện cho thợ
        return true;
      })
      .sort((a, b) => {
        const ma = matchJobForTech(a, meTech);
        const mb = matchJobForTech(b, meTech);
        if (mb.matchScore !== ma.matchScore)
          return mb.matchScore - ma.matchScore;
        return (b.createdAt || 0) - (a.createdAt || 0);
      }),
    myJobs: s.orders.filter(
      (o) =>
        Boolean(o.dbAssignmentId) ||
        Boolean(o.assignmentActive) ||
        (Boolean(myCode) && o.tech?.code === myCode),
    ),
    workingJobs: s.orders.filter(
      (o) =>
        o.status !== "pending" &&
        (Boolean(o.dbAssignmentId) ||
          Boolean(o.assignmentActive) ||
          (Boolean(myCode) && o.tech?.code === myCode)) &&
        isActiveOrder(o),
    ),
    declinedCodes: declinedFor(s, myCode),
  }), [address, s, visibleCustomerOrders, myCode, meTech, nowTick]);

  const value = useMemo(() => ({
    s: viewS,
    a,
    nav,
    ui,
    d: derived,
    svc,
    setSvc,
    actFilter,
    setActFilter,
    warrantyQuery,
    setWarrantyQuery,
    warrantyNonce,
    pendingVoucher,
    setPendingVoucher,
  }), [viewS, derived, svc, actFilter, warrantyQuery, warrantyNonce, pendingVoucher, tab, stack, toastMsg, dialogCfg]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
