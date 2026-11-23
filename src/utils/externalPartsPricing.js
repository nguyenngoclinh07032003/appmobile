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

const RECEIPT_EVIDENCE_TYPES = new Set([
  'DOCUMENT',
  'RECEIPT',
  'PART_RECEIPT',
  'INVOICE',
  'RECEIPT_PHOTO',
]);
const RECEIPT_NOTE_RE = /^(?:biên lai|hoá đơn|hóa đơn|receipt)\b/i;
const RECEIPT_PREFIX_RE = /^(?:biên lai|hoá đơn|hóa đơn|receipt)(?:\s+(?:vật tư phát sinh|linh kiện mua ngoài|vật tư mua ngoài|mua ngoài|linh kiện|vật tư))?(?:\s*[:\-–—·]+\s*|\s+|$)/i;

// Tách tên linh kiện từ ghi chú ảnh biên lai (vd: "Biên lai vật tư phát sinh: ic bo mạng" -> "ic bo mạng").
// Trả "" nếu ghi chú rỗng hoặc chỉ là nhãn chung ("Biên lai linh kiện mua ngoài").
export function extractReceiptPartName(note) {
  const raw = String(note || '').trim();
  if (!raw || !RECEIPT_PREFIX_RE.test(raw)) return '';
  const stripped = raw.replace(RECEIPT_PREFIX_RE, '').trim();
  return stripped ? normalizeExternalPartName(stripped) : '';
}

export function isReceiptEvidence(ev) {
  if (!ev || !ev.uri) return false;
  if (ev.stage === 'receipt') return true;
  const rawType = String(ev.evidenceType || ev.evidence_type || '').trim().toUpperCase();
  if (RECEIPT_EVIDENCE_TYPES.has(rawType)) return true;
  return RECEIPT_NOTE_RE.test(String(ev.note || ev.description || '').trim());
}

const receiptEvKey = (ev) => {
  if (!ev) return '';
  if (ev.dbAttachmentId != null) return `id:${ev.dbAttachmentId}`;
  return ev.uri ? `uri:${ev.uri}` : '';
};

