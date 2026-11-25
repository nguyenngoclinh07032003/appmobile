import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRangeVND,
  formatEstimatedExternalDesc,
  formatFinalizedExternalDesc,
  parseExternalPartDesc,
  computeQuoteRangeTotals,
  extractExternalPartLifecycle,
  sortQuotationsAsc,
  matchReceiptsToQuoteLines,
  extractOrderReceiptPhotos,
} from '../src/utils/externalPartsPricing.js';
import {
  MATERIALS,
  ORDER_STEPS,
  TECH_ORDER_STEPS,
  stepIndexOf,
  techStepIndexOf,
  syncCatalogFromBackend,
} from '../src/constants/data.js';

test('externalPartsPricing: mã hoá và giải mã mô tả giá dao động & chốt giá thực tế', () => {
  assert.equal(formatRangeVND(120000, 180000), '120.000đ – 180.000đ');
  assert.equal(formatRangeVND(150000, 150000), '150.000đ');
  assert.equal(formatRangeVND(120000, 180000, { prefix: '+' }), '+120.000đ – 180.000đ');

  const estDesc = formatEstimatedExternalDesc({
    name: 'Dây đồng Thái Lan 2m',
    minPrice: 120000,
    maxPrice: 180000,
  });
  assert.equal(estDesc, '[VT ngoài dự kiến 120.000đ - 180.000đ] Dây đồng Thái Lan 2m');
  assert.deepEqual(parseExternalPartDesc(estDesc), {
    kind: 'estimated_external',
    cleanName: 'Dây đồng Thái Lan 2m',
    minPrice: 120000,
    maxPrice: 180000,
  });

  const finDesc = formatFinalizedExternalDesc({
    name: 'Dây đồng Thái Lan 2m',
    minPrice: 120000,
    maxPrice: 180000,
  });
  assert.equal(finDesc, '[VT ngoài chốt giá (dự kiến 120.000đ - 180.000đ)] Dây đồng Thái Lan 2m');
  assert.deepEqual(parseExternalPartDesc(finDesc), {
    kind: 'finalized_external',
    cleanName: 'Dây đồng Thái Lan 2m',
    minPrice: 120000,
    maxPrice: 180000,
    priorDeposit: 0,
  });

  const finWithDeposit = formatFinalizedExternalDesc({
    name: 'Tụ ngậm 35uF',
    minPrice: 100000,
    maxPrice: 150000,
    priorDeposit: 100000,
  });
  assert.deepEqual(parseExternalPartDesc(finWithDeposit), {
    kind: 'finalized_external',
    cleanName: 'Tụ ngậm 35uF',
    minPrice: 100000,
    maxPrice: 150000,
    priorDeposit: 100000,
  });

  assert.equal(parseExternalPartDesc('Vệ sinh máy lạnh'), null);
});

