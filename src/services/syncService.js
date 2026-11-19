import {
  getService,
  TECH_ME,
  MATERIALS,
  resolveServiceSlugFromBackend,
  resolveDbMaterialId,
  ensureServiceFromOrderItem,
} from '../constants/data';
import { toVnParts, vnDateKey } from '../utils/vnTime';
import { viNotification, toVietnamese } from '../utils/viText';
import {
  parseExternalPartDesc,
  extractExternalPartLifecycle,
  normalizeExternalPartName,
  computeQuoteRangeTotals,
  sortQuotationsAsc,
  isQuotationPendingCustomer,
} from '../utils/externalPartsPricing';
import { parseSymptomPhotoMeta } from '../utils/symptomItems';

// Tên hiển thị khi đơn đã có thợ nhưng chưa tải được thông tin thợ (GET /customer/requests/:id/tracking).
const ASSIGNED_TECH_PLACEHOLDER = 'Thợ được phân công';
// Phương thức thanh toán khách chọn khi đặt (service_request.preferred_payment_method) -> nhãn trên app.
const PAYMENT_LABELS = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản VietQR',
  CARD_ATM: 'Thẻ ATM',
  VNPAY: 'VNPAY',
  CARD_INTERNATIONAL: 'Thẻ quốc tế',
  GOOGLE_PAY: 'Google Pay',
  APPLE_PAY: 'Apple Pay',
  PAYOS: 'PayOS',
};
export const paymentLabelOf = (method) => PAYMENT_LABELS[String(method || '').toUpperCase()] || 'Tiền mặt';
const materialPriceOf = (materialId) => MATERIALS.find((m) => m.dbId === Number(materialId))?.price ?? 0;
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
  if (h < 10) return '08h00 - 10h00';
  if (h < 12) return '10h00 - 12h00';
  if (h < 14) return '12h00 - 14h00';
  if (h < 16) return '14h00 - 16h00';
  if (h < 18) return '16h00 - 18h00';
  return '18h00 - 20h00';
};

