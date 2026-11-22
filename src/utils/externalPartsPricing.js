// Tiện ích xử lý giá dao động (ước tính ban đầu) và chốt giá thực tế cho vật tư mua ngoài.
// Giữ thuần JS không phụ thuộc vòng lặp import để dùng chung cho app và bộ kiểm thử Node.

const parseVnd = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

export const formatDots = (n) => {
  const num = Math.max(0, Math.round(Number(n) || 0));
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const formatRangeVND = (minPrice, maxPrice, { prefix = '' } = {}) => {
  const min = Math.max(0, Math.round(Number(minPrice) || 0));
  const max = Math.max(min, Math.round(Number(maxPrice) || min));
  if (min === max) return `${prefix}${formatDots(min)}đ`;
  return `${prefix}${formatDots(min)}đ – ${formatDots(max)}đ`;
};

export const normalizeExternalPartName = (name) => String(name || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

// Báo giá đang chờ khách hàng duyệt (hỗ trợ cả các mã trạng thái tương đương nếu API trả SENT/PENDING).
export function isQuotationPendingCustomer(q) {
  if (!q || typeof q !== 'object') return false;
  const st = String(q.quotation_status || '').trim().toUpperCase();
  const dec = String(q.customer_decision || '').trim().toUpperCase();
  if (['APPROVED', 'REJECTED', 'REVISE', 'REVISION_REQUESTED'].includes(dec)) return false;
  return ['SENT', 'PENDING', 'PENDING_APPROVAL', 'WAITING_CUSTOMER', 'SUBMITTED'].includes(st);
}

// Sắp xếp báo giá tăng dần theo thời điểm gửi / tạo / id (KHÔNG đổi mảng gốc) để phần tử cuối là báo giá mới nhất,
// không phụ thuộc thứ tự server trả về.
const quoteTimeOf = (q) => {
  const t = new Date(q?.sent_at || q?.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};
export function sortQuotationsAsc(quotations = []) {
  const list = Array.isArray(quotations) ? quotations : [];
  return list
    .map((q, idx) => ({ q, idx }))
    .sort((a, b) => {
      const ta = quoteTimeOf(a.q);
      const tb = quoteTimeOf(b.q);
      if (ta !== tb) return ta - tb;
      const ia = Number(a.q?.quotation_id);
      const ib = Number(b.q?.quotation_id);
      if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
      return a.idx - b.idx;
    })
    .map((x) => x.q);
}

export function formatEstimatedExternalDesc({ name, minPrice, maxPrice }) {
  const clean = String(name || '').trim() || 'Linh kiện mua ngoài';
  const min = Math.max(0, Math.round(Number(minPrice) || 0));
  const max = Math.max(min, Math.round(Number(maxPrice) || min));
  return `[VT ngoài dự kiến ${formatDots(min)}đ - ${formatDots(max)}đ] ${clean}`;
}

export function formatFinalizedExternalDesc({ name, minPrice, maxPrice, priorDeposit = 0, priorDepositQty = null }) {
  const clean = String(name || '').trim() || 'Linh kiện mua ngoài';
  const min = Math.max(0, Math.round(Number(minPrice) || 0));
  const max = Math.max(min, Math.round(Number(maxPrice) || min));
  const dep = Math.max(0, Math.round(Number(priorDeposit) || 0));
  const depQtyNum = priorDepositQty != null && Number(priorDepositQty) > 0 ? Math.max(1, Math.round(Number(priorDepositQty))) : null;
  const depQtyTag = depQtyNum ? ` x${depQtyNum}` : '';
  if (dep > 0 && max > 0) {
    return `[VT ngoài chốt giá (dự kiến ${formatDots(min)}đ - ${formatDots(max)}đ | đã tạm tính ${formatDots(dep)}đ${depQtyTag})] ${clean}`;
  }
  if (dep > 0) {
    return `[VT ngoài chốt giá (đã tạm tính ${formatDots(dep)}đ${depQtyTag})] ${clean}`;
  }
  if (max > 0) {
    return `[VT ngoài chốt giá (dự kiến ${formatDots(min)}đ - ${formatDots(max)}đ)] ${clean}`;
  }
  return `[VT ngoài chốt giá] ${clean}`;
}

export function parseExternalPartDesc(rawDesc) {
  const text = String(rawDesc || '').trim();
  if (!text) return null;

  const estMatch = /^\[VT ngoài dự kiến\s+([\d.,]+)\s*đ?\s*[-–~]\s*([\d.,]+)\s*đ?\]\s*(.+)$/i.exec(text);
  if (estMatch) {
    const minPrice = parseVnd(estMatch[1]);
    const maxPrice = Math.max(minPrice, parseVnd(estMatch[2]));
    return {
      kind: 'estimated_external',
      cleanName: estMatch[3].trim(),
      minPrice,
      maxPrice,
    };
  }

  const finMatch = /^\[VT ngoài chốt giá(?:\s*\(([^)]*)\))?\]\s*(.+)$/i.exec(text);
  if (finMatch) {
    const meta = finMatch[1] || '';
    const rangeMatch = /dự kiến\s+([\d.,]+)\s*đ?\s*[-–~]\s*([\d.,]+)\s*đ?/i.exec(meta);
    const depMatch = /đã tạm tính\s+([\d.,]+)\s*đ?(?:\s*[x×]\s*(\d+))?/i.exec(meta);
    const minPrice = rangeMatch ? parseVnd(rangeMatch[1]) : null;
    const maxPrice = rangeMatch ? Math.max(minPrice, parseVnd(rangeMatch[2])) : null;
    const priorDeposit = depMatch ? parseVnd(depMatch[1]) : 0;
    const priorDepositQty = depMatch?.[2] ? Math.max(1, Number(depMatch[2])) : null;
    return {
      kind: 'finalized_external',
      cleanName: finMatch[2].trim(),
      minPrice,
      maxPrice,
      priorDeposit,
      ...(priorDepositQty != null ? { priorDepositQty } : {}),
    };
  }

  return null;
}

export function computeQuoteRangeTotals(
  lines = [],
  {
    bookedBase = 0,
    priorApprovedExtra = 0,
    prodDisc = 0,
    comboDisc = 0,
    partDisc = 0,
    voucherDisc = 0,
    lateDisc = 0,
    isOnSite = true,
  } = {},
) {
  const safeLines = Array.isArray(lines) ? lines : [];
  let origSum = 0;
  let fixedExtra = 0;
  let warehouseExtra = 0;
  let customExtraMin = 0;
  let customExtraMax = 0;
  let estMinExtra = 0;
  let estMaxExtra = 0;
  let hasEstimatedRange = false;

  for (const l of safeLines) {
    const qty = Math.max(1, Number(l?.qty) || 1);
    if (l?.isOriginal) {
      origSum += (Number(l.price) || 0) * qty;
      continue;
    }
    const isWarehousePart = !l?.isCustom && (l?.type === 'part' || Boolean(l?.matId));
    if (l?.isEstimatedRange) {
      hasEstimatedRange = true;
      const minP = Math.max(0, Number(l.minPrice) || 0);
      const maxP = Math.max(minP, Number(l.maxPrice) || minP);
      const minVal = minP * qty;
      const maxVal = maxP * qty;
      estMinExtra += minVal;
      estMaxExtra += maxVal;
      if (!isWarehousePart) {
        customExtraMin += minVal;
        customExtraMax += maxVal;
      }
    } else {
      const unitP = (l?.isFinalizedExternal && l.actualPrice != null)
        ? (Number(l.actualPrice) || 0)
        : (Number(l?.price) || 0);
      const lineVal = unitP * qty;
      fixedExtra += lineVal;
      if (isWarehousePart) {
        warehouseExtra += lineVal;
      } else {
        customExtraMin += lineVal;
        customExtraMax += lineVal;
      }
    }
  }

  const extraMin = fixedExtra + estMinExtra;
  const extraMax = fixedExtra + estMaxExtra;
  const base = isOnSite
    ? Math.max(0, (Number(bookedBase) || 0) + (Number(priorApprovedExtra) || 0))
    : Math.max(0, origSum - (Number(prodDisc) || 0) - (Number(comboDisc) || 0));
  const deduct = (Number(partDisc) || 0) + (Number(voucherDisc) || 0) + (Number(lateDisc) || 0);
  const totalMin = Math.max(0, base + extraMin - deduct);
  const totalMax = Math.max(totalMin, base + extraMax - deduct);

  return {
    hasEstimatedRange,
    fixedExtra,
    warehouseExtra,
    customExtraMin,
    customExtraMax,
    estMinExtra,
    estMaxExtra,
    extraMin,
    extraMax,
    totalMin,
    totalMax,
  };
}

export function extractExternalPartLifecycle(quotations = []) {
  const list = sortQuotationsAsc(quotations);
  const estimatedApproved = [];
  const finalizedApprovedItems = [];

  for (const q of list) {
    const approved = q?.quotation_status === 'APPROVED' || q?.customer_decision === 'APPROVED';
    if (!approved) continue;
    for (const it of (q?.items || [])) {
      const meta = parseExternalPartDesc(it?.description_snapshot);
      if (!meta) continue;
      if (meta.kind === 'estimated_external') {
        estimatedApproved.push({
          quotationId: q.quotation_id ?? null,
          itemId: it.quotation_item_id ?? null,
          name: meta.cleanName,
          normKey: normalizeExternalPartName(meta.cleanName),
          minPrice: meta.minPrice,
          maxPrice: meta.maxPrice,
          qty: Math.max(1, Number(it.quantity) || 1),
          unit: 'cái',
          alreadyBilledUnitPrice: Number(it.unit_price) || 0,
        });
      } else if (meta.kind === 'finalized_external') {
        const unitP = Number(it.unit_price) || 0;
        const dep = Number(meta.priorDeposit) || 0;
        const qty = Math.max(1, Number(it.quantity) || 1);
        const depQty = meta.priorDepositQty != null ? Math.max(1, Number(meta.priorDepositQty) || 1) : qty;
        const actualPrice = dep > 0 ? Math.round((dep * depQty + unitP * qty) / qty) : unitP;
        finalizedApprovedItems.push({
          quotationId: q.quotation_id ?? null,
          itemId: it.quotation_item_id ?? null,
          name: meta.cleanName,
          normKey: normalizeExternalPartName(meta.cleanName),
          minPrice: meta.minPrice,
          maxPrice: meta.maxPrice,
          priorDeposit: dep,
          origQty: depQty,
          actualPrice,
          qty,
          unit: 'cái',
          receiptId: it.receipt_attachment_id || null,
        });
      }
    }
  }

  const usedFinalIndexes = new Set();
  const pendingExternalEstimates = [];
  for (const est of estimatedApproved) {
    const matchIdx = finalizedApprovedItems.findIndex(
      (fin, idx) => !usedFinalIndexes.has(idx) && fin.normKey === est.normKey,
    );
    if (matchIdx >= 0) {
      usedFinalIndexes.add(matchIdx);
    } else {
      pendingExternalEstimates.push(est);
    }
  }

  const latestQuote = list.length ? list[list.length - 1] : null;
  const latestHasEstimated = Boolean(
    latestQuote &&
    (latestQuote.items || []).some((it) => parseExternalPartDesc(it?.description_snapshot)?.kind === 'estimated_external'),
  );
  const latestHasFinalized = Boolean(
    latestQuote &&
    !latestHasEstimated &&
    (latestQuote.items || []).some((it) => parseExternalPartDesc(it?.description_snapshot)?.kind === 'finalized_external'),
  );
  const isAwaitingFinalizationApproval = Boolean(
    latestHasFinalized && isQuotationPendingCustomer(latestQuote),
  );
  const isFinalizationRevisionRequested = Boolean(
    latestHasFinalized &&
    (latestQuote?.quotation_status === 'REVISION_REQUESTED' || latestQuote?.customer_decision === 'REVISE'),
  );
  const pendingFinalizationQuote = (isAwaitingFinalizationApproval || isFinalizationRevisionRequested)
    ? latestQuote
    : null;

  let externalPriceState = 'none';
  if (isAwaitingFinalizationApproval) externalPriceState = 'awaiting_customer_approval';
  else if (isFinalizationRevisionRequested) externalPriceState = 'revision_requested';
  else if (pendingExternalEstimates.length > 0) externalPriceState = 'needs_final_price';
  else if (finalizedApprovedItems.length > 0) externalPriceState = 'finalized';

  return {
    estimatedApproved,
    finalizedApprovedItems,
    pendingExternalEstimates,
    pendingFinalizationQuote,
    isAwaitingFinalizationApproval,
    isFinalizationRevisionRequested,
    externalPriceState,
  };
}