test('externalPartsPricing: computeQuoteRangeTotals tính đúng vật tư kho, giá dao động, kết hợp và giảm giá', () => {
  // Chỉ có vật tư kho cố định
  const onlyWarehouse = computeQuoteRangeTotals(
    [
      { isOriginal: true, price: 150000, qty: 1 },
      { type: 'part', price: 80000, qty: 1, isCustom: false },
    ],
    { bookedBase: 150000, isOnSite: true },
  );
  assert.equal(onlyWarehouse.hasEstimatedRange, false);
  assert.equal(onlyWarehouse.extraMin, 80000);
  assert.equal(onlyWarehouse.extraMax, 80000);
  assert.equal(onlyWarehouse.totalMin, 230000);
  assert.equal(onlyWarehouse.totalMax, 230000);

  // Chỉ có vật tư mua ngoài báo giá dao động
  const onlyEstimated = computeQuoteRangeTotals(
    [
      { isOriginal: true, price: 5000, qty: 1 },
      { type: 'part', isCustom: true, isEstimatedRange: true, minPrice: 120000, maxPrice: 180000, price: 0, qty: 1 },
    ],
    { bookedBase: 5000, isOnSite: true },
  );
  assert.equal(onlyEstimated.hasEstimatedRange, true);
  assert.equal(onlyEstimated.extraMin, 120000);
  assert.equal(onlyEstimated.extraMax, 180000);
  assert.equal(onlyEstimated.totalMin, 125000);
  assert.equal(onlyEstimated.totalMax, 185000);

  // Kết hợp vật tư kho + vật tư ngoài dao động (x2) + giảm giá thành viên & voucher
  const combined = computeQuoteRangeTotals(
    [
      { isOriginal: true, price: 200000, qty: 1 },
      { type: 'part', price: 50000, qty: 1 },
      { type: 'part', isCustom: true, isEstimatedRange: true, minPrice: 100000, maxPrice: 140000, price: 0, qty: 2 },
    ],
    { bookedBase: 200000, priorApprovedExtra: 30000, partDisc: 10000, voucherDisc: 20000, isOnSite: true },
  );
  assert.equal(combined.extraMin, 250000);
  assert.equal(combined.extraMax, 330000);
  assert.equal(combined.totalMin, 450000);
  assert.equal(combined.totalMax, 530000);

  // Trước khi xuất phát (giảm sản phẩm áp trực tiếp trên dịch vụ gốc)
  const preVisit = computeQuoteRangeTotals(
    [
      { isOriginal: true, price: 300000, qty: 1 },
      { type: 'part', isCustom: true, isEstimatedRange: true, minPrice: 100000, maxPrice: 150000, price: 0, qty: 1 },
    ],
    { prodDisc: 50000, isOnSite: false },
  );
  assert.equal(preVisit.totalMin, 350000);
  assert.equal(preVisit.totalMax, 400000);
});

test('externalPartsPricing: vòng đời đầy đủ dự kiến -> gửi giá thực tế -> yêu cầu nhập lại -> nghiệm thu hoàn tất', () => {
  const estItemDesc = formatEstimatedExternalDesc({
    name: 'Dây đồng 2m',
    minPrice: 120000,
    maxPrice: 180000,
  });
  const finItemDesc = formatFinalizedExternalDesc({
    name: 'Dây đồng 2m',
    minPrice: 120000,
    maxPrice: 180000,
    priorDeposit: 0,
  });

  const q1Approved = {
    quotation_id: 10,
    quotation_type: 'SUPPLEMENTAL',
    quotation_status: 'APPROVED',
    total_amount: 0,
    items: [
      {
        quotation_item_id: 101,
        item_type: 'SERVICE',
        description_snapshot: estItemDesc,
        quantity: 1,
        unit_price: 0,
      },
    ],
  };

  // Giai đoạn 1: khách duyệt giá dao động → cần chốt giá thực tế khi sửa xong
  const s1 = extractExternalPartLifecycle([q1Approved]);
  assert.equal(s1.externalPriceState, 'needs_final_price');
  assert.equal(s1.pendingExternalEstimates.length, 1);
  assert.equal(s1.pendingExternalEstimates[0].name, 'Dây đồng 2m');

  // Giai đoạn 2: thợ nhập giá thực tế 145.000đ + gắn biên lai 555 → chờ khách nghiệm thu
  const q2Sent = {
    quotation_id: 11,
    quotation_type: 'SUPPLEMENTAL',
    quotation_status: 'SENT',
    total_amount: 145000,
    items: [
      {
        quotation_item_id: 102,
        item_type: 'MATERIAL',
        is_external_purchase: true,
        receipt_attachment_id: 555,
        description_snapshot: finItemDesc,
        quantity: 1,
        unit_price: 145000,
      },
    ],
  };
  const s2 = extractExternalPartLifecycle([q1Approved, q2Sent]);
  assert.equal(s2.externalPriceState, 'awaiting_customer_approval');
  assert.equal(s2.isAwaitingFinalizationApproval, true);
  assert.equal(s2.pendingExternalEstimates.length, 1);

  // Giai đoạn 3: khách yêu cầu nhập lại giá
  const q2Revise = { ...q2Sent, quotation_status: 'REVISION_REQUESTED', customer_decision: 'REVISE' };
  const s3 = extractExternalPartLifecycle([q1Approved, q2Revise]);
  assert.equal(s3.externalPriceState, 'revision_requested');
  assert.equal(s3.isFinalizationRevisionRequested, true);
  assert.equal(s3.pendingFinalizationQuote.quotation_id, 11);

  // Giai đoạn 4: thợ gửi lại 140.000đ và khách đồng ý nghiệm thu → không còn pending, tổng chuẩn 140.000đ
  const q3Approved = {
    quotation_id: 12,
    quotation_type: 'SUPPLEMENTAL',
    quotation_status: 'APPROVED',
    total_amount: 140000,
    items: [
      {
        quotation_item_id: 103,
        item_type: 'MATERIAL',
        is_external_purchase: true,
        receipt_attachment_id: 556,
        description_snapshot: finItemDesc,
        quantity: 1,
        unit_price: 140000,
      },
    ],
  };
  const s4 = extractExternalPartLifecycle([q1Approved, q2Revise, q3Approved]);
  assert.equal(s4.externalPriceState, 'finalized');
  assert.equal(s4.pendingExternalEstimates.length, 0);
  assert.equal(s4.finalizedApprovedItems.length, 1);
  assert.equal(s4.finalizedApprovedItems[0].actualPrice, 140000);
  assert.equal(s4.finalizedApprovedItems[0].receiptId, 556);
});

