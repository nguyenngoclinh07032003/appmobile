import {
  getService,
  TECH_ME,
  MATERIALS,
  SITE_CONDITIONS,
  resolveServiceSlugFromBackend,
  resolveDbMaterialId,
  ensureServiceFromOrderItem,
  parseWarrantyDays,
} from '../constants/data';
import { toVnParts, vnDateKey } from '../utils/vnTime';
import { formatMinutesToSlotStr } from '../utils/dateTime';
import { viNotification, toVietnamese } from '../utils/viText';
import {
  parseExternalPartDesc,
  parseDepositFinalizedNotes,
  extractExternalPartLifecycle,
  normalizeExternalPartName,
  computeQuoteRangeTotals,
  sortQuotationsAsc,
  isQuotationPendingCustomer,
  isExternalPurchaseQuoteItem,
} from '../utils/externalPartsPricing';
import { parseSymptomPhotoMeta } from '../utils/symptomItems';
import { isAttendanceNotifType, defaultAttendanceNotifIcon } from '../utils/attendance';
import { normalizeAssignmentRole } from '../utils/teamHelpers';
import { extractMaterialWarrantiesFromQuotations } from '../utils/materialWarranty';

// Tên hiển thị khi đơn đã có thợ nhưng chưa tải được thông tin thợ (GET /customer/requests/:id/tracking).
const ASSIGNED_TECH_PLACEHOLDER = 'Thợ được phân công';
// Phương thức thanh toán khách chọn khi đặt (service_request.preferred_payment_method) -> nhãn trên app.
const PAYMENT_LABELS = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản VietQR',
  CARD_ATM: 'Thẻ ngân hàng nội địa',
  VNPAY: 'VNPAY',
  CARD_INTERNATIONAL: 'Thẻ quốc tế',
  GOOGLE_PAY: 'Ví điện tử Google',
  APPLE_PAY: 'Ví điện tử Apple',
  PAYOS: 'Cổng thanh toán PayOS',
};
export const paymentLabelOf = (method) => PAYMENT_LABELS[String(method || '').toUpperCase()] || 'Tiền mặt';
const materialPriceOf = (materialId) => MATERIALS.find((m) => m.dbId === Number(materialId))?.price ?? 0;
const isKnownWarehouseMaterialName = (name) => Boolean(name && resolveDbMaterialId(null, name));
const ts = (iso) => (iso ? new Date(iso).getTime() : Date.now());

const pad = (n) => String(n).padStart(2, '0');

// Ngày / khung giờ hiển thị tính theo giờ Việt Nam (GMT+7) cố định — khớp buildPreferredTimeIso (+07:00), không phụ
// thuộc múi giờ của máy.
export const formatDateLabelFromIso = (isoStr) => {
  const p = toVnParts(isoStr ? new Date(isoStr) : new Date());
  if (!p) return 'Hôm nay';
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
};

export const formatDateKeyFromIso = (isoStr) => {
  const p = isoStr ? toVnParts(new Date(isoStr)) : null;
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : vnDateKey(Date.now());
};

export const formatSlotFromIso = (isoStr) => {
  const p = isoStr ? toVnParts(new Date(isoStr)) : null;
  if (!p) return '08h00 - 10h00';
  const h = p.hour;
  const m = p.minute || 0;
  return formatMinutesToSlotStr(h * 60 + m);
};