export const buildPreferredTimeIso = (dateKey, slot) => {
  try {
    const baseDate = dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? dateKey
      : formatDateKeyFromIso(new Date().toISOString());
    const m = /(\d{1,2})h/.exec(slot || '');
    const hour = m ? pad(Math.min(23, Math.max(0, Number(m[1])))) : '09';
    return new Date(`${baseDate}T${hour}:00:00+07:00`).toISOString();
  } catch (e) {
    return new Date().toISOString();
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
  return {
    id: `addr-db-${row.address_id}`,
    dbAddressId: Number(row.address_id) || row.address_id,
    name: row.contact_name || 'Khách hàng',
    phone: row.contact_phone || '',
    area: row.ward_name || extractAreaFromAddress(full),
    wardCode: row.ward_code ?? null,
    wardName: row.ward_name ?? null,
    full,
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
    if (vs === 'IN_PROGRESS') return 'diagnosing';
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
  if (['WARRANTY_PENDING', 'UNDER_WARRANTY'].includes(st)) {
    return 'warranty_pending';
  }
  if (st === 'OUT_OF_WARRANTY') {
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
  return rawItems.map((it) => {
    const slug = resolveServiceSlugFromBackend(it.service_id, it.service_name || it.service_name_snapshot);
    const svc = getService(slug) || ensureServiceFromOrderItem(it);
    const price = it.selected_price != null && it.selected_price !== '' ? Number(it.selected_price) : (svc?.price || 0);
    return {
      id: slug,
      dbRequestServiceId: it.request_service_id || null,
      dbServiceId: it.service_id || svc?.dbId || null,
      name: it.service_name || it.service_name_snapshot || svc?.name || 'Dịch vụ',
      qty: Math.max(1, Number(it.quantity) || 1),
      price,
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

  const isBookedItem = (qi) => {
    if (parseExternalPartDesc(qi.description_snapshot)) return false;
    if (qi.item_type === 'MATERIAL' || qi.material_id || qi.is_external_purchase) return false;
    if (qi.request_service_id) {
      return bookedReqSvcIds.size === 0 || bookedReqSvcIds.has(String(qi.request_service_id));
    }
    if (isSupplemental) return false;
    if (qi.service_id && bookedSvcIds.has(String(qi.service_id))) return true;
    const nameClean = String(qi.description_snapshot || '').trim().toLowerCase();
    return Boolean(nameClean && bookedNames.has(nameClean));
  };

  const mapQuoteItem = (qi) => {
    const extMeta = parseExternalPartDesc(qi.description_snapshot);
    const booked = isBookedItem(qi);
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
        receiptId: qi.receipt_attachment_id || null,
        isOriginal: false,
      };
    }
    if (extMeta?.kind === 'finalized_external') {
      const unitP = Number(qi.unit_price) || 0;
      const priorDeposit = extMeta.priorDeposit || 0;
      return {
        type: 'part',
        matId: qi.material_id ? `m-db-${qi.material_id}` : undefined,
        name: extMeta.cleanName,
        unit: 'cái',
        qty: Number(qi.quantity) || 1,
        price: unitP,
        dbItemId: qi.quotation_item_id || null,
        isCustom: true,
        isFinalizedExternal: true,
        minPrice: extMeta.minPrice,
        maxPrice: extMeta.maxPrice,
        priorDeposit,
        actualPrice: priorDeposit + unitP,
        receiptId: qi.receipt_attachment_id || null,
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
    const resolvedPrice =
      Number.isFinite(parsedUnit) && parsedUnit > 0
        ? parsedUnit
        : (fallbackFromLineTotal > 0
          ? fallbackFromLineTotal
          : (qi.material_id ? materialPriceOf(qi.material_id) : (Number.isFinite(parsedUnit) ? parsedUnit : 0)));
    return {
      type: qi.item_type === 'MATERIAL' ? 'part' : 'service',
      matId: qi.material_id ? `m-db-${qi.material_id}` : undefined,
      name: qi.description_snapshot || 'Hạng mục dịch vụ',
      unit: qi.item_type === 'MATERIAL' ? 'cái' : 'lần',
      qty: qtyNum,
      price: resolvedPrice,
      dbItemId: qi.quotation_item_id || null,
      isCustom: Boolean(qi.is_external_purchase), // linh kiện thợ mua ngoài
      receiptId: qi.receipt_attachment_id || null,
      isOriginal: booked,
    };
  };

  const rawLines = (latestQuote.items || []).map(mapQuoteItem);

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
        price: Number(it.price) || 0,
        isOriginal: true,
      }));
      lines = [...originalLines, ...rawLines];
    }
  }

  const disc = Math.max(0, Number(orderDiscount) || 0);
  const bookedBase = Number(goodsTotal) || 0;
  const isApproved = latestQuote.quotation_status === 'APPROVED' || latestQuote.customer_decision === 'APPROVED';

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
  const approvedLifecycle = extractExternalPartLifecycle(approvedList);
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
  if (
    earlierApprovedQuotes.length > 0 &&
    (isApproved || isSupplemental) &&
    latestQuote.quotation_status !== 'REJECTED'
  ) {
    const earlierApprovedExtras = earlierApprovedQuotes
      .flatMap((q) => (q.items || []).map(mapQuoteItem).filter((l) => !l.isOriginal))
      .map((l) => ({ ...l, isPriorApproved: true }));
    if (earlierApprovedExtras.length > 0) includesPriorApprovedLines = true;
    const origPart = isSupplemental ? lines.filter((l) => l.isOriginal) : rawLines.filter((l) => l.isOriginal);
    const nonOrigCurrent = rawLines.filter((l) => !l.isOriginal);
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
  }

  const rawExtraLines = rawLines.filter((l) => !l.isOriginal);
  const rawExtraTotal = rawExtraLines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const priorApprovedExtra = !isApproved && approvedTotal != null ? Math.max(0, approvedTotal - bookedBase) : 0;
  const extraTotal = isApproved && approvedTotal != null
    ? Math.max(0, approvedTotal - bookedBase)
    : isSupplemental
      ? Math.max(0, priorApprovedExtra + rawExtraTotal)
      : rawExtraTotal;

  const qTotal = isApproved && approvedTotal != null
    ? approvedTotal
    : isSupplemental
      ? Math.max(0, (approvedTotal != null ? approvedTotal : bookedBase) + rawExtraTotal)
      : Math.max(0, (Number(latestQuote.total_amount) || lines.reduce((s, l) => s + l.price * l.qty, 0)) - disc);

  const quoteRange = computeQuoteRangeTotals(lines, {
    bookedBase,
    priorApprovedExtra: includesPriorApprovedLines ? 0 : priorApprovedExtra,
    prodDisc: disc,
    comboDisc: 0,
    isOnSite: isSupplemental || earlierApprovedQuotes.length > 0,
  });

  return {
    dbQuotationId: latestQuote.quotation_id,
    quotationCode: latestQuote.quotation_code,
    quotationType: latestQuote.quotation_type || 'INITIAL',
    status: isQuotationPendingCustomer(latestQuote) ? 'SENT' : latestQuote.quotation_status,
    revisionRequested: latestQuote.quotation_status === 'REVISION_REQUESTED' || latestQuote.customer_decision === 'REVISE',
    rejectReason: latestQuote.rejection_reason || latestQuote.revision_note || '',
    approvedTotal,
    approvedHasEstimatedRange,
    approvedTotalMin,
    approvedTotalMax,
    diagnosis: latestDiag?.findings || problemDesc || 'Đã kiểm tra thiết bị tại hiện trường',
    symptoms: latestDiag?.symptoms || '',
    recommendation: latestDiag?.repair_recommendation || '',
    lines,
    rawTotal: latestQuote.total_amount != null ? Number(latestQuote.total_amount) : qTotal,
    total: quoteRange.hasEstimatedRange ? quoteRange.totalMin : qTotal,
    extraAmount: quoteRange.hasEstimatedRange ? quoteRange.extraMin : extraTotal,
    totalMin: quoteRange.totalMin,
    totalMax: quoteRange.totalMax,
    extraMin: quoteRange.extraMin,
    extraMax: quoteRange.extraMax,
    warehouseExtra: quoteRange.warehouseExtra,
    customExtraMin: quoteRange.customExtraMin,
    customExtraMax: quoteRange.customExtraMax,
    includesPriorApprovedLines,
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
const kindOf = (req) => (req?.request_type === 'WARRANTY' && !req?.out_of_warranty ? 'warranty' : 'normal');
const dateMs = (v) => (v ? new Date(v).getTime() : null);
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const rawPhotoCandidates = [
    ...(Array.isArray(detReq.attachments) ? detReq.attachments : []),
    ...(Array.isArray(detReq.initial_attachments) ? detReq.initial_attachments : []),
    ...(Array.isArray(detReq.evidence) ? detReq.evidence : []),
    ...(Array.isArray(detReq.photos) ? detReq.photos : []),
    ...(Array.isArray(detailData.attachments) ? detailData.attachments : []),
    ...(Array.isArray(detailData.initial_attachments) ? detailData.initial_attachments : []),
    ...(Array.isArray(detailData.evidence) ? detailData.evidence : []),
    ...(Array.isArray(detailData.photos) ? detailData.photos : []),
    ...visitPhotos,
    ...(Array.isArray(rawReq._detailAttachments) ? rawReq._detailAttachments : []),
  ].filter(
    (row) =>
      row &&
      (!row.procedure_step_id || String(row.evidence_type || '').toUpperCase() === 'AFTER_REPAIR'),
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

  return {
    ...rawReq,
    ...detReq,
    request_status: detReq.request_status || rawReq.request_status,
    items: mergedItems,
    quotations: mergedQuotes,
    diagnoses: mergedDiags,
    visits: mergedVisits,
    timeline: mergedTimeline,
    technician: detReq.technician || detailData.technician || rawReq.technician,
    journey: rawReq.journey || detReq.journey || detailData.journey,
    ...(dedupPhotos.length ? { _detailAttachments: dedupPhotos } : {}),
    ...(rawReq.bill || detailBill ? { bill: rawReq.bill || detailBill } : {}),
  };
};

export const mapBackendCustomerRequestToOrder = (req, customerPhoneFallback = '') => {
  if (!req) return null;
  const isWarranty = kindOf(req) === 'warranty';
  const techInfo = req.technician || null;
  const techName = techInfo?.full_name || ASSIGNED_TECH_PLACEHOLDER;
  const items = mapBackendItemsToAppItems(req.items || []);
  const itemsGoods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const goods = isWarranty ? 0 : (Number(req.goods_amount) > 0 ? Number(req.goods_amount) : itemsGoods);
  const visits = req.visits || [];
  const latestVisit = visits[visits.length - 1] || null;
  const productDiscount = isWarranty ? 0 : (Number(req.product_discount_amount) || 0);
  const comboDiscount = isWarranty ? 0 : (Number(req.combo_discount_amount) || 0);
  const booked = isWarranty ? 0 : Math.max(0, goods - productDiscount - comboDiscount);
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
  );
  const hasPendingQuote = (req.quotations || []).some(isQuotationPendingCustomer);
  const anyQuoteApproved = (req.quotations || []).some(
    (q) => q.quotation_status === 'APPROVED' || q.customer_decision === 'APPROVED',
  );
  const decidedNoQuote = (
    (Array.isArray(req.diagnoses) && req.diagnoses.length > 0) ||
    req.needs_quotation === false ||
    latestVisit?.needs_quotation === false
  ) && !quote?.revisionRequested;
  const statusUnknown = !isKnownBackendStatus(req.request_status);
  let status = mapBackendStatusToAppStatus(
    req.request_status,
    latestVisit?.visit_status,
    (anyQuoteApproved || decidedNoQuote) && !quote?.revisionRequested,
    hasPendingQuote,
  );
  // "Đang đến": hành trình thật từ GET /customer/requests/:id/tracking.
  const journey = req.journey || null;
  if (status === 'confirmed' && journey?.on_the_way) status = 'onway';
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
  const warrantyStartAt = dateMs(req.warranty_start_date);
  const warrantyEndAt = dateMs(req.warranty_end_date);
  const warrantyDays = Number(req.warranty_days) > 0
    ? Number(req.warranty_days)
    : (warrantyStartAt && warrantyEndAt ? Math.round((warrantyEndAt - warrantyStartAt) / DAY_MS) : null);
  const doneAt = isDone ? (warrantyStartAt || dateMs(req.updated_at) || createdAt) : null;
  const paid = bill
    ? ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus)
    : ['COMPLETED', 'READY_FOR_ACCEPTANCE'].includes(String(req.request_status || '').toUpperCase());
  const estimated = Number(req.estimated_total);

  const voucherDiscount = isWarranty ? 0 : (Number(req.voucher_discount_amount) || 0);
  const activeQuoteTotal =
    quote && !quote.rejectReason && !quote.revisionRequested && quote.status !== 'REJECTED'
      ? (quote.approved && quote.approvedTotal != null ? quote.approvedTotal : quote.total)
      : (quote?.approvedTotal != null ? quote.approvedTotal : null);
  const resolvedTotal = isWarranty
    ? 0
    : bill && bill.quotationTotal != null && status !== 'quoted'
      ? bill.amountDue
      : activeQuoteTotal != null
        ? Math.max(0, activeQuoteTotal - voucherDiscount)
        : bill
          ? bill.amountDue
          : Number.isFinite(estimated) && estimated > 0
            ? estimated
            : booked;

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
    customerPhone: customerPhoneFallback || contactPhone,
    customerTier: req.customer_tier_code || null,
    warrantyDays,
    warrantyStartAt,
    warrantyEndAt,
    items,
    goods,
    productDiscount,
    comboDiscount,
    comboLabel: req.combo_label || '',
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
    payment: paymentLabelOf(req.preferred_payment_method),
    paymentMethod: String(req.preferred_payment_method || '').toUpperCase() === 'BANK_TRANSFER' ? 'vietqr' : 'cash',
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
    quote,
    diagnosisReport,
    attachments: extractInitialAttachments(
      req._evidence || [],
      req.attachments || req.initial_attachments || req._detailAttachments || [],
    ),
    ...(() => {
      const extLifecycle = extractExternalPartLifecycle(req.quotations || []);
      return {
        pendingExternalEstimates: extLifecycle.pendingExternalEstimates,
        finalizedExternalParts: extLifecycle.finalizedApprovedItems,
        externalPriceState: extLifecycle.externalPriceState,
      };
    })(),
    materials: (quote?.lines || [])
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
      warrantyCertificateCode: `BH-${req.request_code}`,
      customerSignature: latestVisit?.customer_signature || null,
    } : null,
    followUpRequested: Boolean(latestVisit?.follow_up_reason),
    followUpReason: latestVisit?.follow_up_reason || '',
    rating: req.review ? {
      stars: Number(req.review.rating) || 5,
      text: req.review.review_text || '',
    } : null,
  };
};