test('externalPartsPricing: cộng tổng đồng thời dịch vụ gốc + vật tư kho + phí phát sinh cố định + VT mua ngoài giá dao động', () => {
  const combined = computeQuoteRangeTotals(
    [
      { isOriginal: true, price: 5000, qty: 1 },
      { type: 'part', matId: 'm-db-18', name: 'Dây điện + CB', price: 120000, qty: 1, isCustom: false },
      { type: 'labor', name: 'Công đi lại dây điện âm tường', price: 80000, qty: 1, isCustom: true, isEstimatedRange: false },
      { type: 'part', name: 'Tụ điện ngoài', isCustom: true, isEstimatedRange: true, minPrice: 100000, maxPrice: 150000, price: 0, qty: 1 },
    ],
    { bookedBase: 5000, isOnSite: true },
  );

  assert.equal(combined.hasEstimatedRange, true);
  assert.equal(combined.warehouseExtra, 120000);
  assert.equal(combined.customExtraMin, 180000);
  assert.equal(combined.customExtraMax, 230000);
  assert.equal(combined.extraMin, 300000);
  assert.equal(combined.extraMax, 350000);
  assert.equal(combined.totalMin, 305000);
  assert.equal(combined.totalMax, 355000);

  // Kiểm tra parse dấu phân tách rộng hơn (-, –, ~)
  const dashRes = parseExternalPartDesc('[VT ngoài dự kiến 100.000đ – 150.000đ] Dây đồng 2m');
  assert.equal(dashRes?.kind, 'estimated_external');
  assert.equal(dashRes?.minPrice, 100000);
  assert.equal(dashRes?.maxPrice, 150000);
});

