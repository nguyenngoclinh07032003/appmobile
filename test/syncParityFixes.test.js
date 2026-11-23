// Kiểm thử hồi quy cho 19 nhóm lỗi đồng bộ Khách ↔ Thợ và luồng nghiệp vụ.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './helpers/register-loader.mjs';

const { formatMinutesToSlotStr, MIN_DAY_MINUTE, MAX_DAY_MINUTE } = await import('../src/utils/dateTime.js');
const { applyServerWarrantyEligibility, formatYmd } = await import('../src/utils/warrantyPolicy.js');
const { syncCatalogFromBackend, MATERIALS } = await import('../src/constants/data.js');
const { formatEstimatedExternalDesc, formatFinalizedExternalDesc } = await import('../src/utils/externalPartsPricing.js');
const sync = await import('../src/services/syncService.js');
const ctx = await import('../src/context/AppContext.js');
const { isOnSiteQuote } = await import('../src/screens/tech/components/useQuoteDraft.js');

syncCatalogFromBackend({
  categories: [{ category_id: 1, category_name: 'Điện lạnh', is_active: true }],
  services: [
    { service_id: 101, category_id: 1, service_name: 'Vệ sinh máy lạnh treo tường', base_price: 250000 },
    { service_id: 103, category_id: 1, service_name: 'Sửa máy lạnh không lạnh', base_price: 200000 },
  ],
  materials: [
    { material_id: 1, material_name: 'Gas R32', unit_price: 250000, unit_of_measure: 'kg' },
    { material_id: 18, material_name: 'Dây điện + CB', unit_price: 120000, unit_of_measure: 'bộ' },
    { material_id: 99, material_name: 'Linh kiện chưa định giá', unit_price: 0, unit_of_measure: 'cái' },
  ],
});

const NOW = Date.now();
const DAY = 24 * 3600000;
const isoAt = (ms) => new Date(ms).toISOString();