// Giờ hẹn gửi server (giờ VN +07:00, giữ đủ giờ:phút của khung). Dữ liệu sai -> null (KHÔNG tự lấy giờ hiện tại,
// vì giờ hiện tại đã là quá khứ khi tới server -> đơn bị từ chối / tự huỷ).
export const buildPreferredTimeIso = (dateKey, slot) => {
  try {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return null;
    const m = /(\d{1,2})\s*[h:](\d{2})?/i.exec(String(slot || ''));
    if (!m) return null;
    const hourNum = Number(m[1]);
    const minNum = m[2] != null ? Number(m[2]) : 0;
    if (!Number.isFinite(hourNum) || hourNum > 23 || !Number.isFinite(minNum) || minNum > 59) return null;
    const d = new Date(`${dateKey}T${pad(hourNum)}:${pad(minNum)}:00+07:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch (e) {
    return null;
  }
};

export const extractAreaFromAddress = (addressText = '') => {
  const full = String(addressText || '').trim();
  if (!full) return 'Hà Nội';
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(', ');
  return parts[0] || 'Hà Nội';
};

export const mapBackendAddressToApp = (row) => {
  if (!row) return null;
  const full = String(row.address_text || '').trim();
  const lat = row.latitude != null && row.latitude !== '' && Number.isFinite(Number(row.latitude))
    ? Number(row.latitude)
    : null;
  const lng = row.longitude != null && row.longitude !== '' && Number.isFinite(Number(row.longitude))
    ? Number(row.longitude)
    : null;
  return {
    id: `addr-db-${row.address_id}`,
    dbAddressId: Number(row.address_id) || row.address_id,
    name: row.contact_name || 'Khách hàng',
    phone: row.contact_phone || '',
    area: row.ward_name || extractAreaFromAddress(full),
    wardCode: row.ward_code ?? null,
    wardName: row.ward_name ?? null,
    full,
    lat,
    lng,
    isDefault: Boolean(row.is_default),
  };
};

// Trạng thái backend -> trạng thái app. Trạng thái lạ / thiếu (backend thêm trạng thái mới) trả `fallback`
// (mặc định 'confirmed' — trạng thái trung tính, KHÔNG phải 'pending' để không lọt vào "việc mới" của thợ).
// Dùng isKnownBackendStatus để biết có cần giữ trạng thái local trước đó hay không.
const mapKnownStatus = (requestStatus, visitStatus, hasApprovedQuote = false, hasPendingQuote = false) => {
  const st = String(requestStatus || '').toUpperCase();
  const vs = String(visitStatus || '').toUpperCase();
  if (st === 'RECEIVED') return 'pending';
  if (st === 'ASSIGNED') {
    if (hasPendingQuote) return 'quoted';
    if (vs === 'IN_PROGRESS') return hasApprovedQuote ? 'repairing' : 'diagnosing';
    return 'confirmed';
  }
  if (st === 'IN_PROGRESS') {
    if (hasPendingQuote) return 'quoted';
    if (hasApprovedQuote) return 'repairing';
    return 'diagnosing';
  }
  // Chờ báo giá nhưng KHÔNG có báo giá SENT (khách vừa yêu cầu báo giá lại / thợ chưa gửi được):
  // thợ cần lập lại báo giá -> 'diagnosing'; khách không thấy nút duyệt (server sẽ trả 404 QUOTATION_NOT_FOUND).
  if (st === 'DIAGNOSED_PENDING_QUOTATION') return hasPendingQuote ? 'quoted' : 'diagnosing';
  if (st === 'READY_FOR_REPAIR') return hasPendingQuote ? 'quoted' : 'repairing';
  // Luồng app: thợ bấm hoàn thành -> "Chờ thanh toán" -> khách thanh toán đủ -> "Hoàn thành".
  // App bỏ bước "Còn công nợ" và "Chờ văn phòng nghiệm thu": trả thiếu vẫn là chờ thanh toán,
  // đã thanh toán đủ (READY_FOR_ACCEPTANCE) coi như hoàn thành.
  if (st === 'PENDING_PAYMENT') return 'pending_payment';
  if (st === 'PARTIALLY_PAID_RECEIVABLE') return 'pending_payment';
  if (st === 'PENDING_REVIEW') return 'pending_payment'; // trạng thái cũ vẫn thuộc nhóm chờ thanh toán ở BE
  if (st === 'READY_FOR_ACCEPTANCE') return 'done';
  if (st === 'COMPLETED') {
    return 'done';
  }
  if (st === 'WARRANTY_PENDING') return 'warranty_pending';
  if (st === 'UNDER_WARRANTY') {
    if (hasPendingQuote) return 'quoted';
    if (vs === 'IN_PROGRESS') return hasApprovedQuote ? 'repairing' : 'diagnosing';
    if (vs === 'SCHEDULED') return 'confirmed';
    return 'repairing';
  }
  if (st === 'OUT_OF_WARRANTY') {
    if (hasPendingQuote) return 'quoted';
    if (hasApprovedQuote) return 'repairing';
    return 'out_of_warranty';
  }
  if (st.startsWith('CANCELLED')) return 'cancelled';
  return null;
};

export const isKnownBackendStatus = (requestStatus) => mapKnownStatus(requestStatus) !== null;

export const mapBackendStatusToAppStatus = (requestStatus, visitStatus, hasApprovedQuote = false, hasPendingQuote = false, fallback = 'confirmed') => (
  mapKnownStatus(requestStatus, visitStatus, hasApprovedQuote, hasPendingQuote) ?? fallback
);

export const mapBackendItemsToAppItems = (rawItems = []) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  const hasOwn = (obj, k) => Boolean(obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k));
  return rawItems.map((it) => {
    const slug = resolveServiceSlugFromBackend(it.service_id, it.service_name || it.service_name_snapshot);
    const svc = getService(slug) || ensureServiceFromOrderItem(it);
    const price = it.selected_price != null && it.selected_price !== '' ? Number(it.selected_price) : (svc?.price || 0);
    let warrantyDays;
    if (hasOwn(it, 'warranty_days')) warrantyDays = parseWarrantyDays(it.warranty_days);
    else if (hasOwn(it, 'warrantyDays')) warrantyDays = parseWarrantyDays(it.warrantyDays);
    else if (hasOwn(it, 'service_warranty_days')) warrantyDays = parseWarrantyDays(it.service_warranty_days);
    else if (hasOwn(it.service, 'warranty_days')) warrantyDays = parseWarrantyDays(it.service.warranty_days);
    else if (svc && svc.warrantyDays !== undefined) warrantyDays = svc.warrantyDays;
    return {
      id: slug,
      dbRequestServiceId: it.request_service_id || null,
      dbServiceId: it.service_id || svc?.dbId || null,
      categoryId: it.category_id ?? svc?.categoryId ?? null,
      category: svc?.category || (it.category_id ? `c${it.category_id}` : null),
      name: it.service_name || it.service_name_snapshot || svc?.name || 'Dịch vụ',
      qty: Math.max(1, Number(it.quantity) || 1),
      price,
      ...(warrantyDays !== undefined ? { warrantyDays } : {}),
    };
  });
};

export const mapBackendQuotationToAppQuote = (
  quotations = [],
  diagnoses = [],
  goodsTotal = 0,
  problemDesc = '',
  orderDiscount = 0,
  bookedItems = [],
  progressList = [],
) => {
  if (!Array.isArray(quotations) || quotations.length === 0) return null;
  const sortedQuotes = sortQuotationsAsc(quotations);
  const latestQuote = sortedQuotes[sortedQuotes.length - 1];
  const latestDiag = Array.isArray(diagnoses) && diagnoses.length > 0 ? diagnoses[diagnoses.length - 1] : null;
  const isSupplemental = latestQuote.quotation_type === 'SUPPLEMENTAL';

  const bookedReqSvcIds = new Set(
    (bookedItems || [])
      .map((it) => String(it.dbRequestServiceId ?? it.request_service_id ?? ''))
      .filter(Boolean),
  );
  const bookedSvcIds = new Set(
    (bookedItems || [])
      .map((it) => String(it.dbServiceId ?? it.service_id ?? (/^s([1-9]\d*)$/.exec(String(it.id || ''))?.[1] || '')))
      .filter(Boolean),
  );
  const bookedNames = new Set(
    (bookedItems || []).map((it) => String(it.name || it.service_name || '').trim().toLowerCase()).filter(Boolean),
  );

  const isBookedItem = (qi, quoteIsSupplemental = isSupplemental) => {
    if (parseExternalPartDesc(qi.description_snapshot)) return false;
    if (qi.item_type === 'MATERIAL' || qi.material_id || qi.is_external_purchase) return false;
    if (qi.request_service_id) {
      return bookedReqSvcIds.size === 0 || bookedReqSvcIds.has(String(qi.request_service_id));
    }
    if (quoteIsSupplemental) return false;
    if (qi.service_id && bookedSvcIds.has(String(qi.service_id))) return true;
    const nameClean = String(qi.description_snapshot || '').trim().toLowerCase();
    return Boolean(nameClean && bookedNames.has(nameClean));
  };

  const extractQuoteItemReceipt = (qi) => {
    const att = qi?.receipt_attachment && typeof qi.receipt_attachment === 'object' ? qi.receipt_attachment : null;
    const receiptId = qi?.receipt_attachment_id ?? att?.attachment_id ?? att?.id ?? null;
    const receiptUrl =
      qi?.receipt_url ||
      qi?.receipt_image_url ||
      att?.image_url ||
      att?.file_url ||
      att?.url ||
      att?.uri ||
      null;
    return { receiptId, receiptUrl };
  };

  const mapQuoteItem = (qi, quoteIsSupplemental = isSupplemental) => {
    const extMeta = parseExternalPartDesc(qi.description_snapshot);
    const booked = isBookedItem(qi, quoteIsSupplemental);
    const { receiptId, receiptUrl } = extractQuoteItemReceipt(qi);
    const w0 = Array.isArray(qi.warranties) && qi.warranties.length ? qi.warranties[0] : null;
    const sn = qi.serial_number || w0?.serial_number || null;
    const wDaysRaw = qi.warranty_days ?? w0?.warranty_days;
    const wCode = qi.external_warranty_code || w0?.external_warranty_code || null;
    // Mã bảo hành linh kiện server tự sinh (BHLK-...): lấy dòng mới nhất có mã (đổi linh kiện vẫn giữ nguyên mã).
    const lkCode = Array.isArray(qi.warranties)
      ? ([...qi.warranties].reverse().find((w) => w && w.warranty_code)?.warranty_code || null)
      : (qi.warranty_code || null);
    const warrantyExtra = {
      ...(sn ? { serialNumber: sn } : {}),
      ...(wDaysRaw != null && wDaysRaw !== '' ? { warrantyDays: Number(wDaysRaw) } : {}),
      ...(wCode ? { externalWarrantyCode: wCode } : {}),
      ...(lkCode ? { warrantyCode: lkCode } : {}),
      ...(Array.isArray(qi.warranties) && qi.warranties.length ? { warranties: qi.warranties } : {}),
    };
    if (extMeta?.kind === 'estimated_external') {
      return {
        type: 'part',
        matId: qi.material_id ? `m-db-${qi.material_id}` : undefined,
        name: extMeta.cleanName,
        unit: 'cái',
        qty: Number(qi.quantity) || 1,
        price: Number(qi.unit_price) || 0,
        dbItemId: qi.quotation_item_id || null,
        isCustom: true,
        isEstimatedRange: true,
        minPrice: extMeta.minPrice,
        maxPrice: extMeta.maxPrice,
        alreadyBilledUnitPrice: Number(qi.unit_price) || 0,
        receiptId,
        ...(receiptUrl ? { receiptUrl } : {}),
        ...warrantyExtra,
        isOriginal: false,
      };
    }
    if (extMeta?.kind === 'finalized_external') {
      const unitP = Number(qi.unit_price) || 0;
      const priorDeposit = extMeta.priorDeposit || 0;
      const qty = Math.max(1, Number(qi.quantity) || 1);
      const depQty = extMeta.priorDepositQty != null ? Math.max(1, Number(extMeta.priorDepositQty) || 1) : qty;
      const actualPrice = priorDeposit > 0 ? Math.round((priorDeposit * depQty + unitP * qty) / qty) : unitP;
      return {
        type: 'part',
        matId: qi.material_id ? `m-db-${qi.material_id}` : undefined,
        name: extMeta.cleanName,
        unit: 'cái',
        qty,
        origQty: depQty,
        price: unitP,
        dbItemId: qi.quotation_item_id || null,
        isCustom: true,
        isFinalizedExternal: true,
        minPrice: extMeta.minPrice,
        maxPrice: extMeta.maxPrice,
        priorDeposit,
        actualPrice,
        receiptId,
        ...(receiptUrl ? { receiptUrl } : {}),
        ...warrantyExtra,
        isOriginal: false,
      };
    }
    const qtyNum = Math.max(1, Number(qi.quantity) || 1);
    const rawUnit = qi.unit_price ?? qi.price ?? qi.unit_price_snapshot;
    const parsedUnit = rawUnit != null && rawUnit !== '' ? Number(rawUnit) : NaN;
    const rawLineTotal = qi.total_price ?? qi.line_total;
    const fallbackFromLineTotal = rawLineTotal != null && rawLineTotal !== ''
      ? (Number(rawLineTotal) || 0) / qtyNum
      : 0;
    const catalogPrice = qi.material_id ? materialPriceOf(qi.material_id) : 0;
    const resolvedPrice =
      Number.isFinite(parsedUnit) && parsedUnit > 0
        ? parsedUnit
        : (fallbackFromLineTotal > 0
          ? fallbackFromLineTotal
          : (qi.material_id && catalogPrice > 0 ? catalogPrice : (Number.isFinite(parsedUnit) ? parsedUnit : 0)));
    const needsPriceInput = Boolean(qi.item_type === 'MATERIAL' && qi.material_id && catalogPrice <= 0);
    return {
      type: qi.item_type === 'MATERIAL' ? 'part' : 'service',
      matId: qi.material_id ? `m-db-${qi.material_id}` : undefined,
      name: qi.description_snapshot || 'Hạng mục dịch vụ',
      unit: qi.item_type === 'MATERIAL' ? 'cái' : 'lần',
      qty: qtyNum,
      price: resolvedPrice,
      dbItemId: qi.quotation_item_id || null,
      isCustom: isExternalPurchaseQuoteItem(qi, { isKnownWarehouseName: isKnownWarehouseMaterialName }), // linh kiện thợ mua ngoài
      receiptId,
      ...(receiptUrl ? { receiptUrl } : {}),
      ...warrantyExtra,
      isOriginal: booked,
      ...(needsPriceInput ? { needsPriceInput: true } : {}),
    };
  };

  const rawLines = (latestQuote.items || []).map((qi) => mapQuoteItem(qi, isSupplemental));

  const disc = Math.max(0, Number(orderDiscount) || 0);
  const bookedBase = Number(goodsTotal) || 0;
  let lines = rawLines;
  if (isSupplemental) {
    const hasOriginal = rawLines.some((l) => l.isOriginal);
    if (!hasOriginal && Array.isArray(bookedItems) && bookedItems.length > 0) {
      const originalLines = bookedItems.map((it, idx) => ({
        key: it.id || `orig_${idx}`,
        type: 'service',
        name: it.name || 'Dịch vụ',
        unit: 'lần',
        qty: Math.max(1, Number(it.qty) || 1),
        price: bookedBase <= 0 ? 0 : (Number(it.price) || 0),
        isOriginal: true,
      }));
      lines = [...originalLines, ...rawLines];
    }
  }
  const isApproved = latestQuote.quotation_status === 'APPROVED' || latestQuote.customer_decision === 'APPROVED';
  const isRejected = latestQuote.quotation_status === 'REJECTED' || latestQuote.customer_decision === 'REJECTED';

  // Tổng các báo giá đã duyệt như backend (shared/pricing/bill.js): báo giá ban đầu thay tiền đặt, phát sinh cộng thêm.
  const approvedList = sortedQuotes.filter((q) => q.quotation_status === 'APPROVED' || q.customer_decision === 'APPROVED');
  const sumOf = (list) => list.reduce((s, q) => s + (Number(q.total_amount) || 0), 0);
  const initialApproved = approvedList.filter((q) => q.quotation_type !== 'SUPPLEMENTAL');
  const latestInitialApproved = initialApproved.length ? initialApproved[initialApproved.length - 1] : null;
  const initialBase = latestInitialApproved
    ? Math.max(0, (Number(latestInitialApproved.total_amount) || 0) - disc)
    : bookedBase;
  const approvedTotal = approvedList.length
    ? initialBase + sumOf(approvedList.filter((q) => q.quotation_type === 'SUPPLEMENTAL'))
    : null;
  const approvedLifecycle = extractExternalPartLifecycle(approvedList, progressList);
  const depositSettledNames = parseDepositFinalizedNotes(progressList);
  const approvedPendingEst = approvedLifecycle.pendingExternalEstimates || [];
  const approvedEstMinDelta = approvedPendingEst.reduce(
    (s, est) => s + Math.max(0, (Number(est.minPrice) || 0) - (Number(est.alreadyBilledUnitPrice) || 0)) * Math.max(1, Number(est.qty) || 1),
    0,
  );
  const approvedEstMaxDelta = approvedPendingEst.reduce(
    (s, est) => s + Math.max(0, (Number(est.maxPrice) || 0) - (Number(est.alreadyBilledUnitPrice) || 0)) * Math.max(1, Number(est.qty) || 1),
    0,
  );
  const approvedHasEstimatedRange = approvedTotal != null && approvedPendingEst.length > 0;
  const approvedTotalMin = approvedTotal != null ? approvedTotal + approvedEstMinDelta : null;
  const approvedTotalMax = approvedTotal != null ? approvedTotal + approvedEstMaxDelta : null;

  // Khi có báo giá đợt trước đã duyệt (vd: vật tư kho đợt 1 + phát sinh/chốt giá đợt 2), gộp dòng phát sinh để hiển thị & cộng tổng đủ mọi hạng mục.
  const earlierApprovedQuotes = approvedList.filter((q) => q !== latestQuote);
  let includesPriorApprovedLines = false;
  let initialServiceDelta = 0;
  if (earlierApprovedQuotes.length > 0 && (isApproved || isSupplemental)) {
    const earlierApprovedExtras = earlierApprovedQuotes
      .flatMap((q) => {
        const qIsSupp = q.quotation_type === 'SUPPLEMENTAL';
        return (q.items || []).map((qi) => mapQuoteItem(qi, qIsSupp)).filter((l) => !l.isOriginal);
      })
      .map((l) => ({ ...l, isPriorApproved: true }));
    if (earlierApprovedExtras.length > 0) includesPriorApprovedLines = true;
    const latestInitMapped = latestInitialApproved
      ? (latestInitialApproved.items || []).map((qi) => mapQuoteItem(qi, false))
      : null;
    const latestInitOrig = latestInitMapped ? latestInitMapped.filter((l) => l.isOriginal) : [];
    const origPart = isSupplemental
      ? (latestInitOrig.length > 0 ? latestInitOrig : lines.filter((l) => l.isOriginal))
      : rawLines.filter((l) => l.isOriginal);
    if (latestInitOrig.length > 0) {
      const initExtrasSum = latestInitMapped
        .filter((l) => !l.isOriginal)
        .reduce((sum, l) => sum + (Number(l.price) || 0) * Math.max(1, Number(l.qty) || 1), 0);
      initialServiceDelta = (initialBase - initExtrasSum) - bookedBase;
    }
    const nonOrigCurrent = isRejected ? [] : rawLines.filter((l) => !l.isOriginal);
    const merged = [...origPart, ...earlierApprovedExtras, ...nonOrigCurrent];

    const finalizedCounts = new Map();
    merged.forEach((l) => {
      if (l.isFinalizedExternal) {
        const k = normalizeExternalPartName(l.name);
        finalizedCounts.set(k, (finalizedCounts.get(k) || 0) + 1);
      }
    });
    const usedHide = new Map();
    lines = merged.filter((l) => {
      if (!l.isEstimatedRange) return true;
      const k = normalizeExternalPartName(l.name);
      const avail = finalizedCounts.get(k) || 0;
      const used = usedHide.get(k) || 0;
      if (used < avail) {
        usedHide.set(k, used + 1);
        return false;
      }
      return true;
    });
  } else if (isRejected) {
    // Báo giá đầu bị từ chối và chưa có báo giá nào đã duyệt: chỉ giữ dòng dịch vụ ban đầu.
    lines = isSupplemental ? lines.filter((l) => l.isOriginal) : [];
  }

  if (depositSettledNames.size > 0) {
    lines = lines.map((l) => {
      if (l.isEstimatedRange && depositSettledNames.has(normalizeExternalPartName(l.name))) {
        const settledPrice = Number(l.price) > 0 ? Number(l.price) : (Number(l.minPrice) || 0);
        return {
          ...l,
          price: settledPrice,
          actualPrice: settledPrice,
          priorDeposit: settledPrice,
          origQty: l.qty,
          isEstimatedRange: false,
          isFinalizedExternal: true,
          settledAtDeposit: true,
        };
      }
      return l;
    });
  }

  const rawExtraLines = isRejected ? [] : rawLines.filter((l) => !l.isOriginal);
  const rawExtraTotal = rawExtraLines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const signedApprovedDelta = approvedTotal != null ? (approvedTotal - bookedBase) : 0;
  const approvedExtrasTotal = approvedTotal != null ? Math.max(0, signedApprovedDelta) : 0;
  const priorApprovedExtra = !isApproved && approvedTotal != null ? approvedExtrasTotal : 0;
  const effectivePriorExtra = (earlierApprovedQuotes.length > 0 && (isApproved || isSupplemental))
    ? initialServiceDelta
    : (!isApproved && approvedTotal != null ? signedApprovedDelta : 0);
  const extraTotal = isRejected
    ? approvedExtrasTotal
    : isApproved && approvedTotal != null
      ? approvedExtrasTotal
      : isSupplemental
        ? Math.max(0, signedApprovedDelta + rawExtraTotal)
        : rawExtraTotal;

  const qTotal = isRejected
    ? (approvedTotal != null ? approvedTotal : bookedBase)
    : isApproved && approvedTotal != null
      ? approvedTotal
      : isSupplemental
        ? Math.max(0, (approvedTotal != null ? approvedTotal : bookedBase) + rawExtraTotal)
        : Math.max(0, (Number(latestQuote.total_amount) || lines.reduce((s, l) => s + l.price * l.qty, 0)) - disc);

  const quoteRange = computeQuoteRangeTotals(lines, {
    bookedBase,
    priorApprovedExtra: effectivePriorExtra,
    prodDisc: disc,
    comboDisc: 0,
    isOnSite: isSupplemental || earlierApprovedQuotes.length > 0 || !lines.some((l) => l.isOriginal),
  });

  return {
    dbQuotationId: latestQuote.quotation_id,
    quotationCode: latestQuote.quotation_code,
    quotationType: latestQuote.quotation_type || 'INITIAL',
    status: isQuotationPendingCustomer(latestQuote) ? 'SENT' : latestQuote.quotation_status,
    revisionRequested: latestQuote.quotation_status === 'REVISION_REQUESTED' || latestQuote.customer_decision === 'REVISE',
    rejectReason: toVietnamese(latestQuote.rejection_reason || latestQuote.revision_note, ''),
    approvedTotal,
    approvedExtrasTotal,
    approvedHasEstimatedRange,
    approvedTotalMin,
    approvedTotalMax,
    diagnosis: latestDiag?.findings || problemDesc || '',
    symptoms: latestDiag?.symptoms || '',
    recommendation: latestDiag?.repair_recommendation || '',
    lines,
    rawTotal: latestQuote.total_amount != null ? Number(latestQuote.total_amount) : qTotal,
    total: quoteRange.hasEstimatedRange ? quoteRange.totalMin : qTotal,
    extraAmount: quoteRange.hasEstimatedRange ? Math.max(0, quoteRange.grossTotalMin - bookedBase) : extraTotal,
    totalMin: quoteRange.totalMin,
    totalMax: quoteRange.totalMax,
    extraMin: quoteRange.extraMin,
    extraMax: quoteRange.extraMax,
    warehouseExtra: quoteRange.warehouseExtra,
    customExtraMin: quoteRange.customExtraMin,
    customExtraMax: quoteRange.customExtraMax,
    includesPriorApprovedLines,
    initialServiceDelta,
    effectivePriorExtra,
    booked: bookedBase,
    needsApproval: !isApproved,
    approved: isApproved,
    isExternalFinalization: rawLines.some((l) => l.isFinalizedExternal) && !rawLines.some((l) => l.isEstimatedRange),
    hasEstimatedRange: quoteRange.hasEstimatedRange,
    priorApprovedExtra,
    at: latestQuote.sent_at ? new Date(latestQuote.sent_at).getTime() : Date.now(),
  };
};

// Hoá đơn (GET /customer/requests/:id/bill hoặc /technician/jobs/:id/bill) -> trường tiền trên app.
// Mọi số tiền phải trả / đã trả / giảm giá lấy từ đây, app không tự tính.
export const mapBackendBill = (summary) => {
  if (!summary?.bill) return null;
  const b = summary.bill;
  return {
    amountDue: Number(b.amount_due) || 0,
    bookedAmount: Number(b.booked_amount) || 0,
    quotationTotal: b.quotation_total == null ? null : Number(b.quotation_total),
    supplementalTotal: Number(b.supplemental_total) || 0,
    tierPartDiscountPercent: Number(b.tier_part_discount_percent) || 0,
    tierPartDiscount: Number(b.tier_part_discount_amount) || 0,
    voucherDiscount: Number(b.voucher_discount_amount) || 0,
    lateDiscount: Number(b.late_discount_amount) || 0,
    paidAmount: Number(summary.paid_amount) || 0,
    remainingAmount: Number(summary.remaining_amount) || 0,
    paymentStatus: summary.payment_status || 'UNPAID', // UNPAID | PENDING | PARTIALLY_PAID | PAID | NOTHING_TO_PAY
    // Khách đã báo trả tiền mặt, chờ thợ / văn phòng xác nhận đã nhận (chưa tính là đã trả).
    cashClaimPending: Boolean(summary.cash_claim_pending),
    paymentMethod: summary.payment_method || null,
    cashToCollect: summary.cash_to_collect != null ? Number(summary.cash_to_collect) : null,
  };
};
// Đơn bảo hành mà thợ kết luận ngoài bảo hành thì tính tiền như đơn thường (backend effectiveRequestType).
const kindOf = (req) => {
  const rt = String(req?.request_type || '').toUpperCase();
  const rs = String(req?.request_status || '').toUpperCase();
  if (rt === 'WARRANTY' && !req?.out_of_warranty && rs !== 'OUT_OF_WARRANTY') return 'warranty';
  if (rt === 'FOLLOW_UP' || rt === 'FOLLOWUP') return 'followup';
  return 'normal';
};
const dateMs = (v) => (v ? new Date(v).getTime() : null);
const DAY_MS = 24 * 60 * 60 * 1000;
const resolveSiteCondition = (scId) => (scId ? (SITE_CONDITIONS.find((sc) => sc.id === scId) || null) : null);
const normalizePayMethod = (m) => {
  const u = String(m || '').trim().toUpperCase();
  if (!u) return null;
  if (u === 'BANK_TRANSFER' || u === 'VIETQR') return 'vietqr';
  if (u === 'CASH') return 'cash';
  return u.toLowerCase();
};
const resolveOrderPayment = (reqPreferred, bill) => {
  const billMethod = normalizePayMethod(bill?.paymentMethod);
  const reqMethod = normalizePayMethod(reqPreferred);
  const effective = (billMethod === 'vietqr' || billMethod === 'cash')
    ? billMethod
    : (reqMethod === 'vietqr' ? 'vietqr' : 'cash');
  const backendRaw = (billMethod === 'vietqr' || billMethod === 'cash')
    ? (billMethod === 'vietqr' ? 'BANK_TRANSFER' : 'CASH')
    : (reqPreferred || 'CASH');
  return {
    paymentMethod: effective,
    payment: paymentLabelOf(backendRaw),
    qrPaymentRequested: effective === 'vietqr',
  };
};

const parseSafetyChecklist = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean);
  } catch (_e) {
    // Chuỗi văn bản thường
  }
  return s
    .split(/\r?\n|;/)
    .map((x) => x.replace(/^[✓✔•\-\s]+/, '').trim())
    .filter(Boolean);
};

const isInternalExternalNote = (note) => /^\[Chốt VT ngoài bằng tạm tính\]/i.test(String(note || '').trim());

const mapCustomerRepairNotes = (progressList = [], reqId = '', fallbackAt = Date.now()) => (
  (Array.isArray(progressList) ? progressList : [])
    .filter((p) => p?.note && String(p.note).trim() && !isInternalExternalNote(p.note))
    .map((p, idx) => ({
      id: p.progress_id != null ? `pg-${p.progress_id}` : `pg-${reqId}-${idx}`,
      dbProgressId: p.progress_id ?? null,
      text: String(p.note).trim(),
      at: p.recorded_at ? dateMs(p.recorded_at) : fallbackAt,
    }))
);

export const extractOrderWarranty = (req, mappedItems = []) => {
  const w = req?.warranty && typeof req.warranty === 'object' ? req.warranty : null;
  const warrantyStartAt = dateMs(
    req?.warranty_start_date ??
      req?.warrantyStartDate ??
      req?.warranty_start_at ??
      w?.start_date ??
      w?.start_at ??
      w?.warranty_start_date,
  );
  const warrantyEndAt = dateMs(
    req?.warranty_end_date ??
      req?.warrantyEndDate ??
      req?.warranty_end_at ??
      w?.end_date ??
      w?.end_at ??
      w?.warranty_end_date,
  );
  const rawDays = req?.warranty_days ?? req?.warrantyDays ?? w?.warranty_days ?? w?.days;
  const parsedSrvDays = parseWarrantyDays(rawDays);
  let warrantyDays = null;
  if (typeof parsedSrvDays === 'number' && parsedSrvDays > 0) {
    warrantyDays = parsedSrvDays;
  } else if (parsedSrvDays === 0) {
    warrantyDays = 0;
  } else if (warrantyStartAt && warrantyEndAt && warrantyEndAt >= warrantyStartAt) {
    warrantyDays = Math.max(1, Math.round((warrantyEndAt - warrantyStartAt) / DAY_MS));
  } else {
    const itemDays = (mappedItems || []).map((it) => (
      it?.warrantyDays !== undefined ? it.warrantyDays : getService(it?.id)?.warrantyDays
    ));
    const positiveItemDays = itemDays.filter((d) => typeof d === 'number' && d > 0);
    if (positiveItemDays.length > 0) {
      warrantyDays = Math.max(...positiveItemDays);
    } else if (itemDays.length > 0 && itemDays.every((d) => d === 0 || d === null) && !warrantyEndAt) {
      warrantyDays = 0;
    }
  }
  const warrantyCertificateCode =
    w?.certificate_code ||
    req?.warranty_certificate_code ||
    (req?.request_code ? `BH-${req.request_code}` : null);
  return { warrantyDays, warrantyStartAt, warrantyEndAt, warrantyCertificateCode };
};

export const mergeCustomerRequestDetail = (rawReq, detailData) => {
  if (!rawReq || !detailData || typeof detailData !== 'object') return rawReq;
  const detReq = detailData.request && typeof detailData.request === 'object' ? detailData.request : detailData;
  const pickList = (a, b, fallback, singleFallback = null) =>
    (Array.isArray(a) && a.length ? a : null) ||
    (Array.isArray(b) && b.length ? b : null) ||
    (singleFallback ? [singleFallback] : null) ||
    (Array.isArray(fallback) && fallback.length ? fallback : null) ||
    (Array.isArray(a) ? a : Array.isArray(b) ? b : fallback);

  const singleQuote = detReq.latest_quotation || detReq.quotation || detailData.latest_quotation || detailData.quotation || null;
  const singleDiag = detReq.latest_diagnosis || detReq.diagnosis || detailData.latest_diagnosis || detailData.diagnosis || null;
  const mergedQuotes = pickList(detReq.quotations, detailData.quotations, rawReq.quotations, singleQuote);
  const mergedVisits = pickList(detReq.visits, detailData.visits, rawReq.visits);
  const visitDiags = (Array.isArray(mergedVisits) ? mergedVisits : [])
    .flatMap((v) => (Array.isArray(v?.diagnoses) ? v.diagnoses : (v?.diagnosis && typeof v.diagnosis === 'object' ? [v.diagnosis] : [])))
    .filter(Boolean);
  const quoteDiags = (Array.isArray(mergedQuotes) ? mergedQuotes : [])
    .map((q) => (q?.diagnosis && typeof q.diagnosis === 'object' ? q.diagnosis : null))
    .filter(Boolean);
  const nestedDiags = visitDiags.length ? visitDiags : quoteDiags;
  const mergedDiags = pickList(
    detReq.diagnoses,
    detailData.diagnoses,
    nestedDiags.length ? nestedDiags : rawReq.diagnoses,
    singleDiag,
  );
  const mergedItems = pickList(detReq.items, detailData.items, rawReq.items);
  const mergedTimeline = pickList(
    detReq.timeline || detReq.status_history,
    detailData.timeline || detailData.status_history,
    rawReq.timeline,
  );
  const detailBill = detReq.bill?.bill ? detReq.bill : (detailData.bill?.bill ? detailData.bill : undefined);

  const visitPhotos = (Array.isArray(mergedVisits) ? mergedVisits : [])
    .flatMap((v) => [...(Array.isArray(v?.attachments) ? v.attachments : []), ...(Array.isArray(v?.photos) ? v.photos : [])])
    .filter(Boolean);
  const quoteReceiptPhotos = (Array.isArray(mergedQuotes) ? mergedQuotes : [])
    .flatMap((q) => (Array.isArray(q?.items) ? q.items : []))
    .map((qi) => {
      const att = qi?.receipt_attachment && typeof qi.receipt_attachment === 'object' ? qi.receipt_attachment : null;
      const attUrl = att?.image_url || att?.file_url || att?.url || att?.uri || qi?.receipt_url || qi?.receipt_image_url || '';
      const attId = qi?.receipt_attachment_id ?? att?.attachment_id ?? att?.id ?? null;
      if (!attUrl && !att) return null;
      const cleanName = parseExternalPartDesc(qi?.description_snapshot)?.cleanName || qi?.description_snapshot || '';
      return {
        ...(att || {}),
        ...(attId != null ? { attachment_id: attId } : {}),
        ...(attUrl ? { image_url: att?.image_url || attUrl } : {}),
        evidence_type: att?.evidence_type || att?.type || 'DOCUMENT',
        description: att?.description || att?.note || (cleanName ? `Hoá đơn mua ngoài · ${cleanName}` : ''),
      };
    })
    .filter(Boolean);
  const allPhotoRows = [
    ...(Array.isArray(detReq.attachments) ? detReq.attachments : []),
    ...(Array.isArray(detReq.initial_attachments) ? detReq.initial_attachments : []),
    ...(Array.isArray(detReq.evidence) ? detReq.evidence : []),
    ...(Array.isArray(detReq.photos) ? detReq.photos : []),
    ...(Array.isArray(detailData.attachments) ? detailData.attachments : []),
    ...(Array.isArray(detailData.initial_attachments) ? detailData.initial_attachments : []),
    ...(Array.isArray(detailData.evidence) ? detailData.evidence : []),
    ...(Array.isArray(detailData.photos) ? detailData.photos : []),
    ...visitPhotos,
    ...quoteReceiptPhotos,
    ...(Array.isArray(rawReq._detailAttachments) ? rawReq._detailAttachments : []),
  ].filter(Boolean);
  const rawPhotoCandidates = allPhotoRows.filter(
    (row) =>
      !row.procedure_step_id || ['AFTER_REPAIR', 'DOCUMENT'].includes(String(row.evidence_type || '').toUpperCase()),
  );
  const rawStepOnlyPhotos = allPhotoRows.filter(
    (row) =>
      row.procedure_step_id && !['AFTER_REPAIR', 'DOCUMENT'].includes(String(row.evidence_type || '').toUpperCase()),
  );

  const dedupPhotos = [];
  const seenPhotoKeys = new Set();
  rawPhotoCandidates.forEach((row) => {
    const uri = row.image_url || row.file_url || row.url || row.uri || '';
    const key = row.attachment_id != null ? `id:${row.attachment_id}` : (uri ? `uri:${uri}` : null);
    if (!key || seenPhotoKeys.has(key)) return;
    seenPhotoKeys.add(key);
    dedupPhotos.push(row);
  });
  const dedupStepPhotos = [];
  const seenStepKeys = new Set();
  rawStepOnlyPhotos.forEach((row) => {
    const uri = row.image_url || row.file_url || row.url || row.uri || '';
    const key = row.attachment_id != null ? `id:${row.attachment_id}` : (uri ? `uri:${uri}` : null);
    if (!key || seenStepKeys.has(key)) return;
    seenStepKeys.add(key);
    dedupStepPhotos.push(row);
  });

  return {
    ...rawReq,
    ...detReq,
    request_status: detReq.request_status || rawReq.request_status,
    items: mergedItems,
    quotations: mergedQuotes,
    diagnoses: mergedDiags,
    visits: mergedVisits,
    timeline: mergedTimeline,
    progress: detReq.progress ?? detailData.progress ?? rawReq.progress,
    procedure: detReq.procedure ?? detailData.procedure ?? rawReq.procedure,
    technician: detReq.technician || detailData.technician || rawReq.technician,
    support_technicians: detReq.support_technicians ?? detailData.support_technicians ?? rawReq.support_technicians,
    journey: rawReq.journey || detReq.journey || detailData.journey,
    ...(detReq.warranty || detailData.warranty || rawReq.warranty
      ? { warranty: detReq.warranty || detailData.warranty || rawReq.warranty }
      : {}),
    ...((detReq.warranty_days ?? detailData.warranty_days ?? rawReq.warranty_days) !== undefined
      ? { warranty_days: detReq.warranty_days ?? detailData.warranty_days ?? rawReq.warranty_days }
      : {}),
    ...((detReq.warranty_start_date ?? detailData.warranty_start_date ?? rawReq.warranty_start_date) !== undefined
      ? { warranty_start_date: detReq.warranty_start_date ?? detailData.warranty_start_date ?? rawReq.warranty_start_date }
      : {}),
    ...((detReq.warranty_end_date ?? detailData.warranty_end_date ?? rawReq.warranty_end_date) !== undefined
      ? { warranty_end_date: detReq.warranty_end_date ?? detailData.warranty_end_date ?? rawReq.warranty_end_date }
      : {}),
    ...(dedupPhotos.length ? { _detailAttachments: dedupPhotos } : {}),
    ...(dedupStepPhotos.length ? { _procedureAttachments: dedupStepPhotos } : {}),
    ...(rawReq.bill || detailBill ? { bill: rawReq.bill || detailBill } : {}),
  };
};

export const mapBackendCustomerRequestToOrder = (req, customerPhoneFallback = '') => {
  if (!req) return null;
  const orderKind = kindOf(req);
  const isFreeOrder = orderKind === 'warranty' || orderKind === 'followup';
  const techInfo = req.technician || null;
  const techName = techInfo?.full_name || ASSIGNED_TECH_PLACEHOLDER;
  const items = mapBackendItemsToAppItems(req.items || []);
  const itemsGoods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const isOowReq = Boolean(req.out_of_warranty || String(req.request_status || '').toUpperCase() === 'OUT_OF_WARRANTY');
  const hasZeroOowGoods = Boolean(isOowReq && req.goods_amount != null && Number(req.goods_amount) === 0);
  const goods = (isFreeOrder || hasZeroOowGoods) ? 0 : (Number(req.goods_amount) > 0 ? Number(req.goods_amount) : itemsGoods);
  const visits = req.visits || [];
  const latestVisit = visits[visits.length - 1] || null;
  const progressList = req.progress || latestVisit?.progress || [];
  const productDiscount = isFreeOrder ? 0 : (Number(req.product_discount_amount) || Number(req.bill?.bill?.product_discount_amount) || 0);
  const comboDiscount = isFreeOrder ? 0 : (Number(req.combo_discount_amount) || Number(req.bill?.bill?.combo_discount_amount) || 0);
  const booked = isFreeOrder ? 0 : Math.max(0, goods - productDiscount - comboDiscount);
  const wpDiagMatch = /Tình trạng:\s*(.+?)(?:\.\s*Thiết bị hoạt động ổn định|\.\s*$|$)/i.exec(latestVisit?.work_performed || '');
  const effectiveDiagnoses =
    Array.isArray(req.diagnoses) && req.diagnoses.length > 0
      ? req.diagnoses
      : wpDiagMatch?.[1]?.trim()
        ? [{
          symptoms: '',
          findings: wpDiagMatch[1].trim(),
          repair_recommendation: '',
          recorded_at: latestVisit?.actual_end || latestVisit?.scheduled_start || req.updated_at,
        }]
        : [];
  const latestDiag = effectiveDiagnoses.length > 0 ? effectiveDiagnoses[effectiveDiagnoses.length - 1] : null;
  const diagnosisReport = latestDiag
    ? {
      symptoms: latestDiag.symptoms || '',
      diagnosis: latestDiag.findings || '',
      recommendation: latestDiag.repair_recommendation || '',
      at: ts(latestDiag.recorded_at),
    }
    : null;
  const quote = mapBackendQuotationToAppQuote(
    req.quotations || [],
    effectiveDiagnoses,
    booked,
    req.problem_description,
    productDiscount + comboDiscount,
    items,
    progressList,
  );
  const hasPendingQuote = (req.quotations || []).some(isQuotationPendingCustomer);
  const anyQuoteApproved = (req.quotations || []).some(
    (q) => q.quotation_status === 'APPROVED' || q.customer_decision === 'APPROVED',
  );
  const sortedReqQuotes = sortQuotationsAsc(req.quotations || []);
  const latestReqQuote = sortedReqQuotes[sortedReqQuotes.length - 1] || null;
  const latestQuoteTs = latestReqQuote ? ts(latestReqQuote.updated_at || latestReqQuote.sent_at) : 0;
  const diagAfterQuote = Boolean(latestDiag && latestDiag.recorded_at && ts(latestDiag.recorded_at) > latestQuoteTs);
  const noQuoteOverride = Boolean(latestDiag && latestDiag.needs_quotation === false && diagAfterQuote);
  const decidedNoQuote = noQuoteOverride || ((
    (Boolean(latestDiag) && latestDiag.needs_quotation !== true) ||
    req.needs_quotation === false ||
    latestVisit?.needs_quotation === false
  ) && !quote?.revisionRequested);
  const statusUnknown = !isKnownBackendStatus(req.request_status);
  let status = mapBackendStatusToAppStatus(
    req.request_status,
    latestVisit?.visit_status,
    anyQuoteApproved || noQuoteOverride || (decidedNoQuote && !quote?.revisionRequested),
    hasPendingQuote,
  );
  // "Đang đến": hành trình thật từ GET /customer/requests/:id/tracking.
  const journey = req.journey || null;
  if (status === 'confirmed' && journey?.on_the_way) status = 'onway';
  if (
    String(req.request_status || '').toUpperCase() === 'DIAGNOSED_PENDING_QUOTATION' &&
    !hasPendingQuote &&
    quote?.revisionRequested &&
    quote?.quotationType === 'INITIAL' &&
    !journey?.arrived_at &&
    !journey?.travel_started_at &&
    !['IN_PROGRESS', 'COMPLETED'].includes(String(latestVisit?.visit_status || '').toUpperCase())
  ) {
    status = 'confirmed';
  }
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : Date.now();
  const preferredIso = req.preferred_time || latestVisit?.scheduled_start || req.created_at;
  const fullAddr = req.address?.address_text || req.service_address_snapshot || 'Hà Nội';
  const contactPhone = (req.address?.contact_phone && !String(req.address.contact_phone).includes('*'))
    ? req.address.contact_phone
    : (customerPhoneFallback || req.address?.contact_phone || '');
  const bill = mapBackendBill(req.bill);
  // Khách đã thanh toán đủ theo hoá đơn server -> hoàn thành luôn (không chờ văn phòng nghiệm thu).
  if (status === 'pending_payment' && bill && ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus)) status = 'done';

  const cancelHistory = (req.timeline || []).find((h) => String(h.new_status || '').toUpperCase().startsWith('CANCELLED'));
  // Phí kiểm tra khi huỷ: chỉ lấy từ hoá đơn server (amount_due của đơn huỷ), không đoán.
  const inspectionFee = status === 'cancelled' && bill ? bill.amountDue : 0;

  const timeline = Array.isArray(req.timeline)
    ? req.timeline.filter((h) => isKnownBackendStatus(h.new_status))
    : [];
  const history = timeline.length > 0
    ? timeline.map((h) => ({
      status: mapBackendStatusToAppStatus(
        h.new_status,
        null,
        anyQuoteApproved,
        String(h.new_status || '').toUpperCase() === 'DIAGNOSED_PENDING_QUOTATION',
      ),
      at: h.changed_at ? new Date(h.changed_at).getTime() : createdAt,
      note: toVietnamese(h.reason, ''),
    }))
    : [{ status, at: createdAt }];

  const isDone = status === 'done';
  const { warrantyDays, warrantyStartAt, warrantyEndAt, warrantyCertificateCode } = extractOrderWarranty(req, items);
  const doneAt = isDone ? (dateMs(req.completed_at) || dateMs(latestVisit?.actual_end) || warrantyStartAt || dateMs(req.updated_at) || createdAt) : null;
  const paid = bill
    ? ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus)
    : ['COMPLETED', 'READY_FOR_ACCEPTANCE'].includes(String(req.request_status || '').toUpperCase());
  const rawEst = req.estimated_total;
  const hasEst = rawEst != null && rawEst !== '' && Number.isFinite(Number(rawEst)) && Number(rawEst) >= 0;
  const estimated = hasEst ? Number(rawEst) : NaN;

  const voucherDiscount = isFreeOrder
    ? 0
    : (bill?.voucherDiscount != null ? Number(bill.voucherDiscount) : (Number(req.voucher_discount_amount) || 0));
  const tierPartDiscount = isFreeOrder ? 0 : (Number(bill?.tierPartDiscount) || 0);
  const lateDiscount = isFreeOrder ? 0 : (Number(bill?.lateDiscount) || 0);
  const inactiveQuoteSt = ['REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED'];
  const activeQuoteTotal =
    quote && !quote.rejectReason && !quote.revisionRequested && !inactiveQuoteSt.includes(String(quote.status || '').toUpperCase())
      ? (quote.approved && quote.approvedTotal != null ? quote.approvedTotal : quote.total)
      : (quote?.approvedTotal != null ? quote.approvedTotal : null);
  const resolvedTotal = isFreeOrder
    ? 0
    : bill && (['pending_payment', 'done'].includes(status) ? bill.amountDue != null : (bill.quotationTotal != null || bill.supplementalTotal > 0)) && status !== 'quoted'
      ? bill.amountDue
      : activeQuoteTotal != null
        ? Math.max(0, activeQuoteTotal - tierPartDiscount - voucherDiscount - lateDiscount)
        : bill
          ? bill.amountDue
          : (hasEst && (estimated > 0 || voucherDiscount >= booked))
            ? estimated
            : Math.max(0, booked - voucherDiscount);
  const resolvedPayment = resolveOrderPayment(req.preferred_payment_method, bill);

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    backendStatus: req.request_status,
    ...(statusUnknown ? { statusUnknown: true } : {}),
    kind: kindOf(req),
    outOfWarranty: Boolean(req.out_of_warranty),
    outOfWarrantyReason: req.out_of_warranty_reason || '',
    requestSource: req.request_source || 'APP',
    originalRequestId: req.original_request_id || null,
    warrantyOf: req.original_request_code || null,
    customerPhone: customerPhoneFallback || contactPhone,
    customerTier: req.customer_tier_code || null,
    customerTierLabel: req.customer_tier_label || req.customer_tier_name || null,
    warrantyDays,
    warrantyStartAt,
    warrantyEndAt,
    items,
    goods,
    productDiscount,
    comboDiscount,
    comboLabel: toVietnamese(req.combo_label || req.bill?.bill?.combo_label, ''),
    voucher: req.voucher_code ? { code: req.voucher_code } : null,
    voucherDiscount,
    total: resolvedTotal,
    finalTotal: resolvedTotal,
    bill,
    inspectionFee,
    cancelReason: toVietnamese(cancelHistory?.reason, 'Đơn đã được huỷ') || 'Đơn đã được huỷ',
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    preferredTimeAt: dateMs(req.preferred_time),
    preferredTimeEndAt: dateMs(req.preferred_time_end),
    payment: resolvedPayment.payment,
    paymentMethod: resolvedPayment.paymentMethod,
    qrPaymentRequested: resolvedPayment.qrPaymentRequested,
    siteCondition: resolveSiteCondition(req.site_condition),
    note: req.problem_description || '',
    address: {
      id: `addr-snap-${req.request_id}`,
      name: req.address?.contact_name || 'Khách hàng',
      phone: contactPhone,
      area: extractAreaFromAddress(fullAddr),
      full: fullAddr,
      lat: req.service_location?.latitude != null ? Number(req.service_location.latitude) : (req.address?.latitude != null ? Number(req.address.latitude) : null),
      lng: req.service_location?.longitude != null ? Number(req.service_location.longitude) : (req.address?.longitude != null ? Number(req.address.longitude) : null),
    },
    status,
    history,
    createdAt,
    doneAt,
    travelStartedAt: dateMs(journey?.travel_started_at),
    arrivedAt: dateMs(journey?.arrived_at),
    checkIn: (journey?.arrived_at || latestVisit?.actual_start)
      ? {
          at: dateMs(journey?.arrived_at || latestVisit?.actual_start),
          lat: journey?.arrived_latitude ?? latestVisit?.check_in_latitude ?? null,
          lng: journey?.arrived_longitude ?? latestVisit?.check_in_longitude ?? null,
        }
      : null,
    lateCompensation: (bill?.lateDiscount || Number(req.late_minutes) > 0)
      ? {
        amount: bill?.lateDiscount || 0,
        minutesLate: Number(req.late_minutes) || null,
        minutes: Number(req.late_minutes) || null,
        tier: req.late_tier || null,
      }
      : null,
    tech: (status === 'pending' || (['cancelled', 'warranty_pending'].includes(status) && !techInfo)) ? null : {
      name: techName,
      code: techInfo?.technician_id != null ? String(techInfo.technician_id) : '',
      phone: techInfo?.phone || '',
      rating: techInfo?.rating_average ?? null,
      ratingCount: techInfo?.rating_count ?? 0,
      avatar: techInfo?.avatar_url || null,
    },
    // Đội thợ phụ (khách chỉ xem tên, sao, danh mục — không có SĐT). Chỉ gán khi server trả trường này để tránh xoá dữ liệu từ /tracking.
    ...(Array.isArray(req.support_technicians)
      ? {
          supportTechnicians: req.support_technicians.map((st) => ({
            technicianId: st?.technician_id ?? null,
            name: st?.full_name || 'Thợ phụ hỗ trợ',
            rating: st?.rating_average != null ? Number(st.rating_average) : null,
            categoryIds: Array.isArray(st?.category_ids)
              ? st.category_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
              : [],
          })),
        }
      : {}),
    materialWarranties: extractMaterialWarrantiesFromQuotations(req.quotations || []),
    procedure: req.procedure || latestVisit?.procedure || null,
    repairNotes: mapCustomerRepairNotes(progressList, req.request_id, createdAt),
    quote,
    diagnosisReport,
    ...(req._evidence ? { evidence: req._evidence } : {}),
    ...(req._evidenceFetched ? { _evidenceFetched: true } : {}),
    attachments: extractInitialAttachments(
      req._evidence || [],
      req.attachments || req.initial_attachments || req._detailAttachments || [],
    ),
    ...(() => {
      const extLifecycle = extractExternalPartLifecycle(req.quotations || [], progressList);
      const resolvedExtState = (noQuoteOverride && extLifecycle.externalPriceState === 'revision_requested')
        ? (extLifecycle.pendingExternalEstimates.length > 0
            ? 'needs_final_price'
            : (extLifecycle.finalizedApprovedItems.length > 0 ? 'finalized' : 'none'))
        : extLifecycle.externalPriceState;
      return {
        pendingExternalEstimates: extLifecycle.pendingExternalEstimates,
        finalizedExternalParts: extLifecycle.finalizedApprovedItems,
        externalPriceState: resolvedExtState,
      };
    })(),
    materials: (quote?.approved ? (quote.lines || []) : (quote?.lines || []).filter((l) => l.isPriorApproved))
      .filter((l) => l.type === 'part' && !l.isEstimatedRange)
      .map((l, idx) => ({
        id: `mat-${req.request_id}-${idx}`,
        matId: l.matId || null,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        price: l.isFinalizedExternal ? l.actualPrice : l.price,
      })),
    // Chờ thanh toán (gồm cả trả thiếu) hoặc hoàn thành; đã trả hay chưa đọc từ hoá đơn server.
    report: (isDone || status === 'pending_payment') ? {
      summary: latestVisit?.work_performed || '',
      paid,
      at: doneAt || dateMs(req.updated_at),
      tech: techName,
      techCode: techInfo?.technician_id != null ? String(techInfo.technician_id) : '',
      warrantyCertificateCode: warrantyCertificateCode || `BH-${req.request_code}`,
      customerSignature: latestVisit?.customer_signature || null,
      safetyChecklist: parseSafetyChecklist(latestVisit?.safety_checklist ?? req.safety_checklist),
    } : null,
    followUpRequested: Boolean(latestVisit?.follow_up_reason),
    followUpReason: latestVisit?.follow_up_reason || '',
    rating: req.review ? {
      stars: Number(req.review.rating) || 5,
      text: req.review.review_text || '',
      at: dateMs(req.review.created_at || req.review.reviewed_at || req.review.updated_at),
    } : null,
  };
};

export const mapBackendTechJobToOrder = (job, techProfile = TECH_ME) => {
  if (!job || !job.request) return null;
  const req = job.request;
  const orderKind = kindOf(req);
  const isFreeOrder = orderKind === 'warranty' || orderKind === 'followup';
  const visit = job.visit || {};
  const techProgressList = job.progress || visit.progress || req.progress || [];
  const items = mapBackendItemsToAppItems(job.services || []);
  const itemsGoods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const isOowReq = Boolean(req.out_of_warranty || String(req.request_status || '').toUpperCase() === 'OUT_OF_WARRANTY');
  const hasZeroOowGoods = Boolean(isOowReq && req.goods_amount != null && Number(req.goods_amount) === 0);
  const goods = (isFreeOrder || hasZeroOowGoods) ? 0 : (Number(req.goods_amount) > 0 ? Number(req.goods_amount) : itemsGoods);
  const productDiscount = isFreeOrder ? 0 : (Number(req.product_discount_amount) || Number(job.bill?.bill?.product_discount_amount) || 0);
  const comboDiscount = isFreeOrder ? 0 : (Number(req.combo_discount_amount) || Number(job.bill?.bill?.combo_discount_amount) || 0);
  const booked = isFreeOrder ? 0 : Math.max(0, goods - productDiscount - comboDiscount);
  const hasPendingQuote = (job.quotations || []).some(isQuotationPendingCustomer);
  const anyQuoteApproved = (job.quotations || []).some(
    (q) => q.quotation_status === 'APPROVED' || q.customer_decision === 'APPROVED',
  );
  const quote = mapBackendQuotationToAppQuote(
    job.quotations || [],
    job.diagnoses || [],
    booked,
    req.problem_description,
    productDiscount + comboDiscount,
    items,
    techProgressList,
  );
  // Phân công còn hiệu lực với thợ này. Mọi trạng thái khác (ENDED, EXPIRED, TIMEOUT, RELEASED, REASSIGNED, REVOKED...)
  // = việc không còn được giao cho thợ -> chỉ giữ lại nếu chính thợ này đã làm xong.
  const LIVE_ASSIGNMENT = ['ACTIVE', 'PENDING', 'PENDING_ACK', 'ASSIGNED', 'ACCEPTED'];
  const assignmentStatus = String(job.assignment_status || 'ACTIVE').toUpperCase();
  const isEnded = !LIVE_ASSIGNMENT.includes(assignmentStatus);
  const rs = String(req.request_status || '').toUpperCase();
  const PAYMENT_STAGE = ['PENDING_REVIEW', 'READY_FOR_ACCEPTANCE', 'PENDING_PAYMENT', 'PARTIALLY_PAID_RECEIVABLE'];
  const latestTechDiag = Array.isArray(job.diagnoses) && job.diagnoses.length > 0
    ? job.diagnoses[job.diagnoses.length - 1]
    : null;
  const diagnosisReport = latestTechDiag
    ? {
      symptoms: latestTechDiag.symptoms || '',
      diagnosis: latestTechDiag.findings || '',
      recommendation: latestTechDiag.repair_recommendation || '',
      at: ts(latestTechDiag.recorded_at),
    }
    : null;
  let status;
  let noQuoteOverride = false;
  const assignRole = normalizeAssignmentRole(job.assignment_role);
  if (
    PAYMENT_STAGE.includes(rs) &&
    !(isEnded && assignRole === 'SUPPORT') &&
    (!isEnded || job.completed_at || visit.actual_end || String(visit.visit_status || '').toUpperCase() === 'COMPLETED')
  ) {
    status = mapBackendStatusToAppStatus(rs);
  } else if (isEnded) {
    // Phân công đã kết thúc: chỉ là "xong" khi đơn đã hoàn thành / nghiệm thu (hoặc chính thợ này đã nộp hoàn thành
    // trước khi đơn chuyển sang bảo hành). Đơn bị huỷ -> 'cancelled'. Còn lại là thợ đã trả việc / bị thu hồi và đơn
    // đang do thợ khác xử lý -> bỏ khỏi danh sách của thợ này.
    if (rs === 'COMPLETED' && (assignmentStatus === 'ENDED' || job.completed_at)) status = 'done';
    else if (rs.startsWith('CANCELLED') && ['ENDED', 'CANCELLED'].includes(assignmentStatus)) status = 'cancelled';
    else if (job.completed_at) status = 'done';
    else return null;
  } else {
    // Đã ghi chẩn đoán (không gắn needs_quotation: true) mà đơn vẫn IN_PROGRESS = thợ xác nhận không có phát sinh, đang sửa.
    const sortedJobQuotes = sortQuotationsAsc(job.quotations || []);
    const latestJobQuote = sortedJobQuotes[sortedJobQuotes.length - 1] || null;
    const latestQuoteTs = latestJobQuote ? ts(latestJobQuote.updated_at || latestJobQuote.sent_at) : 0;
    const diagAfterQuote = Boolean(latestTechDiag && latestTechDiag.recorded_at && ts(latestTechDiag.recorded_at) > latestQuoteTs);
    noQuoteOverride = Boolean(latestTechDiag && latestTechDiag.needs_quotation === false && diagAfterQuote);
    const decidedNoQuote = noQuoteOverride || ((
      (Boolean(latestTechDiag) && latestTechDiag.needs_quotation !== true) ||
      req.needs_quotation === false ||
      visit?.needs_quotation === false
    ) && !quote?.revisionRequested);
    status = mapBackendStatusToAppStatus(
      rs,
      visit.visit_status,
      anyQuoteApproved || noQuoteOverride || (decidedNoQuote && !quote?.revisionRequested),
      hasPendingQuote,
    );
  }
  const statusUnknown = !isEnded && !isKnownBackendStatus(rs);
  // "Đang đến": đã bấm xuất phát (travel_started_at) mà chưa check-in (arrived_at) -> giữ đúng sau khi cài lại / đổi máy.
  if (status === 'confirmed' && job.travel_started_at && !job.arrived_at) status = 'onway';
  if (assignRole === 'SUPPORT' && !isEnded && !job.arrived_at && !['done', 'cancelled', 'pending_payment'].includes(status)) {
    status = job.travel_started_at ? 'onway' : 'confirmed';
  }
  if (
    rs === 'DIAGNOSED_PENDING_QUOTATION' &&
    !hasPendingQuote &&
    quote?.revisionRequested &&
    quote?.quotationType === 'INITIAL' &&
    !job.arrived_at &&
    !job.travel_started_at &&
    !['IN_PROGRESS', 'COMPLETED'].includes(String(visit?.visit_status || '').toUpperCase())
  ) {
    status = 'confirmed';
  }
  const bill = mapBackendBill(job.bill);
  // Khách đã thanh toán đủ -> việc hoàn thành (app không chờ văn phòng nghiệm thu).
  if (status === 'pending_payment' && bill && ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus)) status = 'done';

  const cancelHistory = (req.timeline || req.status_history || []).find((h) => String(h.new_status || '').toUpperCase().startsWith('CANCELLED'));
  const inspectionFee = status === 'cancelled' && bill ? bill.amountDue : 0;

  const preferredIso = req.preferred_time || visit.scheduled_start || job.assigned_time;
  const createdAt = job.assigned_time ? new Date(job.assigned_time).getTime() : Date.now();
  const fullAddr = req.address_text || 'Hà Nội';
  const rawTimeline = Array.isArray(req.timeline || req.status_history || job.timeline)
    ? (req.timeline || req.status_history || job.timeline).filter((h) => isKnownBackendStatus(h.new_status))
    : [];
  const techHistory = rawTimeline.length > 0
    ? rawTimeline.map((h) => ({
      status: mapBackendStatusToAppStatus(
        h.new_status,
        null,
        anyQuoteApproved,
        String(h.new_status || '').toUpperCase() === 'DIAGNOSED_PENDING_QUOTATION',
      ),
      at: h.changed_at ? new Date(h.changed_at).getTime() : createdAt,
      note: toVietnamese(h.reason, ''),
    }))
    : [{ status, at: createdAt }];
  const myTech = {
    name: techProfile?.name || TECH_ME.name,
    code: techProfile?.code || TECH_ME.code,
    phone: techProfile?.phone || TECH_ME.phone,
    rating: techProfile?.rating ?? null,
  };

  const materialsFromUsages = (job.material_usages || []).map((mu, idx) => ({
    id: mu.usage_id ? `mu-${mu.usage_id}` : `mu-${job.assignment_id}-${idx}`,
    dbUsageId: mu.usage_id || null,
    matId: `m-db-${mu.material_id}`,
    dbMaterialId: mu.material_id,
    name: mu.material_name || `Vật tư #${mu.material_id}`,
    unit: mu.unit_of_measure || 'cái',
    qty: Number(mu.used_quantity) || 1,
    price: materialPriceOf(mu.material_id),
  }));
  const quotePartMaterials = (quote?.approved ? (quote.lines || []) : (quote?.lines || []).filter((l) => l.isPriorApproved))
    .filter((l) => l.type === 'part' && !l.isEstimatedRange)
    .map((l, idx) => ({
      id: `qmat-${job.assignment_id}-${idx}`,
      matId: l.matId || null,
      name: l.name,
      unit: l.unit,
      qty: l.qty,
      price: l.isFinalizedExternal ? l.actualPrice : l.price,
      isCustom: Boolean(l.isCustom),
      fromQuote: true,
    }));
  const mergedTechMaterials = [...materialsFromUsages];
  quotePartMaterials.forEach((qm) => {
    const qmNorm = normalizeExternalPartName(qm.name);
    const exists = mergedTechMaterials.some(
      (um) => (qm.matId && um.matId === qm.matId) || (qmNorm && normalizeExternalPartName(um.name) === qmNorm),
    );
    if (!exists) mergedTechMaterials.push(qm);
  });

  const isDone = status === 'done';
  const { warrantyDays, warrantyStartAt, warrantyEndAt, warrantyCertificateCode } = extractOrderWarranty(req, items);
  const doneAt = isDone ? (dateMs(job.completed_at) || dateMs(visit.actual_end) || dateMs(visit.scheduled_end) || createdAt) : null;
  const rawEst = req.estimated_total;
  const hasEst = rawEst != null && rawEst !== '' && Number.isFinite(Number(rawEst)) && Number(rawEst) >= 0;
  const estimated = hasEst ? Number(rawEst) : NaN;
  const voucherDiscount = isFreeOrder ? 0 : (bill ? bill.voucherDiscount : (Number(req.voucher_discount_amount) || 0));
  const tierPartDiscount = isFreeOrder ? 0 : (Number(bill?.tierPartDiscount) || 0);
  const lateDiscount = isFreeOrder ? 0 : (Number(bill?.lateDiscount) || 0);
  const inactiveQuoteSt = ['REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED'];
  const activeQuoteTotal =
    quote && !quote.rejectReason && !quote.revisionRequested && !inactiveQuoteSt.includes(String(quote.status || '').toUpperCase())
      ? (quote.approved && quote.approvedTotal != null ? quote.approvedTotal : quote.total)
      : (quote?.approvedTotal != null ? quote.approvedTotal : null);
  const resolvedTotal = isFreeOrder
    ? 0
    : bill && (['pending_payment', 'done'].includes(status) ? bill.amountDue != null : (bill.quotationTotal != null || bill.supplementalTotal > 0)) && status !== 'quoted'
      ? bill.amountDue
      : activeQuoteTotal != null
        ? Math.max(0, activeQuoteTotal - tierPartDiscount - voucherDiscount - lateDiscount)
        : bill
          ? bill.amountDue
          : (hasEst && (estimated > 0 || voucherDiscount >= booked))
            ? estimated
            : Math.max(0, booked - voucherDiscount);
  const resolvedPayment = resolveOrderPayment(req.preferred_payment_method, bill);

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    dbAssignmentId: job.assignment_id,
    assignmentRole: normalizeAssignmentRole(job.assignment_role),
    supportCategoryIds: Array.isArray(job.support_category_ids)
      ? job.support_category_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [],
    visitStatus: (visit?.visit_status || job.visit_status) ? String(visit?.visit_status || job.visit_status).toUpperCase() : null,
    materialWarranties: extractMaterialWarrantiesFromQuotations(job.quotations || req.quotations || []),
    // GET /technician/jobs chỉ trả việc của chính thợ đang đăng nhập: phân công ACTIVE = việc mình đang phụ trách.
    assignmentActive: assignmentStatus === 'ACTIVE',
    dbVisitNumber: visit.visit_number || 1,
    backendStatus: req.request_status,
    customerHasApp: typeof job.customer_has_app === 'boolean'
      ? job.customer_has_app
      : (typeof req.customer_has_app === 'boolean'
          ? req.customer_has_app
          : (typeof req.customer?.has_account === 'boolean' ? req.customer.has_account : null)),
    ...(statusUnknown ? { statusUnknown: true } : {}),
    kind: kindOf(req),
    originalRequestId: req.original_request_id || null,
    warrantyOf: req.original_request_code || null,
    voucher: req.voucher_code ? { code: req.voucher_code } : null,
    customerPhone: req.contact_phone || '',
    customerTier: req.customer_tier_code || null,
    customerTierLabel: req.customer_tier_label || req.customer_tier_name || null,
    warrantyDays,
    warrantyStartAt,
    warrantyEndAt,
    items,
    goods,
    productDiscount,
    comboDiscount,
    comboLabel: toVietnamese(req.combo_label || job.bill?.bill?.combo_label, ''),
    voucherDiscount,
    // Tiền thật từ GET /technician/jobs/:id/bill; nếu đang có báo giá chờ duyệt hoặc chưa có bill thì lấy theo tổng báo giá hiện tại.
    total: resolvedTotal,
    finalTotal: resolvedTotal,
    bill,
    cashToCollect: bill?.cashToCollect ?? null,
    paymentMethod: resolvedPayment.paymentMethod,
    qrPaymentRequested: resolvedPayment.qrPaymentRequested,
    travelStartedAt: dateMs(job.travel_started_at),
    ...(() => {
      const ownArrivedIso = assignRole === 'SUPPORT' ? job.arrived_at : (job.arrived_at || visit.actual_start);
      return {
        arrivedAt: dateMs(ownArrivedIso),
        checkIn: (job.check_in || ownArrivedIso)
          ? {
              lat: job.check_in?.latitude ?? null,
              lng: job.check_in?.longitude ?? null,
              at: dateMs(ownArrivedIso),
            }
          : null,
      };
    })(),
    lateCompensation: (bill?.lateDiscount || Number(req.late_minutes) > 0)
      ? { minutes: Number(req.late_minutes) || null, minutesLate: Number(req.late_minutes) || null, tier: req.late_tier || null, amount: bill?.lateDiscount || 0 }
      : null,
    preferredTimeAt: dateMs(req.preferred_time),
    preferredTimeEndAt: dateMs(req.preferred_time_end),
    offerExpiresAt: dateMs(job.offer_expires_at || job.expires_at || job.accept_deadline),
    inspectionFee,
    cancelReason: toVietnamese(cancelHistory?.reason, 'Đơn đã huỷ') || 'Đơn đã huỷ',
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    payment: resolvedPayment.payment,
    siteCondition: resolveSiteCondition(req.site_condition),
    note: req.problem_description || '',
    address: {
      id: `addr-job-${job.assignment_id}`,
      name: req.contact_name || 'Khách hàng',
      phone: req.contact_phone || '',
      area: extractAreaFromAddress(fullAddr),
      full: fullAddr,
      lat: req.service_location?.latitude != null ? Number(req.service_location.latitude) : null,
      lng: req.service_location?.longitude != null ? Number(req.service_location.longitude) : null,
    },
    status,
    history: techHistory,
    createdAt,
    doneAt,
    tech: myTech,
    quote,
    diagnosisReport,
    ...(job._evidenceFetched ? { _evidenceFetched: true } : {}),
    attachments: extractInitialAttachments(
      job._evidence || [],
      req.attachments || req.initial_attachments || job.attachments || req.photos || [],
    ),
    ...(() => {
      const extLifecycle = extractExternalPartLifecycle(job.quotations || req.quotations || [], techProgressList);
      const resolvedExtState = (noQuoteOverride && extLifecycle.externalPriceState === 'revision_requested')
        ? (extLifecycle.pendingExternalEstimates.length > 0
            ? 'needs_final_price'
            : (extLifecycle.finalizedApprovedItems.length > 0 ? 'finalized' : 'none'))
        : extLifecycle.externalPriceState;
      return {
        pendingExternalEstimates: extLifecycle.pendingExternalEstimates,
        finalizedExternalParts: extLifecycle.finalizedApprovedItems,
        externalPriceState: resolvedExtState,
      };
    })(),
    materials: mergedTechMaterials,
    // Các bước thực hiện (backend: job.procedure; null = đơn không có bước bắt buộc)
    procedure: job.procedure || null,
    // Tiến độ / ghi chú thợ gửi (POST /technician/jobs/:id/progress).
    progress: (techProgressList || []).map((p, idx) => ({
      id: p.progress_id != null ? `pg-${p.progress_id}` : `pg-${job.assignment_id}-${idx}`,
      dbProgressId: p.progress_id ?? null,
      percent: p.progress_percent,
      note: p.note || '',
      at: p.recorded_at ? new Date(p.recorded_at).getTime() : createdAt,
    })),
    // Linh kiện mua ngoài trong các báo giá đã duyệt: phải gắn ảnh biên lai trước khi nộp hoàn thành (backend RECEIPT_REQUIRED).
    externalParts: (job.quotations || [])
      .filter((q) => q.quotation_status === 'APPROVED' || q.customer_decision === 'APPROVED')
      .flatMap((q) => (q.items || []).filter((it) => isExternalPurchaseQuoteItem(it, { isKnownWarehouseName: isKnownWarehouseMaterialName })))
      .map((it) => {
        const att = it?.receipt_attachment && typeof it.receipt_attachment === 'object' ? it.receipt_attachment : null;
        return {
          itemId: it.quotation_item_id,
          name: parseExternalPartDesc(it.description_snapshot)?.cleanName || it.description_snapshot,
          receiptId: it.receipt_attachment_id ?? att?.attachment_id ?? att?.id ?? null,
          receiptUrl: it.receipt_url || it.receipt_image_url || att?.image_url || att?.file_url || att?.url || att?.uri || null,
        };
      }),
    followUpRequested: Boolean(visit.follow_up_reason),
    // Đánh giá của khách nếu server trả kèm việc (nếu không, AppContext gắn từ GET /technician/jobs/reviews).
    rating: (req.review || job.review) ? {
      stars: Number((req.review || job.review).rating) || 5,
      text: (req.review || job.review).review_text || '',
      at: dateMs((req.review || job.review).created_at || (req.review || job.review).reviewed_at || (req.review || job.review).updated_at),
    } : null,
    followUpReason: visit.follow_up_reason || '',
    outOfWarranty: Boolean(req.out_of_warranty),
    outOfWarrantyReason: req.out_of_warranty_reason || '',
    repairNotes: [
      ...(job.diagnoses || []).map((d, idx) => {
        const sym = String(d.symptoms || '').trim();
        let findings = String(d.findings || '').trim();
        if (sym && findings.toLowerCase().startsWith(sym.toLowerCase())) {
          findings = findings.slice(sym.length).replace(/^[\s.,;:\-–—]+/, '').trim();
        }
        const reco = String(d.repair_recommendation || '').trim();
        const parts = [
          sym ? `Triệu chứng: ${sym}` : '',
          findings ? `Kết luận: ${findings}` : '',
          reco ? `Đề xuất: ${reco}` : '',
        ].filter(Boolean);
        return {
          id: `diag-${job.assignment_id}-${idx}`,
          text: parts.join(' · '),
          at: d.recorded_at ? new Date(d.recorded_at).getTime() : createdAt,
        };
      }),
      ...(techProgressList || [])
        .filter((p) => p.note && String(p.note).trim() && !isInternalExternalNote(p.note))
        .map((p, idx) => ({
          id: p.progress_id != null ? `pg-${p.progress_id}` : `pg-${job.assignment_id}-${idx}`,
          dbProgressId: p.progress_id ?? null,
          text: String(p.note).trim(),
          at: p.recorded_at ? new Date(p.recorded_at).getTime() : createdAt,
        })),
    ],
    report: (isDone || status === 'pending_payment') ? {
      summary: visit.work_performed || '',
      paid: bill ? ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus) : ['COMPLETED', 'READY_FOR_ACCEPTANCE'].includes(String(req.request_status || '').toUpperCase()),
      at: doneAt || dateMs(job.completed_at),
      tech: myTech.name,
      techCode: myTech.code,
      customerSignature: visit.customer_signature || null,
      safetyChecklist: parseSafetyChecklist(visit?.safety_checklist ?? req.safety_checklist),
      warrantyCertificateCode: warrantyCertificateCode || `BH-${req.request_code}`,
    } : null,
  };
};