test('syncCatalogFromBackend: bảo toàn đơn giá vật tư kho khi API thợ không trả unit_price hoặc trả 0/null', () => {
  // Đợt 1: Nạp bảng giá niêm yết từ /customer/materials
  syncCatalogFromBackend({
    materials: [
      { material_id: 18, material_name: 'Dây điện + CB', unit_price: 120000, unit_of_measure: 'bộ' },
      { material_id: 99, material_name: 'Dây điện đơn', selling_price: 45000, unit_of_measure: 'm' },
      { material_id: 100, material_name: 'Vật tư mới chưa có giá', unit_price: null, unit_of_measure: 'cái' },
    ],
  });
  assert.equal(MATERIALS.find((m) => m.dbId === 18)?.price, 120000);
  assert.equal(MATERIALS.find((m) => m.dbId === 99)?.price, 45000);
  assert.equal(MATERIALS.find((m) => m.dbId === 100)?.price, 0);
  assert.equal(MATERIALS.find((m) => m.dbId === 100)?.unpricedInCatalog, true);

  // Đợt 2: /technician/jobs/materials đồng bộ lại nhưng thiếu unit_price hoặc trả 0
  syncCatalogFromBackend({
    materials: [
      { material_id: 18, material_name: 'Dây điện + CB', unit_price: null, unit_of_measure: 'bộ' },
      { material_id: 99, material_name: 'Dây điện đơn', unit_price: 0, unit_of_measure: 'm' },
      { material_id: 100, material_name: 'Vật tư mới chưa có giá', unit_of_measure: 'cái' },
    ],
  });
  assert.equal(MATERIALS.find((m) => m.dbId === 18)?.price, 120000);
  assert.equal(MATERIALS.find((m) => m.dbId === 99)?.price, 45000);
  assert.equal(MATERIALS.find((m) => m.dbId === 100)?.price, 0);
  assert.equal(MATERIALS.find((m) => m.dbId === 100)?.unpricedInCatalog, true);
});

test('externalPartsPricing: vật tư phát sinh thêm mới chốt giá cuối trực tiếp (không có khoảng dự kiến) kết hợp VT giá dao động', () => {
  const newDirectDesc = formatFinalizedExternalDesc({
    name: 'Dây điện phát sinh 5m',
    minPrice: null,
    maxPrice: null,
    priorDeposit: 0,
  });
  assert.equal(newDirectDesc, '[VT ngoài chốt giá] Dây điện phát sinh 5m');
  assert.deepEqual(parseExternalPartDesc(newDirectDesc), {
    kind: 'finalized_external',
    cleanName: 'Dây điện phát sinh 5m',
    minPrice: null,
    maxPrice: null,
    priorDeposit: 0,
  });

  const qEstApproved = {
    quotation_id: 20,
    quotation_type: 'SUPPLEMENTAL',
    quotation_status: 'APPROVED',
    total_amount: 0,
    items: [
      {
        quotation_item_id: 201,
        item_type: 'SERVICE',
        description_snapshot: formatEstimatedExternalDesc({
          name: 'Tụ kích máy nén',
          minPrice: 120000,
          maxPrice: 180000,
        }),
        quantity: 1,
        unit_price: 0,
      },
    ],
  };

  const qBillSent = {
    quotation_id: 21,
    quotation_type: 'SUPPLEMENTAL',
    quotation_status: 'SENT',
    total_amount: 230000,
    items: [
      {
        quotation_item_id: 202,
        item_type: 'MATERIAL',
        is_external_purchase: true,
        receipt_attachment_id: 777,
        description_snapshot: formatFinalizedExternalDesc({
          name: 'Tụ kích máy nén',
          minPrice: 120000,
          maxPrice: 180000,
          priorDeposit: 0,
        }),
        quantity: 1,
        unit_price: 140000,
      },
      {
        quotation_item_id: 203,
        item_type: 'SERVICE',
        is_external_purchase: false,
        description_snapshot: newDirectDesc,
        quantity: 1,
        unit_price: 90000,
      },
    ],
  };

  const waitingLifecycle = extractExternalPartLifecycle([qEstApproved, qBillSent]);
  assert.equal(waitingLifecycle.externalPriceState, 'awaiting_customer_approval');
  assert.equal(waitingLifecycle.isAwaitingFinalizationApproval, true);
  assert.equal(waitingLifecycle.pendingExternalEstimates.length, 1);

  const qBillApproved = { ...qBillSent, quotation_status: 'APPROVED', customer_decision: 'APPROVED' };
  const finalizedLifecycle = extractExternalPartLifecycle([qEstApproved, qBillApproved]);
  assert.equal(finalizedLifecycle.externalPriceState, 'finalized');
  assert.equal(finalizedLifecycle.pendingExternalEstimates.length, 0);
  assert.equal(finalizedLifecycle.finalizedApprovedItems.length, 2);
  assert.equal(finalizedLifecycle.finalizedApprovedItems[0].actualPrice, 140000);
  assert.equal(finalizedLifecycle.finalizedApprovedItems[1].name, 'Dây điện phát sinh 5m');
  assert.equal(finalizedLifecycle.finalizedApprovedItems[1].actualPrice, 90000);
  assert.equal(finalizedLifecycle.finalizedApprovedItems[1].receiptId, null);

  const billRange = computeQuoteRangeTotals(
    [
      { isOriginal: true, price: 250000, qty: 1 },
      { type: 'part', name: 'Tụ kích máy nén', isCustom: true, isFinalizedExternal: true, price: 140000, actualPrice: 140000, qty: 1 },
      { type: 'part', name: 'Dây điện phát sinh 5m', isCustom: true, isFinalizedExternal: true, price: 90000, actualPrice: 90000, qty: 1 },
    ],
    { bookedBase: 250000, isOnSite: true },
  );
  assert.equal(billRange.hasEstimatedRange, false);
  assert.equal(billRange.extraMax, 230000);
  assert.equal(billRange.totalMax, 480000);
});