export const mapBackendTechJobToOrder = (job, techProfile = TECH_ME) => {
  if (!job || !job.request) return null;
  const req = job.request;
  const isWarranty = kindOf(req) === 'warranty';
  const visit = job.visit || {};
  const items = mapBackendItemsToAppItems(job.services || []);
  const itemsGoods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const goods = isWarranty ? 0 : (Number(req.goods_amount) > 0 ? Number(req.goods_amount) : itemsGoods);
  const productDiscount = isWarranty ? 0 : (Number(req.product_discount_amount) || Number(job.bill?.bill?.product_discount_amount) || 0);
  const comboDiscount = isWarranty ? 0 : (Number(req.combo_discount_amount) || Number(job.bill?.bill?.combo_discount_amount) || 0);
  const booked = isWarranty ? 0 : Math.max(0, goods - productDiscount - comboDiscount);
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
  );
  // Phân công còn hiệu lực với thợ này. Mọi trạng thái khác (ENDED, EXPIRED, TIMEOUT, RELEASED, REASSIGNED, REVOKED...)
  // = việc không còn được giao cho thợ -> chỉ giữ lại nếu chính thợ này đã làm xong.
  const LIVE_ASSIGNMENT = ['ACTIVE', 'PENDING', 'PENDING_ACK', 'ASSIGNED', 'ACCEPTED'];
  const assignmentStatus = String(job.assignment_status || 'ACTIVE').toUpperCase();
  const isEnded = !LIVE_ASSIGNMENT.includes(assignmentStatus);
  const rs = String(req.request_status || '').toUpperCase();
  const PAYMENT_STAGE = ['PENDING_REVIEW', 'READY_FOR_ACCEPTANCE', 'PENDING_PAYMENT', 'PARTIALLY_PAID_RECEIVABLE'];
  let status;
  if (PAYMENT_STAGE.includes(rs) && (!isEnded || job.completed_at)) {
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
    // Đã ghi chẩn đoán mà đơn vẫn IN_PROGRESS (và không có báo giá đang chờ sửa lại) = thợ xác nhận không có phát sinh, đang sửa.
    const decidedNoQuote = ((job.diagnoses || []).length > 0 || req.needs_quotation === false || visit?.needs_quotation === false) && !quote?.revisionRequested;
    status = mapBackendStatusToAppStatus(
      rs,
      visit.visit_status,
      (anyQuoteApproved || decidedNoQuote) && !quote?.revisionRequested,
      hasPendingQuote,
    );
  }
  const statusUnknown = !isEnded && !isKnownBackendStatus(rs);
  // "Đang đến": đã bấm xuất phát (travel_started_at) mà chưa check-in (arrived_at) -> giữ đúng sau khi cài lại / đổi máy.
  if (status === 'confirmed' && job.travel_started_at && !job.arrived_at) status = 'onway';
  const bill = mapBackendBill(job.bill);
  // Khách đã thanh toán đủ -> việc hoàn thành (app không chờ văn phòng nghiệm thu).
  if (status === 'pending_payment' && bill && ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus)) status = 'done';

  const cancelHistory = (req.timeline || req.status_history || []).find((h) => String(h.new_status || '').toUpperCase().startsWith('CANCELLED'));
  const inspectionFee = status === 'cancelled' && bill ? bill.amountDue : 0;

  const preferredIso = req.preferred_time || visit.scheduled_start || job.assigned_time;
  const createdAt = job.assigned_time ? new Date(job.assigned_time).getTime() : Date.now();
  const fullAddr = req.address_text || 'Hà Nội';
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

  const isDone = status === 'done';
  const doneAt = isDone ? (dateMs(job.completed_at) || dateMs(visit.actual_end) || dateMs(visit.scheduled_end) || createdAt) : null;
  const voucherDiscount = isWarranty ? 0 : (bill ? bill.voucherDiscount : (Number(req.voucher_discount_amount) || 0));
  const activeQuoteTotal =
    quote && !quote.rejectReason && !quote.revisionRequested && quote.status !== 'REJECTED'
      ? (quote.approved && quote.approvedTotal != null ? quote.approvedTotal : quote.total)
      : (quote?.approvedTotal != null ? quote.approvedTotal : null);
  const resolvedTotal = isWarranty
    ? 0
    : bill && bill.quotationTotal != null && status !== 'quoted'
      ? bill.amountDue
      : activeQuoteTotal != null
        ? Math.max(0, activeQuoteTotal - voucherDiscount)
        : bill
          ? bill.amountDue
          : Number(req.estimated_total) > 0
            ? Number(req.estimated_total)
            : booked;

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    dbAssignmentId: job.assignment_id,
    // GET /technician/jobs chỉ trả việc của chính thợ đang đăng nhập: phân công ACTIVE = việc mình đang phụ trách.
    assignmentActive: assignmentStatus === 'ACTIVE',
    dbVisitNumber: visit.visit_number || 1,
    backendStatus: req.request_status,
    kind: kindOf(req),
    customerPhone: req.contact_phone || '',
    warrantyDays: null,
    items,
    goods,
    productDiscount,
    comboDiscount,
    comboLabel: req.combo_label || job.bill?.bill?.combo_label || '',
    voucherDiscount,
    // Tiền thật từ GET /technician/jobs/:id/bill; nếu đang có báo giá chờ duyệt hoặc chưa có bill thì lấy theo tổng báo giá hiện tại.
    total: resolvedTotal,
    finalTotal: resolvedTotal,
    bill,
    cashToCollect: bill?.cashToCollect ?? null,
    paymentMethod: String(req.preferred_payment_method || '').toUpperCase() === 'BANK_TRANSFER' ? 'vietqr' : 'cash',
    travelStartedAt: dateMs(job.travel_started_at),
    arrivedAt: dateMs(job.arrived_at),
    checkIn: job.check_in ? { lat: job.check_in.latitude, lng: job.check_in.longitude, at: dateMs(job.arrived_at) } : null,
    lateCompensation: req.late_minutes > 0 ? { minutes: req.late_minutes, minutesLate: req.late_minutes, tier: req.late_tier || null, amount: bill?.lateDiscount || 0 } : null,
    preferredTimeAt: dateMs(req.preferred_time),
    preferredTimeEndAt: dateMs(req.preferred_time_end),
    offerExpiresAt: dateMs(job.offer_expires_at || job.expires_at || job.accept_deadline),
    inspectionFee,
    cancelReason: toVietnamese(cancelHistory?.reason, 'Đơn đã huỷ') || 'Đơn đã huỷ',
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    payment: paymentLabelOf(req.preferred_payment_method),
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
    history: [{ status, at: createdAt }],
    createdAt,
    doneAt,
    tech: myTech,
    quote,
    attachments: extractInitialAttachments(
      job._evidence || [],
      req.attachments || req.initial_attachments || job.attachments || req.photos || [],
    ),
    ...(() => {
      const extLifecycle = extractExternalPartLifecycle(job.quotations || req.quotations || []);
      return {
        pendingExternalEstimates: extLifecycle.pendingExternalEstimates,
        finalizedExternalParts: extLifecycle.finalizedApprovedItems,
        externalPriceState: extLifecycle.externalPriceState,
      };
    })(),
    materials: materialsFromUsages.length > 0
      ? materialsFromUsages
      : (quote?.lines || []).filter((l) => l.type === 'part' && !l.isEstimatedRange).map((l, idx) => ({
        id: `qmat-${job.assignment_id}-${idx}`,
        matId: l.matId || null,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        price: l.isFinalizedExternal ? l.actualPrice : l.price,
      })),
    // Các bước thực hiện (backend: job.procedure; null = đơn không có bước bắt buộc)
    procedure: job.procedure || null,
    // Tiến độ / ghi chú thợ gửi (POST /technician/jobs/:id/progress).
    progress: (job.progress || []).map((p, idx) => ({
      id: p.progress_id != null ? `pg-${p.progress_id}` : `pg-${job.assignment_id}-${idx}`,
      dbProgressId: p.progress_id ?? null,
      percent: p.progress_percent,
      note: p.note || '',
      at: p.recorded_at ? new Date(p.recorded_at).getTime() : createdAt,
    })),
    // Linh kiện mua ngoài trong các báo giá đã duyệt: phải gắn ảnh biên lai trước khi nộp hoàn thành (backend RECEIPT_REQUIRED).
    externalParts: (job.quotations || [])
      .filter((q) => q.quotation_status === 'APPROVED')
      .flatMap((q) => (q.items || []).filter((it) => it.is_external_purchase))
      .map((it) => ({
        itemId: it.quotation_item_id,
        name: parseExternalPartDesc(it.description_snapshot)?.cleanName || it.description_snapshot,
        receiptId: it.receipt_attachment_id || null,
      })),
    followUpRequested: Boolean(visit.follow_up_reason),
    // Đánh giá của khách nếu server trả kèm việc (nếu không, AppContext gắn từ GET /technician/jobs/reviews).
    rating: (req.review || job.review) ? {
      stars: Number((req.review || job.review).rating) || 5,
      text: (req.review || job.review).review_text || '',
    } : null,
    followUpReason: visit.follow_up_reason || '',
    outOfWarranty: Boolean(req.out_of_warranty),
    outOfWarrantyReason: req.out_of_warranty_reason || '',
    repairNotes: [
      ...(job.diagnoses || []).map((d, idx) => ({
        id: `diag-${job.assignment_id}-${idx}`,
        text: `${d.symptoms ? `[Triệu chứng: ${d.symptoms}] ` : ''}${d.findings || ''}${d.repair_recommendation ? ` -> Đề xuất: ${d.repair_recommendation}` : ''}`,
        at: d.recorded_at ? new Date(d.recorded_at).getTime() : createdAt,
      })),
      ...(job.progress || [])
        .filter((p) => p.note && String(p.note).trim())
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
      warrantyCertificateCode: `BH-${req.request_code}`,
    } : null,
  };
};