export const mapBackendOpenRequestToOrder = (req) => {
  if (!req) return null;
  const orderKind = kindOf(req);
  const isFreeOrder = orderKind === 'warranty' || orderKind === 'followup';
  const items = mapBackendItemsToAppItems(req.services || req.items || []);
  const itemsSum = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const goods = isFreeOrder
    ? 0
    : (Number(req.goods_amount) > 0 ? Number(req.goods_amount) : itemsSum);
  const productDiscount = isFreeOrder ? 0 : (Number(req.product_discount_amount) || 0);
  const comboDiscount = isFreeOrder ? 0 : (Number(req.combo_discount_amount) || 0);
  const voucherDiscount = isFreeOrder ? 0 : (Number(req.voucher_discount_amount) || 0);
  const rawEst = req.estimated_total;
  const hasEst = !isFreeOrder && rawEst != null && rawEst !== '' && Number.isFinite(Number(rawEst)) && Number(rawEst) >= 0;
  const computedTotal = Math.max(0, goods - productDiscount - comboDiscount - voucherDiscount);
  const openTotal = isFreeOrder
    ? 0
    : (hasEst && (Number(rawEst) > 0 || voucherDiscount >= Math.max(0, goods - productDiscount - comboDiscount))
        ? Number(rawEst)
        : computedTotal);
  const resolvedPayment = resolveOrderPayment(req.preferred_payment_method, null);
  const preferredIso = req.preferred_time || req.created_at;
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : Date.now();
  const fullAddr = req.address_text || req.service_address_snapshot || 'Hà Nội';

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    kind: orderKind,
    customerPhone: req.contact_phone || '',
    warrantyDays: null,
    items,
    goods,
    productDiscount,
    comboDiscount,
    comboLabel: toVietnamese(req.combo_label, ''),
    voucher: req.voucher_code ? { code: req.voucher_code } : null,
    voucherDiscount,
    total: openTotal,
    finalTotal: openTotal,
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    preferredTimeAt: dateMs(req.preferred_time),
    preferredTimeEndAt: dateMs(req.preferred_time_end),
    // Hạn tiếp nhận do server trả (nếu có) — dùng để ẩn đơn quá hạn khỏi app thợ.
    offerExpiresAt: dateMs(req.offer_expires_at || req.expires_at || req.accept_deadline),
    payment: resolvedPayment.payment,
    paymentMethod: resolvedPayment.paymentMethod,
    qrPaymentRequested: resolvedPayment.qrPaymentRequested,
    siteCondition: resolveSiteCondition(req.site_condition),
    note: req.problem_description || '',
    attachments: extractInitialAttachments([], req.attachments || req.initial_attachments || req.photos || []),
    address: {
      id: `addr-open-${req.request_id}`,
      name: req.contact_name || 'Khách hàng',
      phone: req.contact_phone || '',
      area: extractAreaFromAddress(fullAddr),
      full: fullAddr,
      lat: req.service_location?.latitude != null ? Number(req.service_location.latitude) : (req.address?.latitude != null ? Number(req.address.latitude) : null),
      lng: req.service_location?.longitude != null ? Number(req.service_location.longitude) : (req.address?.longitude != null ? Number(req.address.longitude) : null),
    },
    status: 'pending',
    history: [{ status: 'pending', at: createdAt }],
    createdAt,
    tech: null,
  };
};