test('stepIndexOf & techStepIndexOf: giữ nguyên bước repairing khi chốt giá cuối gửi Bill (không tụt lùi timeline)', () => {
  const customerRepairingIdx = ORDER_STEPS.findIndex((s) => s.key === 'repairing');
  const techRepairingIdx = TECH_ORDER_STEPS.findIndex((s) => s.key === 'repairing');

  // Truyền chuỗi status (tương thích ngược)
  assert.equal(stepIndexOf('quoted'), ORDER_STEPS.findIndex((s) => s.key === 'quoted'));
  assert.equal(techStepIndexOf('quoted'), TECH_ORDER_STEPS.findIndex((s) => s.key === 'diagnosing'));
  assert.equal(stepIndexOf('repairing'), customerRepairingIdx);
  assert.equal(techStepIndexOf('repairing'), techRepairingIdx);

  // Khi thợ đang sửa gửi Bill chi phí cuối (quoted + isExternalFinalization) -> giữ ở bước repairing
  const waitingBillOrder = {
    status: 'quoted',
    quote: { isExternalFinalization: true, revisionRequested: false },
  };
  assert.equal(stepIndexOf(waitingBillOrder), customerRepairingIdx);
  assert.equal(techStepIndexOf(waitingBillOrder), techRepairingIdx);

  // Khi khách yêu cầu chỉnh lại giá vật tư cuối (diagnosing + isExternalFinalization + revisionRequested) -> vẫn giữ ở repairing
  const revisingBillOrder = {
    status: 'diagnosing',
    quote: { isExternalFinalization: true, revisionRequested: true },
  };
  assert.equal(stepIndexOf(revisingBillOrder), customerRepairingIdx);
  assert.equal(techStepIndexOf(revisingBillOrder), techRepairingIdx);

  // Báo giá phát sinh trước khi sửa bình thường vẫn ở bước quoted / diagnosing
  const initialQuoteOrder = {
    status: 'quoted',
    quote: { isExternalFinalization: false, revisionRequested: false },
  };
  assert.equal(stepIndexOf(initialQuoteOrder), ORDER_STEPS.findIndex((s) => s.key === 'quoted'));
  assert.equal(techStepIndexOf(initialQuoteOrder), TECH_ORDER_STEPS.findIndex((s) => s.key === 'diagnosing'));
});

test('sortQuotationsAsc: luôn đặt báo giá mới nhất ở cuối kể cả khi backend trả giảm dần', () => {
  const descQuotes = [
    { quotation_id: 22, sent_at: '2026-11-20T00:15:00Z', items: [{ quotation_item_id: 201, is_external_purchase: true }] },
    { quotation_id: 18, sent_at: '2026-11-20T00:05:00Z', items: [] },
  ];
  const sorted = sortQuotationsAsc(descQuotes);
  assert.equal(sorted[sorted.length - 1].quotation_id, 22);
});

