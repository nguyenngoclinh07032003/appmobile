import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './helpers/register-loader.mjs';

const { syncCatalogFromBackend } = await import('../src/constants/data.js');
const {
  computeQuoteRangeTotals,
  extractExternalPartLifecycle,
  parseDepositFinalizedNotes,
  formatEstimatedExternalDesc,
  formatFinalizedExternalDesc,
  extractReceiptPartName,
  isReceiptEvidence,
  matchReceiptsToQuoteLines,
} = await import('../src/utils/externalPartsPricing.js');
const { parseSymptomsField } = await import('../src/utils/symptomItems.js');
const sync = await import('../src/services/syncService.js');
const ctx = await import('../src/context/AppContext.js');

const {
  mapBackendCustomerRequestToOrder,
  mapBackendTechJobToOrder,
  mapBackendStatusToAppStatus,
  mergeCustomerRequestDetail,
  mapBackendPhotoToEvidence,
  extractInitialAttachments,
} = sync;
const { orderTotal, formatOrderTotal, isPaid } = ctx;

syncCatalogFromBackend({
  categories: [{ category_id: 1, category_name: 'Điện lạnh', is_active: true }],
  services: [
    { service_id: 101, category_id: 1, service_name: 'Vệ sinh máy lạnh treo tường', base_price: 250000 },
    { service_id: 103, category_id: 1, service_name: 'Sửa máy lạnh không lạnh', base_price: 200000 },
  ],
  materials: [
    { material_id: 1, material_name: 'Gas R32', unit_price: 250000, unit_of_measure: 'kg' },
    { material_id: 18, material_name: 'Dây điện + CB', unit_price: 120000, unit_of_measure: 'bộ' },
  ],
});

const baseReq = (overrides = {}) => ({
  request_id: 9100,
  request_code: 'REQ-9100',
  request_type: 'NORMAL',
  request_status: 'IN_PROGRESS',
  preferred_time: '2026-11-25T09:00:00+07:00',
  items: [{ request_service_id: 1010, service_id: 101, service_name: 'Vệ sinh máy lạnh treo tường', selected_price: 250000, quantity: 1 }],
  quotations: [],
  diagnoses: [],
  progress: [],
  created_at: '2026-11-23T08:00:00Z',
  updated_at: '2026-11-23T09:00:00Z',
  ...overrides,
});

const quoteCardTotals = (o) => {
  const effectivePriorExtra = o.quote.effectivePriorExtra ?? (
    o.quote.includesPriorApprovedLines
      ? (Number(o.quote.initialServiceDelta) || 0)
      : (Number(o.quote.priorApprovedExtra) || 0)
  );
  const isOnSite =
    o.quote.quotationType === 'SUPPLEMENTAL' ||
    Boolean(o.quote.includesPriorApprovedLines) ||
    !(o.quote.lines || []).some((l) => l.isOriginal);
  return computeQuoteRangeTotals(o.quote.lines || [], {
    bookedBase: o.quote.booked ?? ctx.bookedValue(o),
    priorApprovedExtra: effectivePriorExtra,
    prodDisc: Number(o.productDiscount) || 0,
    comboDisc: Number(o.comboDiscount) || 0,
    partDisc: ctx.tierPartDiscountAmount(o),
    voucherDisc: Number(o.voucherDiscount) || 0,
    lateDisc: ctx.lateDiscountAmount(o),
    isOnSite,
  });
};