// Phân công còn quyền xem hóa đơn / ảnh phía thợ (chỉ ACTIVE hoặc ENDED; bỏ qua CANCELLED / thu hồi / hết hạn).
const VIEWABLE_TECH_ASSIGNMENT_STATUSES = new Set(['ACTIVE', 'ENDED']);
const TECH_BILL_PAYMENT_STATUSES = [
  'PENDING_PAYMENT',
  'PARTIALLY_PAID_RECEIVABLE',
  'PENDING_REVIEW',
];

export const isTechAssignmentViewable = (job) => {
  if (!job?.assignment_id) return false;
  const st = String(job.assignment_status || 'ACTIVE').toUpperCase();
  return VIEWABLE_TECH_ASSIGNMENT_STATUSES.has(st);
};

export const isTechBillPriorityJob = (job) => {
  if (!isTechAssignmentViewable(job)) return false;
  const rs = String(job?.request?.request_status || '').toUpperCase();
  return (
    TECH_BILL_PAYMENT_STATUSES.includes(rs) ||
    (rs.startsWith('CANCELLED') &&
      Boolean(job.arrived_at || Number(job.request?.inspection_fee) > 0 || Number(job.bill?.bill?.amount_due) > 0))
  );
};

/**
 * Chọn danh sách việc của thợ được phép gọi thêm API ảnh & hóa đơn khi đồng bộ.
 * Bỏ qua hoàn toàn các phân công đã CANCELLED / thu hồi (backend cố ý trả 404 JOB_NOT_FOUND / REQUEST_NOT_FOUND).
 */