test('externalPartsPricing: bảo toàn đơn giá chốt khi số lượng cuối khác số lượng tạm tính ban đầu (priorDepositQty)', () => {
  const desc = formatFinalizedExternalDesc({
    name: 'Tụ kích máy nén',
    minPrice: 100000,
    maxPrice: 150000,
    priorDeposit: 100000,
    priorDepositQty: 1,
  });
  const parsed = parseExternalPartDesc(desc);
  assert.equal(parsed?.kind, 'finalized_external');
  assert.equal(parsed?.priorDeposit, 100000);
  assert.equal(parsed?.priorDepositQty, 1);

  const qEstApproved = {
    quotation_id: 30,
    quotation_type: 'SUPPLEMENTAL',
    quotation_status: 'APPROVED',
    items: [
      {
        quotation_item_id: 301,
        item_type: 'SERVICE',
        description_snapshot: formatEstimatedExternalDesc({
          name: 'Tụ kích máy nén',
          minPrice: 100000,
          maxPrice: 150000,
        }),
        quantity: 1,
        unit_price: 100000,
      },
    ],
  };

  // Thợ tăng số lượng lên 2 với giá chốt 120.000đ/cái (tổng 240.000đ - đã thu 100.000đ x 1 = chênh lệch 140.000đ -> unit_price 70.000đ x 2)
  const qFinalApproved = {
    quotation_id: 31,
    quotation_type: 'SUPPLEMENTAL',
    quotation_status: 'APPROVED',
    customer_decision: 'APPROVED',
    items: [
      {
        quotation_item_id: 302,
        item_type: 'MATERIAL',
        is_external_purchase: true,
        description_snapshot: desc,
        quantity: 2,
        unit_price: 70000,
      },
    ],
  };

  const lc = extractExternalPartLifecycle([qEstApproved, qFinalApproved]);
  assert.equal(lc.finalizedApprovedItems.length, 1);
  assert.equal(lc.finalizedApprovedItems[0].actualPrice, 120000);
  assert.equal(lc.finalizedApprovedItems[0].qty, 2);
  assert.equal(lc.finalizedApprovedItems[0].origQty, 1);
});

test('matchReceiptsToQuoteLines: khớp ảnh hoá đơn cho cả vật tư danh mục phát sinh (Gas R32) và vật tư ngoài', () => {
  const catalogPart = { name: 'Gas R32', type: 'part', isCustom: false, isOriginal: false, price: 250000, qty: 1 };
  const customPart = { name: 'Tụ kích lốc máy', type: 'part', isCustom: true, isFinalizedExternal: true, isOriginal: false, price: 150000, qty: 1 };

  const gasReceipt = {
    id: 'ev-gas',
    dbAttachmentId: 901,
    uri: 'https://cdn.example.com/gas-r32.jpg',
    stage: 'receipt',
    evidenceType: 'DOCUMENT',
    note: 'Biên lai vật tư phát sinh: Gas R32',
  };
  const customReceipt = {
    id: 'ev-tu',
    dbAttachmentId: 902,
    uri: 'https://cdn.example.com/tu-kich.jpg',
    stage: 'receipt',
    evidenceType: 'DOCUMENT',
    note: 'Biên lai vật tư phát sinh: Tụ kích lốc máy',
  };
  const genericReceipt = {
    id: 'ev-gen',
    dbAttachmentId: 903,
    uri: 'https://cdn.example.com/generic.jpg',
    stage: 'receipt',
    evidenceType: 'DOCUMENT',
    note: 'Hoá đơn mua linh kiện',
  };

  // 1) Hoá đơn ghi tên vật tư danh mục ("Biên lai vật tư phát sinh: Gas R32") khớp đúng dòng catalogPart
  const resCatalog = matchReceiptsToQuoteLines([catalogPart], [gasReceipt]);
  assert.equal(resCatalog.lineReceipts.get(0)?.dbAttachmentId, 901);
  assert.equal(resCatalog.unmatchedReceipts.length, 0);

  // 2) Hoá đơn không ghi tên KHÔNG bị gán nhầm vào vật tư kho khi không có dòng custom; vẫn hiện ở dải đối chiếu
  const resGenericCatalogOnly = matchReceiptsToQuoteLines([catalogPart], [genericReceipt]);
  assert.equal(resGenericCatalogOnly.lineReceipts.get(0), undefined);
  assert.equal(resGenericCatalogOnly.unmatchedReceipts.length, 1);

  // 3) Kết hợp cả vật tư danh mục + vật tư ngoài, mỗi dòng đều khớp đúng hoá đơn tương ứng và không bị trùng
  const resBoth = matchReceiptsToQuoteLines([catalogPart, customPart], [gasReceipt, customReceipt]);
  assert.equal(resBoth.lineReceipts.get(0)?.dbAttachmentId, 901);
  assert.equal(resBoth.lineReceipts.get(1)?.dbAttachmentId, 902);
  assert.equal(resBoth.unmatchedReceipts.length, 0);
});