describe('qaRoleplayFixes: kiểm thử toàn bộ lỗi đồng bộ Khách ↔ Thợ', () => {
  test('Fix #3: INITIAL đổi số lượng dịch vụ (tăng 1->2 và giảm 2->1) + SUPPLEMENTAL khớp 100% Khách ↔ Thợ', () => {
    const q1Inc = {
      quotation_id: 1,
      quotation_type: 'INITIAL',
      quotation_status: 'APPROVED',
      total_amount: 620000,
      sent_at: '2026-11-23T08:10:00Z',
      items: [
        { quotation_item_id: 11, item_type: 'SERVICE', request_service_id: 1010, description_snapshot: 'Vệ sinh máy lạnh treo tường', quantity: 2, unit_price: 250000 },
        { quotation_item_id: 12, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 120000 },
      ],
    };
    const q2Fixed = {
      quotation_id: 2,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 250000,
      sent_at: '2026-11-23T08:30:00Z',
      items: [
        { quotation_item_id: 21, item_type: 'MATERIAL', material_id: 1, description_snapshot: 'Gas R32', quantity: 1, unit_price: 250000 },
      ],
    };
    const incFixedReq = baseReq({ quotations: [q1Inc, q2Fixed] });
    const custIncFixed = mapBackendCustomerRequestToOrder(incFixedReq);
    const techIncFixed = mapBackendTechJobToOrder({ assignment_id: 1, assignment_status: 'ACTIVE', request: incFixedReq, services: incFixedReq.items, quotations: incFixedReq.quotations });

    assert.equal(custIncFixed.quote.initialServiceDelta, 250000);
    assert.equal(custIncFixed.quote.effectivePriorExtra, 250000);
    assert.equal(orderTotal(custIncFixed), 870000);
    assert.equal(orderTotal(techIncFixed), 870000);
    assert.equal(quoteCardTotals(custIncFixed).totalMin, 870000);
    assert.equal(quoteCardTotals(techIncFixed).totalMin, 870000);

    // Giảm số lượng 2 -> 1 (booked 500k -> INITIAL 250k + 120k = 370k) + SUPPLEMENTAL dao động 100k-150k -> đúng 470k - 520k
    const q2Range = {
      quotation_id: 3,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 0,
      sent_at: '2026-11-23T08:30:00Z',
      items: [
        { quotation_item_id: 31, item_type: 'SERVICE', description_snapshot: formatEstimatedExternalDesc({ name: 'Tụ kích', minPrice: 100000, maxPrice: 150000 }), quantity: 1, unit_price: 0 },
      ],
    };
    const q1Dec = {
      quotation_id: 4,
      quotation_type: 'INITIAL',
      quotation_status: 'APPROVED',
      total_amount: 370000,
      sent_at: '2026-11-23T08:10:00Z',
      items: [
        { quotation_item_id: 41, item_type: 'SERVICE', request_service_id: 1010, description_snapshot: 'Vệ sinh máy lạnh treo tường', quantity: 1, unit_price: 250000 },
        { quotation_item_id: 42, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 120000 },
      ],
    };
    const decRangeReq = baseReq({
      items: [{ request_service_id: 1010, service_id: 101, service_name: 'Vệ sinh máy lạnh treo tường', selected_price: 250000, quantity: 2 }],
      quotations: [q1Dec, q2Range],
    });
    const custDecRange = mapBackendCustomerRequestToOrder(decRangeReq);
    const techDecRange = mapBackendTechJobToOrder({ assignment_id: 2, assignment_status: 'ACTIVE', request: decRangeReq, services: decRangeReq.items, quotations: decRangeReq.quotations });

    assert.equal(custDecRange.quote.initialServiceDelta, -250000);
    assert.equal(formatOrderTotal(custDecRange), '470.000đ – 520.000đ');
    assert.equal(formatOrderTotal(techDecRange), '470.000đ – 520.000đ');
    assert.equal(quoteCardTotals(custDecRange).totalMin, 470000);
    assert.equal(quoteCardTotals(custDecRange).totalMax, 520000);
    assert.equal(quoteCardTotals(techDecRange).totalMin, 470000);
    assert.equal(quoteCardTotals(techDecRange).totalMax, 520000);
  });

  test('Fix #17: computeQuoteRangeTotals trả grossTotalMin/Max không cộng ngược deduct thành phát sinh ảo', () => {
    const lines = [{ type: 'service', name: 'Kiểm tra', qty: 1, price: 100000, isOriginal: true }];
    const res = computeQuoteRangeTotals(lines, {
      bookedBase: 100000,
      voucherDisc: 100000,
      lateDisc: 50000,
      isOnSite: false,
    });
    assert.equal(res.totalMin, 0);
    assert.equal(res.grossTotalMin, 100000);
    assert.equal(Math.max(0, res.grossTotalMin - 100000), 0);
  });

  test('Fix #9: Chốt VT ngoài bằng đúng tiền tạm tính qua progress note đồng bộ Khách ↔ Thợ', () => {
    const qEst = {
      quotation_id: 50,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'APPROVED',
      total_amount: 120000,
      sent_at: '2026-11-23T08:10:00Z',
      items: [
        { quotation_item_id: 501, item_type: 'SERVICE', description_snapshot: formatEstimatedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }), quantity: 1, unit_price: 120000 },
      ],
    };
    const progress = [{ progress_id: 99, note: '[Chốt VT ngoài bằng tạm tính] Tụ kích', recorded_at: '2026-11-23T09:00:00Z' }];
    assert.equal(parseDepositFinalizedNotes(progress).has('tụ kích'), true);

    const lc = extractExternalPartLifecycle([qEst], progress);
    assert.equal(lc.externalPriceState, 'finalized');
    assert.equal(lc.pendingExternalEstimates.length, 0);
    assert.equal(lc.finalizedApprovedItems[0].actualPrice, 120000);

    const req = baseReq({
      items: [{ request_service_id: 1030, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', selected_price: 200000, quantity: 1 }],
      quotations: [qEst],
      progress,
    });
    const cust = mapBackendCustomerRequestToOrder(req);
    const tech = mapBackendTechJobToOrder({ assignment_id: 3, assignment_status: 'ACTIVE', request: req, services: req.items, quotations: req.quotations, progress });
    assert.equal(cust.externalPriceState, 'finalized');
    assert.equal(tech.externalPriceState, 'finalized');
    assert.equal(cust.pendingExternalEstimates.length, 0);
    assert.equal(orderTotal(cust), 320000);
    assert.equal(orderTotal(tech), 320000);
  });

  test('Fix #12: FOLLOW_UP miễn phí (kind=followup) và UNDER_WARRANTY không bị kẹt warranty_pending', () => {
    assert.equal(mapBackendStatusToAppStatus('WARRANTY_PENDING', 'SCHEDULED'), 'warranty_pending');
    assert.equal(mapBackendStatusToAppStatus('UNDER_WARRANTY', 'SCHEDULED'), 'confirmed');
    assert.equal(mapBackendStatusToAppStatus('UNDER_WARRANTY', 'IN_PROGRESS', true, false), 'repairing');
    assert.equal(mapBackendStatusToAppStatus('UNDER_WARRANTY', 'IN_PROGRESS', false, true), 'quoted');

    const fuReq = baseReq({ request_type: 'FOLLOW_UP', request_status: 'ASSIGNED', goods_amount: 250000 });
    const cust = mapBackendCustomerRequestToOrder(fuReq);
    const tech = mapBackendTechJobToOrder({ assignment_id: 4, assignment_status: 'ACTIVE', request: fuReq, services: fuReq.items });
    assert.equal(cust.kind, 'followup');
    assert.equal(tech.kind, 'followup');
    assert.equal(orderTotal(cust), 0);
    assert.equal(orderTotal(tech), 0);
    assert.equal(ctx.amountRemaining(cust), 0);

    const fuDone = baseReq({ request_type: 'FOLLOW_UP', request_status: 'COMPLETED', goods_amount: 250000 });
    const custDone = mapBackendCustomerRequestToOrder(fuDone);
    const techDone = mapBackendTechJobToOrder({ assignment_id: 4, assignment_status: 'ENDED', completed_at: '2026-11-23T10:00:00Z', request: fuDone, services: fuDone.items });
    assert.equal(orderTotal(custDone), 0);
    assert.equal(isPaid(custDone), true);
    assert.equal(isPaid(techDone), true);
  });

  test('Fix #13: Đơn RECEIVED giảm voucher 100% (estimated_total=0) và estimated_total=null hiển thị đúng', () => {
    const req100 = baseReq({ request_status: 'RECEIVED', estimated_total: 0, voucher_discount_amount: 250000 });
    const cust100 = mapBackendCustomerRequestToOrder(req100);
    const tech100 = mapBackendTechJobToOrder({ assignment_id: 5, assignment_status: 'ACTIVE', request: req100, services: req100.items });
    assert.equal(cust100.total, 0);
    assert.equal(tech100.total, 0);

    const reqNull = baseReq({ request_status: 'RECEIVED', estimated_total: null, voucher_discount_amount: 50000 });
    const custNull = mapBackendCustomerRequestToOrder(reqNull);
    const techNull = mapBackendTechJobToOrder({ assignment_id: 6, assignment_status: 'ACTIVE', request: reqNull, services: reqNull.items });
    assert.equal(custNull.total, 200000);
    assert.equal(techNull.total, 200000);
  });

  test('Fix #1: WarrantyBookingSheet khai báo toàn bộ hook và initialPrefilledPhone trước early return', () => {
    const src = readFileSync(new URL('../src/components/order/WarrantyBookingSheet.js', import.meta.url), 'utf8');
    const earlyIdx = src.indexOf('if (!order) return null;');
    const initPhoneDeclIdx = src.indexOf('const [initialPrefilledPhone, setInitialPrefilledPhone] = useState');
    assert.ok(earlyIdx > 0);
    assert.ok(initPhoneDeclIdx > 0 && initPhoneDeclIdx < earlyIdx, 'initialPrefilledPhone phải khai báo trước if (!order) return null');
    const afterEarly = src.slice(earlyIdx);
    assert.equal(/\buse(State|Effect|Memo|Callback|Ref)\s*\(/.test(afterEarly), false, 'Không được gọi React Hook sau if (!order) return null');
  });

  test('Fix #21: Ảnh biên lai vật tư phát sinh hiển thị phía khách kể cả khi quotation đang SENT (receipt_attachment_id=null)', () => {
    assert.equal(extractReceiptPartName('Biên lai vật tư phát sinh: ic bo mạng'), 'ic bo mạng');
    assert.equal(extractReceiptPartName('Biên lai linh kiện mua ngoài'), '');
    assert.equal(extractReceiptPartName('[Triệu chứng] hỏng ic'), '');

    const symptomEv = mapBackendPhotoToEvidence({
      attachment_id: 10,
      evidence_type: 'PROBLEM_PHOTO',
      image_url: 'https://cdn.example.com/symptom.jpg',
      description: '[Triệu chứng] hỏng ic (Thay thế)',
    });
    const docUnnamedEv = mapBackendPhotoToEvidence({
      attachment_id: 11,
      evidence_type: 'DOCUMENT',
      image_url: 'https://cdn.example.com/receipt-ic.jpg',
      description: null,
    });
    const receiptTypeEv = mapBackendPhotoToEvidence({
      attachment_id: 12,
      evidence_type: 'RECEIPT',
      image_url: 'https://cdn.example.com/receipt-2.jpg',
      description: 'Hoá đơn mua ngoài · Tụ kích',
    });
    assert.equal(symptomEv.stage, 'diagnosis');
    assert.equal(docUnnamedEv.stage, 'receipt');
    assert.equal(receiptTypeEv.stage, 'receipt');
    assert.equal(isReceiptEvidence(symptomEv), false);
    assert.equal(isReceiptEvidence(docUnnamedEv), true);

    // Không bao giờ rò ảnh DOCUMENT/biên lai sang ảnh triệu chứng ban đầu
    const initAtts = extractInitialAttachments([symptomEv, docUnnamedEv, receiptTypeEv], []);
    assert.equal(initAtts.some((a) => String(a.dbAttachmentId) === '11'), false);
    assert.equal(initAtts.some((a) => String(a.dbAttachmentId) === '12'), false);
    const parsedSym = parseSymptomsField('hỏng ic (Thay thế)', [symptomEv, docUnnamedEv]);
    assert.equal(parsedSym.symptomItems[0].photos.length, 1);

    // Kịch bản REQ-6742546730: báo giá SENT chốt giá cuối, receipt_attachment_id=null và description=null
    const finQuoteSent = {
      quotation_id: 70,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 120000,
      sent_at: '2026-11-23T10:00:00Z',
      items: [
        {
          quotation_item_id: 701,
          item_type: 'MATERIAL',
          is_external_purchase: true,
          receipt_attachment_id: null,
          description_snapshot: formatFinalizedExternalDesc({ name: 'ic bo mạng', minPrice: 100000, maxPrice: 150000 }),
          quantity: 1,
          unit_price: 120000,
        },
      ],
    };
    const reqSent = baseReq({
      request_code: 'REQ-6742546730',
      request_status: 'DIAGNOSED_PENDING_QUOTATION',
      quotations: [finQuoteSent],
      _evidence: [symptomEv, docUnnamedEv],
    });
    const custSent = mapBackendCustomerRequestToOrder(reqSent);
    assert.equal(custSent.status, 'quoted');
    assert.equal(custSent.quote.isExternalFinalization, true);
    const customOnly = custSent.quote.lines.filter((l) => !l.isOriginal && l.isCustom);
    const singleRes = matchReceiptsToQuoteLines(customOnly, custSent.evidence);
    assert.equal(singleRes.lineReceipts.get(0)?.uri, 'https://cdn.example.com/receipt-ic.jpg');
    assert.equal(singleRes.unmatchedReceipts.length, 0);

    // Chụp lại ảnh mới hơn (id 13 > id 11) cho 1 dòng chưa có description -> chỉ hiện ảnh mới nhất, không lặp ở strip
    const docNewerUnnamed = mapBackendPhotoToEvidence({
      attachment_id: 13,
      evidence_type: 'DOCUMENT',
      image_url: 'https://cdn.example.com/receipt-ic-v2.jpg',
      description: '',
    });
    const reuploadRes = matchReceiptsToQuoteLines(customOnly, [docUnnamedEv, docNewerUnnamed]);
    assert.equal(reuploadRes.lineReceipts.get(0)?.dbAttachmentId, 13);
    assert.equal(reuploadRes.unmatchedReceipts.length, 0);

    // Nhiều dòng có tên mô tả -> khớp 1-1 theo tên; nhiều dòng đều không tên -> đưa vào unmatchedReceipts (không đoán bừa)
    const twoLines = [
      { name: 'ic bo mạng', isCustom: true, isFinalizedExternal: true, receiptId: null },
      { name: 'Tụ kích', isCustom: true, isFinalizedExternal: true, receiptId: null },
    ];
    const namedMulti = matchReceiptsToQuoteLines(twoLines, [
      mapBackendPhotoToEvidence({ attachment_id: 21, evidence_type: 'DOCUMENT', image_url: 'u1', description: 'Biên lai vật tư phát sinh: Tụ kích' }),
      mapBackendPhotoToEvidence({ attachment_id: 22, evidence_type: 'DOCUMENT', image_url: 'u2', description: 'Biên lai vật tư phát sinh: ic bo mạng' }),
    ]);
    assert.equal(namedMulti.lineReceipts.get(0)?.dbAttachmentId, 22);
    assert.equal(namedMulti.lineReceipts.get(1)?.dbAttachmentId, 21);
    assert.equal(namedMulti.unmatchedReceipts.length, 0);

    const unnamedMulti = matchReceiptsToQuoteLines(twoLines, [docUnnamedEv, docNewerUnnamed]);
    assert.equal(unnamedMulti.lineReceipts.size, 0);
    assert.equal(unnamedMulti.unmatchedReceipts.length, 2);

    // Trường hợp detail trả receipt_attachment lồng trong item hoặc receipt_url trực tiếp
    const merged = mergeCustomerRequestDetail(
      baseReq({ request_id: 9200 }),
      {
        request: {
          request_id: 9200,
          request_code: 'REQ-9200',
          request_status: 'DIAGNOSED_PENDING_QUOTATION',
          quotations: [
            {
              quotation_id: 80,
              quotation_type: 'SUPPLEMENTAL',
              quotation_status: 'SENT',
              total_amount: 90000,
              sent_at: '2026-11-23T11:00:00Z',
              items: [
                {
                  quotation_item_id: 801,
                  item_type: 'MATERIAL',
                  is_external_purchase: true,
                  receipt_attachment_id: null,
                  receipt_url: 'https://cdn.example.com/direct-url.jpg',
                  receipt_attachment: { attachment_id: 99, image_url: 'https://cdn.example.com/nested-att.jpg' },
                  description_snapshot: formatFinalizedExternalDesc({ name: 'Cảm biến nhiệt' }),
                  quantity: 1,
                  unit_price: 90000,
                },
              ],
            },
          ],
        },
      },
    );
    merged._evidence = (merged._detailAttachments || []).map(mapBackendPhotoToEvidence);
    const mappedNested = mapBackendCustomerRequestToOrder(merged);
    assert.equal(mappedNested.quote.lines[1].receiptId, 99);
    assert.equal(mappedNested.quote.lines[1].receiptUrl, 'https://cdn.example.com/direct-url.jpg');
    const nestedRes = matchReceiptsToQuoteLines([mappedNested.quote.lines[1]], mappedNested.evidence);
    assert.equal(nestedRes.lineReceipts.get(0)?.uri, 'https://cdn.example.com/nested-att.jpg');
  });
});