export const selectTechJobsForHydration = (allJobsRaw = [], openItemsRaw = []) => {
  const viewableJobs = (Array.isArray(allJobsRaw) ? allJobsRaw : []).filter(isTechAssignmentViewable);
  const isActiveStatus = (j) => String(j.assignment_status || 'ACTIVE').toUpperCase() === 'ACTIVE';
  const activeJobsList = [
    ...viewableJobs.filter((j) => isActiveStatus(j)),
    ...viewableJobs.filter((j) => !isActiveStatus(j) && isTechBillPriorityJob(j)),
    ...viewableJobs.filter((j) => !isActiveStatus(j) && !isTechBillPriorityJob(j)),
  ].slice(0, 15);
  const activeJobIds = activeJobsList.map((j) => String(j.assignment_id));
  const paymentJobIds = viewableJobs
    .filter((j) => isTechBillPriorityJob(j))
    .map((j) => String(j.assignment_id));
  const billJobIds = [...new Set([...activeJobIds, ...paymentJobIds])].slice(0, 25);
  const viewableRequestIds = new Set(
    viewableJobs
      .map((j) => j.request?.request_id)
      .filter((id) => id != null)
      .map(String),
  );
  // GET /uploads?request_id= cho thợ chỉ được phép khi thợ có phân công ACTIVE hoặc ENDED trên đơn đó.
  const openItemsWithPhotoAccess = (Array.isArray(openItemsRaw) ? openItemsRaw : [])
    .filter((r) => r?.request_id != null && viewableRequestIds.has(String(r.request_id)))
    .slice(0, 10);
  return {
    activeJobsList,
    billJobIds,
    openItemsWithPhotoAccess,
  };
};