test('extractOrderReceiptPhotos: gom đủ hoá đơn từ evidence/quotations, giữ bản mới nhất khi thợ cập nhật lại', () => {
  const order = {
    evidence: [
      { id: 'ev-before', dbAttachmentId: 10, uri: 'https://cdn.example.com/before.jpg', stage: 'before', evidenceType: 'BEFORE_REPAIR', note: 'Trước sửa' },
      { id: 'ev-after', dbAttachmentId: 11, uri: 'https://cdn.example.com/after.jpg', stage: 'after', evidenceType: 'AFTER_REPAIR', note: 'Sau sửa' },
      { id: 'ev-old', dbAttachmentId: 100, uri: 'https://cdn.example.com/gas-old.jpg', stage: 'receipt', evidenceType: 'DOCUMENT', note: 'Biên lai vật tư phát sinh: Gas R32', at: 1000 },
      { id: 'ev-new', dbAttachmentId: 101, uri: 'https://cdn.example.com/gas-new.jpg', stage: 'receipt', evidenceType: 'DOCUMENT', note: 'Biên lai vật tư phát sinh: Gas R32', at: 2000 },
      { id: 'ev-gen', dbAttachmentId: 102, uri: 'https://cdn.example.com/gen.jpg', stage: 'receipt', evidenceType: 'DOCUMENT', note: 'Hoá đơn mua ngoài', at: 2500 },
    ],
    quote: {
      lines: [
        { name: 'Gas R32', receiptId: 101, receiptUrl: 'https://cdn.example.com/gas-new.jpg' },
      ],
    },
    quotations: [
      {
        quotation_id: 50,
        sent_at: '2026-11-26T00:00:00Z',
        items: [
          {
            quotation_item_id: 501,
            description_snapshot: '[VT ngoài chốt giá] Tụ kích lốc máy',
            receipt_attachment_id: 103,
            receipt_attachment: {
              attachment_id: 103,
              image_url: 'https://cdn.example.com/tu-kich.jpg',
              evidence_type: 'DOCUMENT',
              description: 'Biên lai vật tư phát sinh: Tụ kích lốc máy',
            },
          },
        ],
      },
    ],
  };

  const receipts = extractOrderReceiptPhotos(order);
  assert.deepEqual(receipts.map((r) => r.dbAttachmentId), [103, 102, 101]);
  assert.equal(receipts[0].label, 'Tụ kích lốc máy');
  assert.equal(receipts[1].label, 'Hoá đơn vật tư phát sinh');
  assert.equal(receipts[2].label, 'Gas R32');
  assert.equal(receipts[2].uri, 'https://cdn.example.com/gas-new.jpg');
});