export const mapBackendOpenRequestToOrder = (req) => {
  if (!req) return null;
  const items = mapBackendItemsToAppItems(req.services || req.items || []);
  const goods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const preferredIso = req.preferred_time || req.created_at;
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : Date.now();
  const fullAddr = req.address_text || req.service_address_snapshot || 'Hà Nội';

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    kind: kindOf(req),
    customerPhone: req.contact_phone || '',
    warrantyDays: null,
    items,
    goods,
    productDiscount: 0,
    comboDiscount: 0,
    voucherDiscount: 0,
    // Chợ việc chỉ có giá niêm yết; tiền thật có khi nhận việc (hoá đơn).
    total: kindOf(req) === 'warranty' ? 0 : goods,
    finalTotal: kindOf(req) === 'warranty' ? 0 : goods,
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    preferredTimeAt: dateMs(req.preferred_time),
    preferredTimeEndAt: dateMs(req.preferred_time_end),
    // Hạn tiếp nhận do server trả (nếu có) — dùng để ẩn đơn quá hạn khỏi app thợ.
    offerExpiresAt: dateMs(req.offer_expires_at || req.expires_at || req.accept_deadline),
    payment: paymentLabelOf(req.preferred_payment_method),
    note: req.problem_description || '',
    attachments: extractInitialAttachments([], req.attachments || req.initial_attachments || req.photos || []),
    address: {
      id: `addr-open-${req.request_id}`,
      name: req.contact_name || 'Khách hàng',
      phone: req.contact_phone || '',
      area: extractAreaFromAddress(fullAddr),
      full: fullAddr,
    },
    status: 'pending',
    history: [{ status: 'pending', at: createdAt }],
    createdAt,
    tech: null,
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
};
export const mapBackendPhotoToEvidence = (row) => {
  const rawType = String(row?.evidence_type || row?.type || '').trim().toUpperCase();
  const hasJob = Boolean(row?.job_id || row?.assignment_id || row?.visit_id || row?.procedure_step_id);
  const stage = EVIDENCE_STAGE[rawType] || (!rawType && !hasJob ? 'diagnosis' : 'after');
  const uploaderRole = String(row?.uploaded_by_role || row?.uploader_role || row?.role || '').trim().toUpperCase();
  const note = row?.description || row?.note || '';
  const isCustomerInitial = Boolean(
    stage === 'diagnosis' &&
    (uploaderRole === 'CUSTOMER' || (!hasJob && !parseSymptomPhotoMeta(note))),
  );
  return {
    id: row?.attachment_id != null ? `att-${row.attachment_id}` : `att-${row?.id || Math.random().toString(36).slice(2, 8)}`,
    dbAttachmentId: row?.attachment_id ?? row?.id ?? null,
    uri: row?.image_url || row?.file_url || row?.url || row?.uri || '',
    stage,
    note,
    isCustomerInitial,
    at: row?.uploaded_at ? new Date(row.uploaded_at).getTime() : Date.now(),
  };
};