describe('syncParityFixes: slot formatting, payment lock, and quote calculations', () => {
  test('Bug #1: formatMinutesToSlotStr chuẩn và UIComponents export minutesToSlotStr', () => {
    assert.equal(formatMinutesToSlotStr(MIN_DAY_MINUTE), '08h00 - 10h00');
    assert.equal(formatMinutesToSlotStr(15 * 60 + 45), '15h45 - 17h45');
    assert.equal(formatMinutesToSlotStr(MAX_DAY_MINUTE), '20h00 - 22h00');
    const uiSrc = readFileSync(new URL('../src/components/common/UIComponents.js', import.meta.url), 'utf8');
    assert.match(uiSrc, /import\s*\{\s*formatMinutesToSlotStr\s*\}\s*from\s*'\.\.\/\.\.\/utils\/dateTime'/);
    assert.match(uiSrc, /export const minutesToSlotStr = formatMinutesToSlotStr/);
  });

  test('Bug #3: INITIAL (không request_service_id) + SUPPLEMENTAL không bị cộng đúp dịch vụ đặt & giữ chênh lệch SL', () => {
    const qInitApproved = {
      quotation_id: 701,
      quotation_type: 'INITIAL',
      quotation_status: 'APPROVED',
      total_amount: 500000, // Thợ điều chỉnh từ 1 -> 2 dàn (250k x 2 = 500k)
      sent_at: isoAt(NOW - 3600000),
      items: [
        {
          quotation_item_id: 1,
          item_type: 'SERVICE',
          service_id: 101,
          description_snapshot: 'Vệ sinh máy lạnh treo tường',
          quantity: 2,
          unit_price: 250000,
        },
      ],
    };
    const qSuppSent = {
      quotation_id: 702,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 120000,
      sent_at: isoAt(NOW),
      items: [
        {
          quotation_item_id: 2,
          item_type: 'MATERIAL',
          material_id: 18,
          description_snapshot: 'Dây điện + CB',
          quantity: 1,
          unit_price: 120000,
        },
      ],
    };

    const cust = sync.mapBackendCustomerRequestToOrder({
      request_id: 8001,
      request_code: 'REQ-8001',
      request_status: 'DIAGNOSED_PENDING_QUOTATION',
      preferred_payment_method: 'CASH',
      created_at: isoAt(NOW - 7200000),
      goods_amount: 250000,
      items: [{ request_service_id: 1010, service_id: 101, service_name: 'Vệ sinh máy lạnh treo tường', quantity: 1, selected_price: 250000 }],
      visits: [{ visit_status: 'IN_PROGRESS' }],
      quotations: [qInitApproved, qSuppSent],
    });

    assert.equal(cust.quote.total, 620000, 'không cộng đúp dịch vụ 500k trong INITIAL vào SUPPLEMENTAL');
    assert.equal(cust.quote.totalMin, 620000, 'quoteRange.totalMin bảo toàn chênh lệch SL từ INITIAL khi gộp dòng');
    assert.equal(ctx.orderTotal(cust), 620000);
    assert.equal(cust.quote.lines.filter((l) => !l.isOriginal).length, 1);

    // Kiểm tra INITIAL (tăng SL + vật tư) + SUPPLEMENTAL (giá dao động) vẫn bảo toàn initialServiceDelta trong totalMin/totalMax
    const qInitWithPart = {
      ...qInitApproved,
      total_amount: 620000, // 2 dàn x 250k + Dây điện + CB 120k
      items: [
        ...qInitApproved.items,
        {
          quotation_item_id: 11,
          item_type: 'MATERIAL',
          material_id: 18,
          description_snapshot: 'Dây điện + CB',
          quantity: 1,
          unit_price: 120000,
        },
      ],
    };
    const qSuppRange = {
      quotation_id: 703,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 0,
      sent_at: isoAt(NOW + 1000),
      items: [
        {
          quotation_item_id: 12,
          item_type: 'SERVICE',
          description_snapshot: formatEstimatedExternalDesc({ name: 'Tụ kích', minPrice: 100000, maxPrice: 150000 }),
          quantity: 1,
          unit_price: 0,
          is_external_purchase: true,
        },
      ],
    };
    const qMixed = sync.mapBackendQuotationToAppQuote(
      [qInitWithPart, qSuppRange],
      [],
      250000,
      '',
      0,
      [{ id: 's101', dbServiceId: 101, name: 'Vệ sinh máy lạnh treo tường', qty: 1, price: 250000 }],
    );
    assert.equal(qMixed.includesPriorApprovedLines, true);
    assert.equal(qMixed.totalMin, 720000, '500k dịch vụ INITIAL + 120k VT INITIAL + 100k min dao động');
    assert.equal(qMixed.totalMax, 770000, '500k dịch vụ INITIAL + 120k VT INITIAL + 150k max dao động');
  });

  test('Bug #4: đồng bộ hình thức thanh toán VietQR ↔ Tiền mặt & qrPaymentRequested & merge lock', () => {
    const reqBase = {
      request_id: 8002,
      request_code: 'REQ-8002',
      request_status: 'PENDING_PAYMENT',
      preferred_payment_method: 'BANK_TRANSFER',
      created_at: isoAt(NOW - 3600000),
      items: [{ request_service_id: 1, service_id: 101, service_name: 'Vệ sinh máy lạnh treo tường', quantity: 1, selected_price: 250000 }],
      bill: {
        bill: { amount_due: 250000, booked_amount: 250000 },
        paid_amount: 0,
        remaining_amount: 250000,
        payment_status: 'UNPAID',
        payment_method: 'CASH',
        cash_to_collect: 250000,
      },
    };
    const cust = sync.mapBackendCustomerRequestToOrder(reqBase);
    assert.equal(cust.paymentMethod, 'cash');
    assert.equal(cust.qrPaymentRequested, false);
    assert.equal(ctx.isQRPayment(cust), false);

    // Local từng bật qrPaymentRequested: true nhưng server đã trả PAID / CASH -> không giữ lock cũ
    const localStaleQr = { ...cust, paymentMethod: 'vietqr', qrPaymentRequested: true, paymentMethodLocked: true, cashClaimLocked: true, cashClaimAt: NOW - 30000 };
    const remotePaid = { ...cust, paymentMethod: 'vietqr', qrPaymentRequested: true, status: 'done', bill: { ...cust.bill, paymentStatus: 'PAID' }, report: { paid: true } };
    const merged = sync.mergeBackendOrdersWithLocal([localStaleQr], [remotePaid]);
    assert.equal(merged[0].paymentMethodLocked, false);
    assert.equal(merged[0].cashClaimLocked, false);
    assert.equal(merged[0].qrPaymentRequested, true);
  });

  test('Bug #5: startRepairWithoutQuote sau REVISE không tụt về diagnosing; pre-travel REVISE về confirmed; reopenQuote thoát khi khách duyệt', () => {
    const qRev = {
      quotation_id: 710,
      quotation_type: 'INITIAL',
      quotation_status: 'REVISION_REQUESTED',
      customer_decision: 'REVISE',
      revision_note: 'Giá cao',
      sent_at: isoAt(NOW - 600000),
      updated_at: isoAt(NOW - 500000),
      items: [{ quotation_item_id: 10, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 120000 }],
    };

    // 1) Pre-travel REVISE -> confirmed (không nhảy tới diagnosing trước khi xuất phát)
    const preRevCust = sync.mapBackendCustomerRequestToOrder({
      request_id: 8003,
      request_code: 'REQ-8003',
      request_status: 'DIAGNOSED_PENDING_QUOTATION',
      preferred_payment_method: 'CASH',
      created_at: isoAt(NOW - 3600000),
      items: [{ request_service_id: 1, service_id: 101, service_name: 'Vệ sinh máy lạnh treo tường', quantity: 1, selected_price: 250000 }],
      visits: [{ visit_status: 'SCHEDULED' }],
      quotations: [qRev],
    });
    assert.equal(preRevCust.status, 'confirmed');
    assert.equal(preRevCust.quote.revisionRequested, true);

    // 2) Thợ bấm "Xác nhận & bắt đầu (0đ phát sinh)" sau REVISE -> chẩn đoán mới hơn báo giá -> repairing
    const noQuoteAfterRev = sync.mapBackendCustomerRequestToOrder({
      request_id: 8004,
      request_code: 'REQ-8004',
      request_status: 'IN_PROGRESS',
      preferred_payment_method: 'CASH',
      created_at: isoAt(NOW - 3600000),
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      visits: [{ visit_status: 'IN_PROGRESS' }],
      quotations: [qRev],
      diagnoses: [{ symptoms: 'Không lạnh', findings: 'Chỉ cần chỉnh van', repair_recommendation: 'Làm luôn', needs_quotation: false, recorded_at: isoAt(NOW - 10000) }],
    });
    assert.equal(noQuoteAfterRev.status, 'repairing');

    // 3) Thợ mở reopenQuote trên báo giá CHƯA duyệt -> khách duyệt báo giá đó -> phải thoát quoteEditing ngay
    const editingUnapproved = {
      dbRequestId: 8005,
      code: 'REQ-8005',
      status: 'confirmed',
      quoteEditing: true,
      quoteEditingFrom: 720,
      quoteEditingFromApproved: false,
      quote: { dbQuotationId: 720, approved: false, lines: [] },
    };
    const remoteApproved = {
      dbRequestId: 8005,
      code: 'REQ-8005',
      status: 'repairing',
      quote: { dbQuotationId: 720, approved: true, lines: [{ name: 'Gas R32', price: 250000, qty: 1 }] },
    };
    const mergedReopen = sync.mergeBackendOrdersWithLocal([editingUnapproved], [remoteApproved]);
    assert.equal(mergedReopen[0].quoteEditing, false);
    assert.equal(mergedReopen[0].status, 'repairing');
  });

  test('Bug #11 & #13: từ chối đợt 2 giữ vật tư đợt 1; material_usages gộp với vật tư báo giá; PAYMENT_STAGE ended job vẫn giữ; OUT_OF_WARRANTY mapped đúng', () => {
    const q1 = {
      quotation_id: 730,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'APPROVED',
      total_amount: 120000,
      sent_at: isoAt(NOW - 600000),
      items: [{ quotation_item_id: 21, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 120000 }],
    };
    const q2Rejected = {
      quotation_id: 731,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'REJECTED',
      total_amount: 250000,
      sent_at: isoAt(NOW - 100000),
      items: [{ quotation_item_id: 22, item_type: 'MATERIAL', material_id: 1, description_snapshot: 'Gas R32', quantity: 1, unit_price: 250000 }],
    };

    const custRej = sync.mapBackendCustomerRequestToOrder({
      request_id: 8006,
      request_code: 'REQ-8006',
      request_status: 'IN_PROGRESS',
      preferred_payment_method: 'CASH',
      created_at: isoAt(NOW - 3600000),
      goods_amount: 200000,
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      visits: [{ visit_status: 'IN_PROGRESS' }],
      quotations: [q1, q2Rejected],
    });
    assert.ok(custRej.quote.lines.some((l) => l.matId === 'm-db-18' && l.isPriorApproved), 'giữ vật tư đợt 1 đã duyệt');
    assert.equal(custRej.quote.lines.some((l) => l.matId === 'm-db-1'), false, 'không hiện vật tư đợt 2 bị từ chối');

    // Tech warehouse usage + quote parts gộp chung (không xoá mất Gas R32 từ báo giá)
    const techMergedMats = sync.mapBackendTechJobToOrder({
      assignment_id: 9001,
      assignment_status: 'ENDED',
      visit: { visit_number: 1, visit_status: 'COMPLETED', actual_end: isoAt(NOW - 60000) },
      services: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      quotations: [q1],
      material_usages: [{ usage_id: 55, material_id: 1, material_name: 'Gas R32', used_quantity: 1, unit_of_measure: 'kg' }],
      request: {
        request_id: 8007,
        request_code: 'REQ-8007',
        request_status: 'PENDING_PAYMENT',
        preferred_payment_method: 'CASH',
        site_condition: 'chung-cu',
        timeline: [{ new_status: 'ASSIGNED', changed_at: isoAt(NOW - 1800000) }, { new_status: 'PENDING_PAYMENT', changed_at: isoAt(NOW - 60000) }],
      },
      diagnoses: [{ symptoms: 'Kém lạnh', findings: 'Thiếu gas', repair_recommendation: 'Nạp gas', recorded_at: isoAt(NOW - 1200000) }],
    }, { name: 'Thợ A', code: 'A1' });

    assert.ok(techMergedMats, 'PAYMENT_STAGE assignment ENDED nhưng visit COMPLETED vẫn phải giữ');
    assert.equal(techMergedMats.status, 'pending_payment');
    assert.equal(techMergedMats.materials.length, 2, 'giữ cả vật tư kho usage và vật tư đã duyệt từ báo giá');
    assert.equal(techMergedMats.siteCondition?.id, 'chung-cu');
    assert.equal(techMergedMats.history.length, 2);
    assert.equal(techMergedMats.diagnosisReport?.diagnosis, 'Thiếu gas');

    assert.equal(sync.mapBackendStatusToAppStatus('OUT_OF_WARRANTY', 'IN_PROGRESS', false, true), 'quoted');
    assert.equal(sync.mapBackendStatusToAppStatus('OUT_OF_WARRANTY', 'IN_PROGRESS', true, false), 'repairing');
    assert.equal(sync.mapBackendStatusToAppStatus('OUT_OF_WARRANTY', 'IN_PROGRESS', false, false), 'out_of_warranty');
  });

  test('Bug #14, #15, #17, #18, #19: warranty ISO date normalization, photo filtering, tech profile isolation, notif link & isOnSiteQuote', () => {
    // 1) ISO warranty_end_date chuẩn hoá về YYYY-MM-DD (cuối hạn hôm nay -> isFinalDay)
    const todayYmd = formatYmd(new Date());
    const eligToday = applyServerWarrantyEligibility(
      { ok: false, totalDays: 60 },
      { eligible: true, warranty_days: 90, warranty_end_date: `${todayYmd}T23:59:59.000Z`, days_remaining: 1 },
      () => todayYmd,
    );
    assert.equal(eligToday.endYmd, todayYmd);
    assert.equal(eligToday.isFinalDay, true);

    // 2) extractInitialAttachments không đưa ảnh [Triệu chứng] của thợ vào attachments khách
    const atts = sync.extractInitialAttachments([], [
      { attachment_id: 1, image_url: 'https://cdn.example.com/sym.jpg', description: '[Triệu chứng] Rỉ nước', uploaded_by_role: 'TECHNICIAN' },
      { attachment_id: 2, image_url: 'https://cdn.example.com/cust.jpg', description: 'Ảnh ban đầu', uploaded_by_role: 'CUSTOMER' },
    ]);
    assert.deepEqual(atts.map((x) => x.uri), ['https://cdn.example.com/cust.jpg']);

    // 3) _evidenceFetched: true xóa cả attachments khi server trả rỗng
    const clearedAtt = sync.mergeBackendOrdersWithLocal(
      [{ dbRequestId: 8008, code: 'REQ-8008', status: 'confirmed', attachments: [{ id: 'a1', uri: 'https://cdn.example.com/old.jpg' }] }],
      [{ dbRequestId: 8008, code: 'REQ-8008', status: 'confirmed', _evidenceFetched: true, evidence: [], attachments: [] }],
    );
    assert.deepEqual(clearedAtt[0].attachments, []);

    // 4) mergeTechProfile cô lập hoàn toàn khi đổi sang thợ khác
    const prevTech = { code: 'T1', name: 'Thợ 1', reputation: 45, violations: [{ id: 1 }], lockedUntil: NOW + DAY, cancelAfterAcceptCount: 3 };
    const nextTech = ctx.mergeTechProfile(prevTech, { techCode: 'T2', name: 'Thợ 2', phone: '0909' });
    assert.equal(nextTech.code, 'T2');
    assert.equal(nextTech.reputation, 100);
    assert.deepEqual(nextTech.violations, []);
    assert.ok(!nextTech.lockedUntil);

    // 5) latestNotifPerOrder giữ link từ item cũ hơn khi item mới nhất không có link
    const grouped = ctx.latestNotifPerOrder([
      { id: 'n1', title: 'Đơn REQ-10001 hoàn tất', at: 1000, read: false, link: { name: 'order', params: { code: 'REQ-10001' } } },
      { id: 'n2', title: 'Đơn REQ-10001 có cập nhật', at: 2000, read: true },
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].link?.params?.code, 'REQ-10001');
    assert.equal(grouped[0].read, false);

    // 6) isOnSiteQuote với quotationType === 'SUPPLEMENTAL'
    assert.equal(
      isOnSiteQuote({ status: 'diagnosing', arrivedAt: null, checkIn: null, quote: { revisionRequested: true, quotationType: 'SUPPLEMENTAL' } }),
      true,
    );
  });
});