// Ảnh của việc (GET /uploads?job_id= hoặc ?request_id=) -> evidence trên app.
// Kết quả POST /customer/requests/quote-preview -> số tiền hiển thị khi đặt lịch (cùng công thức với lúc đặt thật).
// Đọc linh hoạt nhiều dạng response (data.preview | data.quote | data.bill.bill | data). Thiếu tổng tiền -> null.
export const mapQuotePreview = (data) => {
  if (!data || typeof data !== 'object') return null;
  const src = (data.preview && typeof data.preview === 'object' && data.preview)
    || (data.quote && typeof data.quote === 'object' && data.quote)
    || (data.bill?.bill && typeof data.bill.bill === 'object' && data.bill.bill)
    || (data.bill && typeof data.bill === 'object' && data.bill)
    || (data.request && typeof data.request === 'object' && data.request)
    || data;
  const num = (...vals) => {
    for (const v of vals) {
      if (v == null || v === '') continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const total = num(src.estimated_total, src.total_amount, src.amount_due, src.total, data.estimated_total, data.total);
  if (total == null) return null;
  const goods = num(src.goods_amount, src.subtotal, data.goods_amount);
  const rawWarranty = num(src.warranty_days, data.warranty_days);
  return {
    goods,
    productDiscount: num(src.product_discount_amount, data.product_discount_amount) ?? 0,
    comboDiscount: num(src.combo_discount_amount, data.combo_discount_amount) ?? 0,
    comboLabel: toVietnamese(src.combo_label || data.combo_label || '', ''),
    voucherDiscount: num(src.voucher_discount_amount, data.voucher_discount_amount) ?? 0,
    voucherCode: src.voucher_code || data.voucher_code || null,
    total: Math.max(0, total),
    warrantyDays: rawWarranty != null && rawWarranty > 0 ? Math.round(rawWarranty) : (rawWarranty === 0 ? 0 : null),
  };
};

// Ảnh của việc (GET /uploads?job_id= hoặc ?request_id=) -> evidence trên app.
// DOCUMENT = ảnh biên lai linh kiện mua ngoài: tách riêng stage 'receipt' (hiện ở khối Biên lai), KHÔNG gộp vào
// "Sau khi làm" (trước đây gộp chung nên dễ nhầm ảnh biên lai với ảnh minh chứng sau khi sửa).
// Ảnh khách gửi khi đặt lịch qua request_id (không có job_id / evidence_type hoặc là CUSTOMER_PHOTO) giữ stage 'diagnosis'.
const EVIDENCE_STAGE = {
  PROBLEM_PHOTO: 'diagnosis',
  INITIAL_PHOTO: 'diagnosis',
  CUSTOMER_PHOTO: 'diagnosis',
  REQUEST_PHOTO: 'diagnosis',
  BEFORE_REPAIR: 'before',
  AFTER_REPAIR: 'after',
  DOCUMENT: 'receipt',
  RECEIPT: 'receipt',
  PART_RECEIPT: 'receipt',
  INVOICE: 'receipt',
  RECEIPT_PHOTO: 'receipt',
};
export const mapBackendPhotoToEvidence = (row) => {
  const rawType = String(row?.evidence_type || row?.type || '').trim().toUpperCase();
  const hasJob = Boolean(row?.job_id || row?.assignment_id || row?.visit_id || row?.procedure_step_id);
  const note = row?.description || row?.note || '';
  const isReceiptNote = /^(?:biên lai|hoá đơn|hóa đơn|receipt)\b/i.test(String(note).trim());
  const stage = EVIDENCE_STAGE[rawType] || (isReceiptNote ? 'receipt' : (!rawType && !hasJob ? 'diagnosis' : 'after'));
  const uploaderRole = String(row?.uploaded_by_role || row?.uploader_role || row?.role || '').trim().toUpperCase();
  const isWarrantyUpload = /^\[Bảo hành\]/i.test(String(note).trim());
  const isOowUpload = /^\[Ngoài bảo hành\]/i.test(String(note).trim());
  const isCustomerInitial = Boolean(
    !isWarrantyUpload &&
    !isOowUpload &&
    stage === 'diagnosis' &&
    (uploaderRole === 'CUSTOMER' || (!hasJob && !parseSymptomPhotoMeta(note))),
  );
  return {
    id: row?.attachment_id != null ? `att-${row.attachment_id}` : `att-${row?.id || Math.random().toString(36).slice(2, 8)}`,
    dbAttachmentId: row?.attachment_id ?? row?.id ?? null,
    procedureStepId: row?.procedure_step_id ?? null,
    uri: row?.image_url || row?.file_url || row?.url || row?.uri || '',
    stage,
    evidenceType: rawType || null,
    note,
    isWarrantyUpload,
    isOowUpload,
    isCustomerInitial,
    at: row?.uploaded_at ? new Date(row.uploaded_at).getTime() : Date.now(),
  };
};

// Trích xuất danh sách ảnh hiện trạng / triệu chứng ban đầu khách đính kèm khi đặt đơn.
export const extractInitialAttachments = (evidence = [], rawAttachments = []) => {
  const out = [];
  const seen = new Set();
  const pushOne = (item) => {
    if (!item?.uri || item.isWarrantyUpload || item.isOowUpload || item.stage === 'receipt') return;
    if (/^\[(Bảo hành|Ngoài bảo hành)\]/i.test(String(item.note || item.description || '').trim())) return;
    const key = item.dbAttachmentId != null ? `id:${item.dbAttachmentId}` : `uri:${item.uri}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: item.id || (item.dbAttachmentId != null ? `att-${item.dbAttachmentId}` : key),
      dbAttachmentId: item.dbAttachmentId ?? null,
      uri: item.uri,
      note: item.note || '',
      at: item.at || Date.now(),
      isCustomerInitial: Boolean(item.isCustomerInitial),
    });
  };
  (Array.isArray(rawAttachments) ? rawAttachments : []).forEach((row) => {
    if (!row) return;
    if (row.image_url || row.file_url || row.url) {
      const mapped = mapBackendPhotoToEvidence(row);
      if (mapped.isCustomerInitial) {
        pushOne(mapped);
      }
    } else if (row.uri) {
      pushOne({ ...row, isCustomerInitial: row.isCustomerInitial !== undefined ? Boolean(row.isCustomerInitial) : true });
    }
  });
  (Array.isArray(evidence) ? evidence : []).forEach((e) => {
    if (e?.isCustomerInitial) pushOne(e);
  });
  return out;
};

export const mergeBackendOrdersWithLocal = (localOrders = [], remoteOrders = []) => {
  // remoteOrders là nguồn sự thật từ backend. Nếu không có (lỗi mạng/chưa gọi) thì giữ localOrders.
  if (!Array.isArray(remoteOrders)) {
    return Array.isArray(localOrders) ? localOrders.filter((o) => o && o.dbRequestId != null) : [];
  }

  const byKey = new Map();
  const keyOf = (o) => (o?.dbRequestId ? `db-${o.dbRequestId}` : o?.code);

  remoteOrders.forEach((ro) => {
    const k = keyOf(ro);
    if (!k) return;
    byKey.set(k, ro);
  });

  (localOrders || []).forEach((lo) => {
    const k = keyOf(lo);
    if (!k) return;
    const matchKey = byKey.has(k)
      ? k
      : [...byKey.entries()].find(([, v]) => v.code === lo.code)?.[0];
    if (matchKey) {
      const ro = byKey.get(matchKey);
      // Giữ trạng thái di chuyển ('onway') hoặc chat/ảnh minh chứng trên máy nếu backend đang ở ASSIGNED / IN_PROGRESS
      const sameTech = (() => {
        if (ro.status === 'pending') return false;
        if (!ro.tech) return !lo.tech;
        if (lo.tech?.code && ro.tech?.code) return String(lo.tech.code) === String(ro.tech.code);
        const ln = lo.tech?.name;
        const rn = ro.tech?.name;
        if (ln && rn && ln !== ASSIGNED_TECH_PLACEHOLDER && rn !== ASSIGNED_TECH_PLACEHOLDER) {
          return ln === rn;
        }
        return true;
      })();
      const keepOnway = sameTech && lo.status === 'onway' && ro.status === 'confirmed' && !(ro.assignmentRole === 'SUPPORT' && ro.arrivedAt);
      const keepRepairing = sameTech && lo.status === 'repairing' && ro.status === 'diagnosing'
        && (!ro.quote?.revisionRequested || Boolean(lo.noQuoteConfirmedAt && lo.noQuoteConfirmedAt > (ro.quote?.at || 0)));
      // Thợ đang sửa lại báo giá (reopenQuote): giữ form mở tới khi server có báo giá mới hoặc khách duyệt báo giá đang sửa.
      const localWasApproved = lo.quoteEditingFromApproved !== undefined
        ? Boolean(lo.quoteEditingFromApproved)
        : Boolean(lo.quote?.approved);
      const keepEditing = Boolean(lo.quoteEditing)
        && ['quoted', 'repairing', 'confirmed', 'diagnosing'].includes(ro.status)
        && (ro.quote?.dbQuotationId || null) === (lo.quoteEditingFrom || null)
        && (localWasApproved || !ro.quote?.approved);
      const roIsPaid = Boolean(ro.report?.paid) || ['PAID', 'NOTHING_TO_PAY'].includes(ro.bill?.paymentStatus);
      // Khách đã đổi CASH ↔ VietQR khi BE còn GD chờ → giữ lựa chọn local tới khi đã trả / BE nhận method mới.
      const keepLockedMethod = Boolean(lo.paymentMethodLocked)
        && (lo.paymentMethod === 'cash' || lo.paymentMethod === 'vietqr')
        && !lo.report?.paid
        && !roIsPaid
        && ro.paymentMethod !== lo.paymentMethod;
      // Khách đã báo trả tiền mặt khi BE còn GD VietQR chờ → giữ cashClaimPending local trong cửa sổ ngắn (hoặc tới khi có xác nhận).
      const hasBillAmounts = Boolean(ro.bill || lo.bill);
      const cashClaimExpired = Boolean(lo.cashClaimAt && Date.now() - lo.cashClaimAt > 20000);
      const keepCashClaim = Boolean(lo.cashClaimLocked)
        && hasBillAmounts
        && !lo.report?.paid
        && !roIsPaid
        && !ro.bill?.cashClaimPending
        && !cashClaimExpired;
      const nowMs = Date.now();
      const cachedEligFresh = Boolean(
        lo.serverWarrantyEligibility &&
        (!lo.serverWarrantyEligibility.fetchedAt || (
          nowMs - lo.serverWarrantyEligibility.fetchedAt <= 10 * 60 * 1000 &&
          vnDateKey(lo.serverWarrantyEligibility.fetchedAt) === vnDateKey(nowMs)
        )),
      );
      const sameWarrantyEnd = !ro.warrantyEndAt || (lo.warrantyEndAt ? vnDateKey(ro.warrantyEndAt) === vnDateKey(lo.warrantyEndAt) : false);
      const keepLocallyFinalized = sameTech
        && !['done', 'cancelled'].includes(ro.status)
        && Array.isArray(lo.locallyFinalizedExternalNames)
        && lo.locallyFinalizedExternalNames.length > 0;
      const locallyFinNames = keepLocallyFinalized ? lo.locallyFinalizedExternalNames : [];
      const locallyFinSet = new Set(locallyFinNames.map(normalizeExternalPartName).filter(Boolean));
      const nextPendingExternalEstimates = locallyFinSet.size > 0
        ? (ro.pendingExternalEstimates || []).filter((est) => !locallyFinSet.has(normalizeExternalPartName(est.name)))
        : (ro.pendingExternalEstimates || []);
      const nextExternalPriceState =
        ro.externalPriceState === 'needs_final_price' &&
        nextPendingExternalEstimates.length === 0 &&
        locallyFinSet.size > 0
          ? 'finalized'
          : ro.externalPriceState;
      const cashClaimBaseBill = ro.bill || lo.bill;
      const cashClaimAmount = Math.max(0, Number(cashClaimBaseBill?.remainingAmount ?? cashClaimBaseBill?.amountDue ?? 0));
      byKey.set(matchKey, {
        ...lo,
        ...ro,
        code: ro.code || lo.code,
        assignmentRole: ro.assignmentRole ?? lo.assignmentRole ?? 'LEAD',
        supportCategoryIds: Array.isArray(ro.supportCategoryIds) ? ro.supportCategoryIds : (lo.supportCategoryIds || []),
        visitStatus: ro.visitStatus ?? lo.visitStatus ?? null,
        customerHasApp: ro.customerHasApp != null ? ro.customerHasApp : (lo.customerHasApp ?? null),
        ...(ro.status === lo.status && lo.procedureIncompleteAt
          ? {
              procedureIncompleteAt: lo.procedureIncompleteAt,
              procedureIncompleteErrors: lo.procedureIncompleteErrors || [],
            }
          : {}),
        supportTechnicians: Array.isArray(ro.supportTechnicians)
          ? ro.supportTechnicians
          : (ro.status === 'pending' && !ro.tech ? [] : (lo.supportTechnicians || [])),
        materialWarranties: Array.isArray(ro.materialWarranties) && ro.materialWarranties.length
          ? ro.materialWarranties
          : (lo.materialWarranties || []),
        status: keepEditing ? lo.status : (keepOnway ? 'onway' : (keepRepairing ? 'repairing' : ro.status)),
        quoteEditing: keepEditing,
        ...(keepEditing ? {} : { quoteEditingFrom: null, quoteEditingFromApproved: undefined }),
        locallyFinalizedExternalNames: locallyFinNames,
        pendingExternalEstimates: nextPendingExternalEstimates,
        externalPriceState: nextExternalPriceState,
        tracking: !sameTech
          ? (ro.tracking || null)
          : (ro.tracking && (!lo.tracking || (ro.tracking.updatedAt || 0) >= (lo.tracking.updatedAt || 0)))
            ? ro.tracking
            : (lo.tracking || ro.tracking),
        checkIn: !sameTech
          ? (ro.checkIn || null)
          : ((ro.checkIn && (!lo.checkIn || (ro.checkIn.at || 0) >= (lo.checkIn.at || 0)))
            ? { ...(lo.checkIn || {}), ...ro.checkIn }
            : (lo.checkIn || ro.checkIn)),
        // Ảnh/tiến độ: ưu tiên server khi đã fetch thành công (kể cả mảng rỗng sau khi xoá ảnh cuối).
        evidence: (ro._evidenceFetched && Array.isArray(ro.evidence))
          ? ro.evidence
          : ((Array.isArray(ro.evidence) && ro.evidence.length)
            ? ro.evidence
            : (lo.evidence || ro.evidence || [])),
        attachments: (ro._evidenceFetched && Array.isArray(ro.attachments))
          ? ro.attachments
          : ((Array.isArray(ro.attachments) && ro.attachments.length)
            ? ro.attachments
            : (lo.attachments || ro.attachments || [])),
        ...(() => {
          const roHasDetail = Boolean(ro._detailHydrated || ro.dbAssignmentId != null);
          return {
            procedure: ro.procedure != null ? ro.procedure : (roHasDetail ? null : (lo.procedure || null)),
            progress: (Array.isArray(ro.progress) && ro.progress.length) ? ro.progress : (roHasDetail ? (ro.progress || []) : (lo.progress || ro.progress || [])),
            repairNotes: (Array.isArray(ro.repairNotes) && ro.repairNotes.length) ? ro.repairNotes : (roHasDetail ? (ro.repairNotes || []) : (lo.repairNotes || ro.repairNotes || [])),
            materials: (Array.isArray(ro.materials) && ro.materials.length) ? ro.materials : (roHasDetail ? (ro.materials || []) : (lo.materials || ro.materials || [])),
          };
        })(),
        // Đang sửa lại báo giá thì giữ bản trên máy (trước đây dòng này ghi đè mất bản đang sửa).
        quote: keepEditing ? lo.quote : (ro.quote || lo.quote || null),
        diagnosisReport: ro.diagnosisReport || lo.diagnosisReport || null,
        rating: ro.rating
          ? { ...ro.rating, at: ro.rating.at ?? lo.rating?.at ?? null }
          : (lo.rating || null),
        report: ro.status === 'cancelled' && !ro.report
          ? null
          : ((ro.report || lo.report) ? {
              ...(lo.report || {}),
              ...(ro.report || {}),
              // Giữ chữ ký / checklist thợ vừa nhập nếu server chưa trả.
              customerSignature: ro.report?.customerSignature || lo.report?.customerSignature || null,
              safetyChecklist: ro.report?.safetyChecklist?.length
                ? ro.report.safetyChecklist
                : (lo.report?.safetyChecklist || []),
              summary: ro.report?.summary || lo.report?.summary || '',
              paid: ro.report?.paid != null ? ro.report.paid : lo.report?.paid,
            } : null),
        followUpRequested: ro.followUpRequested != null ? ro.followUpRequested : lo.followUpRequested,
        followUpReason: ro.followUpReason || lo.followUpReason || '',
        warrantyStartAt: ro.warrantyStartAt ?? lo.warrantyStartAt ?? null,
        warrantyEndAt: ro.warrantyEndAt ?? lo.warrantyEndAt ?? null,
        warrantyDays: ro.warrantyDays != null ? ro.warrantyDays : lo.warrantyDays,
        serverWarrantyEligibility:
          ro.serverWarrantyEligibility ||
          (ro.status === lo.status && sameWarrantyEnd && cachedEligFresh
            ? lo.serverWarrantyEligibility
            : null) ||
          null,
        // Bảo toàn cờ đã thông báo quá hạn tiếp nhận, nhưng reset nếu khách vừa đổi giờ hẹn mới.
        expiredNotified: (ro.preferredTimeAt || null) !== (lo.preferredTimeAt || null)
          ? false
          : (lo.expiredNotified !== undefined ? lo.expiredNotified : ro.expiredNotified),
        ...(keepLockedMethod ? {
          payment: lo.paymentMethod === 'vietqr' ? (lo.payment || 'Chuyển khoản VietQR') : (lo.payment || 'Tiền mặt tại nhà'),
          paymentMethod: lo.paymentMethod,
          qrPaymentRequested: lo.paymentMethod === 'vietqr',
          paymentMethodLocked: true,
        } : {
          qrPaymentRequested: ro.paymentMethod === 'vietqr',
          paymentMethodLocked: (ro.paymentMethod === lo.paymentMethod || roIsPaid) ? false : Boolean(lo.paymentMethodLocked),
        }),
        ...(keepCashClaim ? {
          cashClaimLocked: true,
          cashClaimAt: lo.cashClaimAt || nowMs,
          bill: {
            ...cashClaimBaseBill,
            cashClaimPending: true,
            paymentMethod: 'cash',
            cashToCollect: cashClaimAmount,
          },
          cashToCollect: cashClaimAmount,
          payment: 'Tiền mặt tại nhà',
          paymentMethod: 'cash',
          qrPaymentRequested: false,
          paymentMethodLocked: true,
        } : {
          cashClaimLocked: (ro.bill?.cashClaimPending || roIsPaid || cashClaimExpired)
            ? false
            : Boolean(lo.cashClaimLocked),
        }),
      });
    }
    // Tuyệt đối không giữ lại đơn không có trên backend: Backend là nguồn sự thật duy nhất (SSOT).
  });
  return [...byKey.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// Thông báo backend (GET /notifications) -> dạng thông báo của app. Link mở đơn theo request_id nếu app có đơn đó.
export const mapBackendNotification = (n, orders = [], linkName = 'order') => {
  if (!n) return null;
  const nType = n.type || n.notification_type || null;
  const nTypeUpper = String(nType || '').trim().toUpperCase();
  const order = n.request_id != null ? orders.find((o) => String(o.dbRequestId) === String(n.request_id)) : null;
  // Backend có thể gửi tiêu đề / nội dung tiếng Anh: luôn Việt hoá.
  const vi = viNotification({ ...n, type: nType, request_code: n.request_code || order?.code });
  return {
    id: `notif-db-${n.notification_id}`,
    dbNotificationId: n.notification_id,
    at: ts(n.created_at),
    read: Boolean(n.is_read),
    icon: n.icon || defaultAttendanceNotifIcon(nTypeUpper) || '🔔',
    type: nType,
    title: vi.title,
    body: vi.body,
    ...(order
      ? { link: { name: linkName, params: { code: order.code } } }
      : (['HANDOVER_CONFIRMED', 'HANDOVER_REJECTED'].includes(nTypeUpper)
        ? { link: { name: 'tech-handovers', params: { tab: 'history' } } }
        : (isAttendanceNotifType(nTypeUpper)
          ? { link: { tab: 'tech-attendance' } }
          : {}))),
  };
};

// Mẫu mã giảm giá backend (voucher_id, label, discount_amount, discount_percent, ...) -> dạng app dùng để tính giảm giá.
const voucherFields = (v) => ({
  label: toVietnamese(v?.label, 'Ưu đãi giảm giá'),
  ...(v?.discount_amount != null ? { discount: Number(v.discount_amount) } : {}),
  ...(v?.discount_percent != null ? { percent: Number(v.discount_percent) } : {}),
  ...(v?.max_discount_amount != null ? { max: Number(v.max_discount_amount) } : {}),
  ...(v?.min_order_amount != null ? { min: Number(v.min_order_amount) } : {}),
});

// Mã giảm giá trong ví của khách (GET /customer/vouchers).
export const mapWalletVoucher = (w) => (w ? {
  ...voucherFields(w.voucher),
  code: w.code,
  wallet: true,
  status: w.status,
  customerVoucherId: w.customer_voucher_id,
  expiresAt: w.expires_at ? ts(w.expires_at) : null,
} : null);

// Mã công khai khách nhập tay (GET /customer/vouchers/catalog -> public_vouchers).
export const mapPublicVoucher = (v) => (v?.code ? { ...voucherFields(v), code: v.code, public: true } : null);

// Lựa chọn đổi điểm (catalog -> redeem_options): id = voucher_id gửi lên POST /customer/vouchers/redeem.
export const mapRedeemOption = (v) => (v ? {
  id: String(v.voucher_id),
  cost: Number(v.point_cost) || 0,
  title: toVietnamese(v.label, 'Ưu đãi giảm giá'),
  validDays: v.valid_days ?? null,
  voucher: voucherFields(v),
} : null);

// Sổ điểm (GET /customer/loyalty -> history[]).
// Lịch sử điểm: gắn mã đơn (#REQ-...) để dòng lịch sử hiện badge và bấm mở được đơn.
export const mapPointHistory = (h, orders = []) => {
  if (!h) return null;
  const requestId = h.request_id ?? null;
  const order = requestId != null
    ? (orders || []).find((o) => String(o.dbRequestId) === String(requestId))
    : null;
  const fromTitle = String(h.title || '').match(/(REQ-\d+|HRM[\w-]+|BH-[\w-]+)/)?.[1] || null;
  return {
    id: `pt-db-${h.point_transaction_id}`,
    title: toVietnamese(h.title, 'Cập nhật điểm thưởng'),
    delta: Number(h.points_delta) || 0,
    at: ts(h.created_at),
    type: h.reason_type ? String(h.reason_type).toLowerCase() : null,
    requestId,
    orderCode: order?.code || fromTitle,
  };
};

export { resolveDbMaterialId };