// Trích xuất danh sách ảnh hiện trạng / triệu chứng ban đầu khách đính kèm khi đặt đơn.
export const extractInitialAttachments = (evidence = [], rawAttachments = []) => {
  const out = [];
  const seen = new Set();
  const pushOne = (item) => {
    if (!item?.uri) return;
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
      if (!mapped.stage || mapped.stage === 'diagnosis') {
        pushOne({ ...mapped, isCustomerInitial: true });
      }
    } else if (row.uri) {
      pushOne({ ...row, isCustomerInitial: true });
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
      const keepOnway = lo.status === 'onway' && ro.status === 'confirmed';
      const keepRepairing = lo.status === 'repairing' && ro.status === 'diagnosing';
      // Thợ đang sửa lại báo giá (reopenQuote): giữ form mở tới khi server có báo giá mới.
      const keepEditing = Boolean(lo.quoteEditing) && ['quoted', 'repairing'].includes(ro.status)
        && (ro.quote?.dbQuotationId || null) === (lo.quoteEditingFrom || null);
      // Khách đã đổi CASH ↔ VietQR khi BE còn GD chờ → giữ lựa chọn local tới khi đã trả / BE nhận method mới.
      const keepLockedMethod = Boolean(lo.paymentMethodLocked)
        && (lo.paymentMethod === 'cash' || lo.paymentMethod === 'vietqr')
        && !lo.report?.paid
        && ro.paymentMethod !== lo.paymentMethod;
      // Khách đã báo trả tiền mặt khi BE còn GD VietQR chờ → giữ cashClaimPending local.
      const keepCashClaim = Boolean(lo.cashClaimLocked)
        && !lo.report?.paid
        && !ro.bill?.cashClaimPending
        && !['PAID', 'NOTHING_TO_PAY'].includes(ro.bill?.paymentStatus);
      byKey.set(matchKey, {
        ...lo,
        ...ro,
        code: ro.code || lo.code,
        status: keepEditing ? lo.status : (keepOnway ? 'onway' : (keepRepairing ? 'repairing' : ro.status)),
        quoteEditing: keepEditing,
        tracking: lo.tracking || ro.tracking,
        checkIn: lo.checkIn || ro.checkIn,
        chat: lo.chat?.length ? lo.chat : (ro.chat || []),
        // Ảnh/tiến độ: ưu tiên server; giữ local nếu server chưa có.
        evidence: (Array.isArray(ro.evidence) && ro.evidence.length)
          ? ro.evidence
          : (lo.evidence || ro.evidence || []),
        attachments: (Array.isArray(ro.attachments) && ro.attachments.length)
          ? ro.attachments
          : (lo.attachments || ro.attachments || []),
        progress: ro.progress !== undefined ? ro.progress : (lo.progress || []),
        repairNotes: ro.repairNotes !== undefined ? ro.repairNotes : (lo.repairNotes || []),
        materials: ro.materials !== undefined ? ro.materials : (lo.materials || []),
        // Đang sửa lại báo giá thì giữ bản trên máy (trước đây dòng này ghi đè mất bản đang sửa).
        quote: keepEditing ? lo.quote : (ro.quote || lo.quote || null),
        diagnosisReport: ro.diagnosisReport || lo.diagnosisReport || null,
        rating: ro.rating || lo.rating || null,
        report: (ro.report || lo.report) ? {
          ...(lo.report || {}),
          ...(ro.report || {}),
          // Giữ chữ ký / checklist thợ vừa nhập nếu server chưa trả.
          customerSignature: ro.report?.customerSignature || lo.report?.customerSignature || null,
          safetyChecklist: ro.report?.safetyChecklist?.length
            ? ro.report.safetyChecklist
            : (lo.report?.safetyChecklist || []),
          summary: ro.report?.summary || lo.report?.summary || '',
          paid: ro.report?.paid != null ? ro.report.paid : lo.report?.paid,
        } : null,
        followUpRequested: ro.followUpRequested != null ? ro.followUpRequested : lo.followUpRequested,
        followUpReason: ro.followUpReason || lo.followUpReason || '',
        // Bảo toàn cờ đã thông báo quá hạn tiếp nhận để tránh vòng lặp thông báo/refresh
        expiredNotified: lo.expiredNotified !== undefined ? lo.expiredNotified : ro.expiredNotified,
        ...(keepLockedMethod ? {
          payment: lo.paymentMethod === 'vietqr' ? (lo.payment || 'Chuyển khoản VietQR') : (lo.payment || 'Tiền mặt tại nhà'),
          paymentMethod: lo.paymentMethod,
          qrPaymentRequested: lo.paymentMethod === 'vietqr',
          paymentMethodLocked: true,
        } : {
          paymentMethodLocked: ro.paymentMethod === lo.paymentMethod ? false : Boolean(lo.paymentMethodLocked),
        }),
        ...(keepCashClaim ? {
          cashClaimLocked: true,
          bill: {
            ...(ro.bill || lo.bill || {}),
            cashClaimPending: true,
            paymentMethod: 'cash',
          },
          payment: 'Tiền mặt tại nhà',
          paymentMethod: 'cash',
          qrPaymentRequested: false,
          paymentMethodLocked: true,
        } : {
          cashClaimLocked: (ro.bill?.cashClaimPending || ['PAID', 'NOTHING_TO_PAY'].includes(ro.bill?.paymentStatus))
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
  const order = n.request_id != null ? orders.find((o) => String(o.dbRequestId) === String(n.request_id)) : null;
  // Backend có thể gửi tiêu đề / nội dung tiếng Anh: luôn Việt hoá.
  const vi = viNotification({ ...n, type: nType, request_code: n.request_code || order?.code });
  return {
    id: `notif-db-${n.notification_id}`,
    dbNotificationId: n.notification_id,
    at: ts(n.created_at),
    read: Boolean(n.is_read),
    icon: n.icon || '🔔',
    type: nType,
    title: vi.title,
    body: vi.body,
    ...(order
      ? { link: { name: linkName, params: { code: order.code } } }
      : (['HANDOVER_CONFIRMED', 'HANDOVER_REJECTED'].includes(nType)
        ? { link: { name: 'tech-handovers', params: { tab: 'history' } } }
        : {})),
  };
};

// Mẫu voucher backend (voucher_id, label, discount_amount, discount_percent, ...) -> dạng voucher app dùng để tính giảm giá.
const voucherFields = (v) => ({
  label: v?.label || '',
  ...(v?.discount_amount != null ? { discount: Number(v.discount_amount) } : {}),
  ...(v?.discount_percent != null ? { percent: Number(v.discount_percent) } : {}),
  ...(v?.max_discount_amount != null ? { max: Number(v.max_discount_amount) } : {}),
  ...(v?.min_order_amount != null ? { min: Number(v.min_order_amount) } : {}),
});

// Voucher trong ví của khách (GET /customer/vouchers).
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
  title: v.label || '',
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
    title: h.title || '',
    delta: Number(h.points_delta) || 0,
    at: ts(h.created_at),
    type: h.reason_type ? String(h.reason_type).toLowerCase() : null,
    requestId,
    orderCode: order?.code || fromTitle,
  };
};

export { resolveDbMaterialId };