// Đối chiếu ảnh biên lai trong `evidence` với từng dòng linh kiện mua ngoài của báo giá.
// Hỗ trợ: (1) exact receiptId / receiptUrl, (2) tên linh kiện trong mô tả ảnh, (3) fallback khi chỉ có 1 dòng mua ngoài.
export function matchReceiptsToQuoteLines(lines = [], evidence = []) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const safeEv = Array.isArray(evidence) ? evidence : [];
  const lineReceipts = new Map();
  const usedKeys = new Set();

  const byAttId = new Map();
  safeEv.forEach((ev) => {
    if (ev?.dbAttachmentId != null && ev?.uri) {
      const k = String(ev.dbAttachmentId);
      if (!byAttId.has(k)) byAttId.set(k, ev);
    }
  });

  const poolSeen = new Set();
  const receiptPool = safeEv
    .filter(isReceiptEvidence)
    .filter((ev) => {
      const k = receiptEvKey(ev);
      if (!k || poolSeen.has(k)) return false;
      poolSeen.add(k);
      return true;
    })
    .sort((a, b) => {
      const ia = Number(a?.dbAttachmentId);
      const ib = Number(b?.dbAttachmentId);
      if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ib - ia;
      if (Number.isFinite(ib) && !Number.isFinite(ia)) return 1;
      if (Number.isFinite(ia) && !Number.isFinite(ib)) return -1;
      return (Number(b?.at) || 0) - (Number(a?.at) || 0);
    });

  // Pass 1: khớp theo receiptId hoặc receiptUrl gắn trực tiếp trên dòng báo giá.
  safeLines.forEach((l, i) => {
    if (!l) return;
    if (l.receiptId != null) {
      const exact = byAttId.get(String(l.receiptId));
      if (exact) {
        lineReceipts.set(i, exact);
        const k = receiptEvKey(exact);
        if (k) usedKeys.add(k);
        return;
      }
    }
    if (l.receiptUrl) {
      const synth = {
        id: l.receiptId != null ? `att-${l.receiptId}` : `url-line-${i}`,
        dbAttachmentId: l.receiptId ?? null,
        uri: l.receiptUrl,
        stage: 'receipt',
        note: l.name ? `Hoá đơn mua ngoài · ${l.name}` : '',
      };
      lineReceipts.set(i, synth);
      const k = receiptEvKey(synth);
      if (k) usedKeys.add(k);
    }
  });

  const eligibleIndices = [];
  safeLines.forEach((l, i) => {
    if (l && !l.isOriginal && !l.isEstimatedRange && (l.isFinalizedExternal || l.isCustom)) {
      eligibleIndices.push(i);
    }
  });
  const missingIndices = eligibleIndices.filter((i) => !lineReceipts.has(i));

  // Pass 2: khớp theo tên linh kiện ghi trong mô tả ảnh (description / note).
  for (const i of missingIndices) {
    const normLine = normalizeExternalPartName(safeLines[i]?.name);
    if (!normLine) continue;
    const matched = receiptPool.find((ev) => {
      const k = receiptEvKey(ev);
      if (!k || usedKeys.has(k)) return false;
      const evPart = extractReceiptPartName(ev.note);
      if (!evPart) return false;
      return evPart === normLine || evPart.includes(normLine) || normLine.includes(evPart);
    });
    if (matched) {
      lineReceipts.set(i, matched);
      usedKeys.add(receiptEvKey(matched));
    }
  }

  // Pass 3: fallback khi chỉ còn duy nhất 1 dòng mua ngoài chưa gắn biên lai (vd: BE từ chối gắn 409 khi báo giá đang SENT và bỏ trống description).
  const stillMissing = eligibleIndices.filter((i) => !lineReceipts.has(i));
  const unusedReceipts = receiptPool.filter((ev) => !usedKeys.has(receiptEvKey(ev)));
  const genericUnused = unusedReceipts.filter((ev) => !extractReceiptPartName(ev.note));

  if (stillMissing.length === 1 && genericUnused.length >= 1) {
    const newest = genericUnused[0];
    lineReceipts.set(stillMissing[0], newest);
    usedKeys.add(receiptEvKey(newest));
    if (eligibleIndices.length === 1) {
      genericUnused.forEach((ev) => usedKeys.add(receiptEvKey(ev)));
    }
  } else if (stillMissing.length === 1 && lineReceipts.size === 0 && unusedReceipts.length === 1) {
    lineReceipts.set(stillMissing[0], unusedReceipts[0]);
    usedKeys.add(receiptEvKey(unusedReceipts[0]));
  }

  // Pass 4: danh sách ảnh biên lai còn lại chưa gắn được vào dòng cụ thể (hiển thị thành dải đối chiếu).
  const finalMissing = eligibleIndices.filter((i) => !lineReceipts.has(i));
  const unmatchedReceipts = (
    finalMissing.length > 0 || (eligibleIndices.length === 0 && lineReceipts.size === 0)
  )
    ? receiptPool.filter((ev) => !usedKeys.has(receiptEvKey(ev)))
    : [];

  return { lineReceipts, unmatchedReceipts };
}

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
  const grossTotalMin = Math.max(0, base + extraMin);
  const grossTotalMax = Math.max(grossTotalMin, base + extraMax);
  const totalMin = Math.max(0, grossTotalMin - deduct);
  const totalMax = Math.max(totalMin, grossTotalMax - deduct);

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
    grossTotalMin,
    grossTotalMax,
    totalMin,
    totalMax,
  };
}

export function parseDepositFinalizedNotes(progressList = []) {
  const out = new Set();
  if (!Array.isArray(progressList)) return out;
  for (const p of progressList) {
    const note = String(p?.note || '').trim();
    if (!note) continue;
    const m = /\[Chốt VT ngoài bằng tạm tính\]\s*(.+)$/i.exec(note);
    if (!m) continue;
    m[1].split('|').forEach((part) => {
      const k = normalizeExternalPartName(part);
      if (k) out.add(k);
    });
  }
  return out;
}

export function extractExternalPartLifecycle(quotations = [], progressList = []) {
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
        const finAtt = it?.receipt_attachment && typeof it.receipt_attachment === 'object' ? it.receipt_attachment : null;
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
          receiptId: it.receipt_attachment_id ?? finAtt?.attachment_id ?? finAtt?.id ?? null,
          receiptUrl: it.receipt_url || it.receipt_image_url || finAtt?.image_url || finAtt?.file_url || finAtt?.url || finAtt?.uri || null,
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

  const depositSettledNames = parseDepositFinalizedNotes(progressList);
  if (depositSettledNames.size > 0 && pendingExternalEstimates.length > 0) {
    const stillPending = [];
    for (const est of pendingExternalEstimates) {
      if (depositSettledNames.has(est.normKey)) {
        finalizedApprovedItems.push({
          quotationId: est.quotationId,
          itemId: est.itemId,
          name: est.name,
          normKey: est.normKey,
          minPrice: est.minPrice,
          maxPrice: est.maxPrice,
          priorDeposit: est.alreadyBilledUnitPrice,
          origQty: est.qty,
          actualPrice: est.alreadyBilledUnitPrice,
          qty: est.qty,
          unit: est.unit || 'cái',
          receiptId: null,
          settledAtDeposit: true,
        });
      } else {
        stillPending.push(est);
      }
    }
    pendingExternalEstimates.length = 0;
    pendingExternalEstimates.push(...stillPending);
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
