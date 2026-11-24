// Kiểm thử hồi quy cho các lỗi sai/lệch Khách ↔ Thợ (roleplay QA parity pass).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './helpers/register-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { syncCatalogFromBackend } = await import('../src/constants/data.js');
const { applyServerWarrantyEligibility, formatYmd } = await import('../src/utils/warrantyPolicy.js');
const { matchReceiptsToQuoteLines, formatEstimatedExternalDesc } = await import('../src/utils/externalPartsPricing.js');
const { flattenProcedureSteps } = await import('../src/utils/procedureHelpers.js');
const { isStepInSupportScope } = await import('../src/utils/teamHelpers.js');
const { viServerMessage } = await import('../src/utils/viText.js');
const sync = await import('../src/services/syncService.js');
const ctx = await import('../src/context/AppContext.js');

syncCatalogFromBackend({
  categories: [{ category_id: 1, category_name: 'Điện lạnh', is_active: true }],
  services: [
    { service_id: 101, category_id: 1, service_name: 'Vệ sinh máy lạnh treo tường', base_price: 250000, warranty_days: 30 },
    { service_id: 103, category_id: 1, service_name: 'Sửa máy lạnh không lạnh', base_price: 200000, warranty_days: 60 },
  ],
  materials: [
    { material_id: 1, material_name: 'Gas R32', unit_price: 250000, unit_of_measure: 'kg' },
    { material_id: 18, material_name: 'Dây điện + CB', unit_price: 120000, unit_of_measure: 'bộ' },
  ],
});

const NOW = Date.now();
const isoAt = (ms) => new Date(ms).toISOString();

describe('parityRoleplayFixes: Customer <-> Tech Lead/Support parity', () => {
  test('mapBackendQuotationToAppQuote không gán diagnosis mặc định "tại hiện trường" khi rỗng', () => {
    const q = sync.mapBackendQuotationToAppQuote([{
      quotation_id: 501,
      quotation_type: 'INITIAL',
      quotation_status: 'SENT',
      total_amount: 350000,
      sent_at: isoAt(NOW - 60000),
      items: [{ quotation_item_id: 1, item_type: 'SERVICE', service_id: 101, description_snapshot: 'Vệ sinh máy lạnh', quantity: 1, unit_price: 350000 }],
    }]);
    assert.equal(q.diagnosis, '');
  });

  test('out_of_warranty với goods_amount = 0 không fallback về giá gốc dịch vụ (Customer & Tech)', () => {
    const custOow = sync.mapBackendCustomerRequestToOrder({
      request_id: 9101,
      request_code: 'REQ-9101',
      request_status: 'OUT_OF_WARRANTY',
      request_type: 'WARRANTY',
      goods_amount: 0,
      created_at: isoAt(NOW - 3600000),
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      visits: [{ visit_status: 'IN_PROGRESS' }],
    });
    assert.equal(custOow.goods, 0);

    const techOow = sync.mapBackendTechJobToOrder({
      assignment_id: 9102,
      assignment_status: 'ACTIVE',
      visit: { visit_number: 1, visit_status: 'IN_PROGRESS' },
      services: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      request: {
        request_id: 9101,
        request_code: 'REQ-9101',
        request_status: 'OUT_OF_WARRANTY',
        request_type: 'WARRANTY',
        goods_amount: 0,
      },
    }, { name: 'Thợ A', code: 'A1' });
    assert.equal(techOow.goods, 0);
  });

  test('Customer map checkIn, review rating.at, safetyChecklist, repairNotes & mergeBackendOrdersWithLocal giữ supportTechnicians', () => {
    const arrivedIso = isoAt(NOW - 1200000);
    const ratedIso = isoAt(NOW - 60000);
    const cust = sync.mapBackendCustomerRequestToOrder({
      request_id: 9103,
      request_code: 'REQ-9103',
      request_status: 'COMPLETED',
      preferred_payment_method: 'CASH',
      created_at: isoAt(NOW - 7200000),
      completed_at: isoAt(NOW - 120000),
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      journey: { arrived_at: arrivedIso },
      visits: [{ visit_status: 'COMPLETED', actual_start: arrivedIso, safety_checklist: ['Kiểm tra rò điện', 'Chạy thử 10 phút'] }],
      progress: [
        { progress_id: 1, note: 'Đã vệ sinh dàn lạnh', recorded_at: isoAt(NOW - 500000) },
        { progress_id: 2, note: '[Chốt VT ngoài bằng tạm tính] Van tiết lưu', recorded_at: isoAt(NOW - 400000) },
      ],
      review: { rating: 5, comment: 'Rất tốt', created_at: ratedIso },
    });

    assert.ok(cust.checkIn, 'Customer map phải giữ mốc checkIn từ journey/visit');
    assert.ok(cust.rating?.at, 'Customer map phải có rating.at');
    assert.deepEqual(cust.report?.safetyChecklist, ['Kiểm tra rò điện', 'Chạy thử 10 phút']);
    assert.equal(cust.repairNotes.some((n) => /Chốt VT ngoài bằng tạm tính/.test(n.text || n.note || '')), false);
    assert.equal(cust.repairNotes.some((n) => /Đã vệ sinh dàn lạnh/.test(n.text || n.note || '')), true);

    const localWithTracking = {
      dbRequestId: 9103,
      code: 'REQ-9103',
      status: 'repairing',
      supportTechnicians: [{ technicianId: 22, name: 'Thợ phụ B' }],
      rating: { stars: 5, text: 'Rất tốt', at: NOW - 60000 },
    };
    const mergedNoSupKey = sync.mergeBackendOrdersWithLocal([localWithTracking], [
      { dbRequestId: 9103, code: 'REQ-9103', status: 'done', rating: { stars: 5, text: 'Rất tốt' } },
    ]);
    assert.equal(mergedNoSupKey[0].supportTechnicians.length, 1, 'Không ghi đè mất supportTechnicians khi list API không trả field');
    assert.equal(mergedNoSupKey[0].rating?.at, NOW - 60000, 'Giữ rating.at local khi remote thiếu');
  });

  test('Support ended job bị loại khỏi PAYMENT_STAGE còn Lead ended job vẫn giữ; Tech map voucher.code', () => {
    const baseReq = {
      request_id: 9104,
      request_code: 'REQ-9104',
      request_status: 'PENDING_PAYMENT',
      preferred_payment_method: 'CASH',
      voucher_code: 'GIAM50K',
      discount_amount: 50000,
    };

    const supportEnded = sync.mapBackendTechJobToOrder({
      assignment_id: 701,
      assignment_role: 'SUPPORT',
      assignment_status: 'ENDED',
      visit: { visit_number: 1, visit_status: 'COMPLETED' },
      services: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh', quantity: 1, selected_price: 200000 }],
      request: baseReq,
    }, { name: 'Thợ Phụ', code: 'P1' });
    assert.equal(supportEnded, null, 'Thợ phụ ENDED không được nằm lại danh sách cần thu tiền');

    const leadEnded = sync.mapBackendTechJobToOrder({
      assignment_id: 702,
      assignment_role: 'LEAD',
      assignment_status: 'ENDED',
      visit: { visit_number: 1, visit_status: 'COMPLETED' },
      services: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh', quantity: 1, selected_price: 200000 }],
      request: baseReq,
    }, { name: 'Thợ Chính', code: 'C1' });
    assert.ok(leadEnded, 'Thợ chính ENDED trong PAYMENT_STAGE vẫn phải giữ');
    assert.equal(leadEnded.voucher?.code, 'GIAM50K');
  });

  test('Đơn tái khám (followup) miễn phí 0đ khi open request & không tạo bảo hành mới', () => {
    const openFollowup = sync.mapBackendOpenRequestToOrder({
      request_id: 9105,
      request_code: 'REQ-9105',
      request_type: 'FOLLOW_UP',
      service_type: 'FOLLOW_UP',
      request_status: 'PENDING_DISPATCH',
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      created_at: isoAt(NOW - 300000),
    });
    assert.equal(openFollowup.kind, 'followup');
    assert.equal(openFollowup.goods, 0);
    assert.equal(openFollowup.total, 0);
    assert.equal(openFollowup.finalTotal, 0);

    const wFollowup = ctx.warrantyInfo({
      code: 'REQ-9105',
      kind: 'followup',
      status: 'done',
      doneAt: NOW - 100000,
      items: [{ id: '103', qty: 1 }],
    }, [], 0);
    assert.equal(wFollowup.noWarranty, true);
    assert.equal(wFollowup.ok, false);
  });

  test('externalPartsPricing: giữ biên lai có tên riêng trong unmatchedReceipts, vẫn bỏ qua biên lai re-upload chung', () => {
    const customLines = [{ name: 'Tụ quạt dàn nóng', isCustom: true, price: 150000, qty: 1 }];
    const e1 = sync.mapBackendPhotoToEvidence({
      attachment_id: 101,
      evidence_type: 'DOCUMENT',
      description: 'Biên lai vật tư phát sinh: Tụ quạt dàn nóng',
      image_url: 'https://cdn.example.com/r1.jpg',
    });
    const e2 = sync.mapBackendPhotoToEvidence({
      attachment_id: 102,
      evidence_type: 'DOCUMENT',
      description: 'Biên lai vật tư phát sinh: Block nén khí',
      image_url: 'https://cdn.example.com/r2.jpg',
    });
    const e3 = sync.mapBackendPhotoToEvidence({
      attachment_id: 103,
      evidence_type: 'DOCUMENT',
      description: 'Biên lai linh kiện mua ngoài',
      image_url: 'https://cdn.example.com/r3.jpg',
    });
    const { lineReceipts, unmatchedReceipts } = matchReceiptsToQuoteLines(customLines, [e1, e2, e3]);
    assert.equal(lineReceipts.get(0)?.dbAttachmentId, 101);
    assert.deepEqual(unmatchedReceipts.map((r) => r.dbAttachmentId), [102]);
  });

  test('applyServerWarrantyEligibility lọc bỏ ca >= 18h00 khỏi serverAvailableSlotsToday vào ngày cuối bảo hành', () => {
    const todayYmd = formatYmd(new Date());
    const morningNow = new Date(`${todayYmd}T10:00:00+07:00`);
    const elig = applyServerWarrantyEligibility(
      { ok: false, totalDays: 60 },
      {
        eligible: true,
        warranty_days: 60,
        warranty_end_date: todayYmd,
        is_final_day: true,
        available_dates: [todayYmd],
        available_slots_today: ['15h00 - 17h00', '18h00 - 20h00', '19h00 - 21h00'],
      },
      () => todayYmd,
      morningNow,
    );
    assert.equal(elig.isFinalDay, true);
    assert.deepEqual(elig.serverAvailableSlotsToday, ['15h00 - 17h00']);
  });

  test('techStatusMeta: Thợ phụ chờ thợ chính tới & ẩn banner VT ngoài của Thợ chính', () => {
    const waitingMeta = ctx.techStatusMeta({
      status: 'confirmed',
      assignmentRole: 'SUPPORT',
      arrivedAt: NOW - 60000,
      visitStatus: 'SCHEDULED',
    });
    assert.match(waitingMeta.label, /Chờ thợ chính tới/);

    const hideExtMeta = ctx.techStatusMeta({
      status: 'repairing',
      assignmentRole: 'SUPPORT',
      quote: {
        approved: true,
        approvedHasEstimatedRange: true,
        lines: [{ name: 'Linh kiện A', isEstimatedRange: true, minPrice: 100000, maxPrice: 200000, qty: 1 }],
      },
    });
    assert.equal(hideExtMeta.label, 'Đang thực hiện');
  });

  test('mapQuoteItem lấy metadata bảo hành từ qi.warranties[0] khi thiếu ở top-level', () => {
    const q = sync.mapBackendQuotationToAppQuote([{
      quotation_id: 601,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 350000,
      sent_at: isoAt(NOW - 30000),
      items: [{
        quotation_item_id: 11,
        item_type: 'MATERIAL',
        is_external_purchase: true,
        description_snapshot: '[VT ngoài chốt giá (dự kiến 300.000đ - 400.000đ)] Bo mạch inverter',
        quantity: 1,
        unit_price: 350000,
        warranties: [{ serial_number: 'SN-LG-900', warranty_days: 180, external_warranty_code: 'BH-LG-900', status: 'PENDING' }],
      }],
    }]);
    const item = q.lines.find((l) => !l.isOriginal);
    assert.equal(item.serialNumber, 'SN-LG-900');
    assert.equal(item.warrantyDays, 180);
    assert.equal(item.externalWarrantyCode, 'BH-LG-900');
  });

  test('Customer map & mergeCustomerRequestDetail giữ procedure, ảnh BEFORE_REPAIR và ưu tiên completed_at cho doneAt', () => {
    const completedIso = '2026-11-24T03:00:00.000Z';
    const startTomorrowIso = '2026-11-25T00:00:00.000Z';
    const merged = sync.mergeCustomerRequestDetail(
      { request_id: 9201, request_code: 'REQ-9201', request_status: 'COMPLETED' },
      {
        request: {
          request_id: 9201,
          request_code: 'REQ-9201',
          request_status: 'COMPLETED',
          completed_at: completedIso,
          warranty_start_date: startTomorrowIso,
          procedure: { total_steps: 2, done_steps: 2, services: [{ service_name: 'Vệ sinh máy lạnh', steps: [{ step_id: 1, step_no: 1, title: 'Kiểm tra' }] }] },
        },
        photos: [
          { attachment_id: 88, evidence_type: 'BEFORE_REPAIR', procedure_step_id: 1, image_url: 'https://cdn.example.com/step1.jpg' },
        ],
      },
    );
    assert.ok(merged.procedure?.services?.length === 1);
    assert.equal(merged._procedureAttachments.some((p) => p.attachment_id === 88), true);

    const cust = sync.mapBackendCustomerRequestToOrder({
      ...merged,
      preferred_payment_method: 'CASH',
      created_at: isoAt(NOW - 7200000),
      items: [{ request_service_id: 1, service_id: 101, service_name: 'Vệ sinh máy lạnh', quantity: 1, selected_price: 250000 }],
    });
    assert.equal(cust.doneAt, new Date(completedIso).getTime());
    assert.equal(cust.procedure?.done_steps, 2);
    const ev = sync.mapBackendPhotoToEvidence(merged._procedureAttachments[0]);
    assert.equal(ev.procedureStepId, 1);
    assert.equal(ev.stage, 'before');
  });

  test('applyServerWarrantyEligibility xử lý WARRANTY_NOT_STARTED thành trạng thái chờ kích hoạt', () => {
    const elig = applyServerWarrantyEligibility(
      { ok: false, totalDays: 30, until: NOW + 30 * 86400000 },
      { eligible: false, reason_code: 'WARRANTY_NOT_STARTED', warranty_days: 30 },
      () => '24/12/2026',
    );
    assert.equal(elig.ok, false);
    assert.equal(elig.notStarted, true);
    assert.equal(elig.noWarranty, false);
    assert.equal(elig.daysLeft, 30);
    assert.match(elig.text, /ngày mai/);
  });

  test('SUPPORT chưa check-in giữ confirmed/onway; OUT_OF_WARRANTY & SUPPLEMENTAL goodsTotal=0 tính chuẩn', () => {
    const supPreQuote = sync.mapBackendTechJobToOrder({
      assignment_id: 801,
      assignment_role: 'SUPPORT',
      assignment_status: 'ACTIVE',
      visit: { visit_number: 1, visit_status: 'SCHEDULED' },
      services: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh', quantity: 1, selected_price: 200000 }],
      quotations: [{ quotation_id: 90, quotation_type: 'INITIAL', quotation_status: 'SENT', total_amount: 300000, sent_at: isoAt(NOW - 5000), items: [] }],
      request: { request_id: 9202, request_code: 'REQ-9202', request_status: 'DIAGNOSED_PENDING_QUOTATION' },
    }, { name: 'Thợ Phụ', code: 'P1' });
    assert.equal(supPreQuote.status, 'confirmed');

    const supLeadInProg = sync.mapBackendTechJobToOrder({
      assignment_id: 802,
      assignment_role: 'SUPPORT',
      assignment_status: 'ACTIVE',
      travel_started_at: isoAt(NOW - 30000),
      visit: { visit_number: 1, visit_status: 'IN_PROGRESS' },
      services: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh', quantity: 1, selected_price: 200000 }],
      request: { request_id: 9203, request_code: 'REQ-9203', request_status: 'IN_PROGRESS' },
    }, { name: 'Thợ Phụ', code: 'P1' });
    assert.equal(supLeadInProg.status, 'onway');

    const oowImplicit = sync.mapBackendCustomerRequestToOrder({
      request_id: 9204,
      request_code: 'REQ-9204',
      request_type: 'WARRANTY',
      request_status: 'OUT_OF_WARRANTY',
      goods_amount: 0,
      created_at: isoAt(NOW - 60000),
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
    });
    assert.equal(oowImplicit.kind, 'normal');

    const suppZeroGoods = sync.mapBackendQuotationToAppQuote(
      [{ quotation_id: 91, quotation_type: 'SUPPLEMENTAL', quotation_status: 'SENT', total_amount: 150000, sent_at: isoAt(NOW - 5000), items: [{ quotation_item_id: 1, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 150000 }] }],
      [],
      0,
      '',
      0,
      [{ id: '103', name: 'Sửa máy lạnh không lạnh', qty: 1, price: 200000 }],
    );
    const origLine = suppZeroGoods.lines.find((l) => l.isOriginal);
    assert.equal(origLine.price, 0);
  });

  test('mergeBackendOrdersWithLocal xoá checkIn khi !sameTech, xoá supportTechnicians khi về pending, giữ procedure & xoá report ảo trên cancelled', () => {
    const merged = sync.mergeBackendOrdersWithLocal(
      [{
        dbRequestId: 9205,
        code: 'REQ-9205',
        status: 'confirmed',
        tech: { code: 'T1', name: 'Thợ 1' },
        checkIn: { at: NOW - 50000, lat: 21, lng: 105 },
        supportTechnicians: [{ technicianId: 99, name: 'Thợ phụ cũ' }],
      }],
      [{
        dbRequestId: 9205,
        code: 'REQ-9205',
        status: 'pending',
        tech: null,
        checkIn: null,
        procedure: { total_steps: 2, done_steps: 0, services: [] },
      }],
    );
    assert.equal(merged[0].checkIn, null);
    assert.deepEqual(merged[0].supportTechnicians, []);
    assert.deepEqual(merged[0].procedure, { total_steps: 2, done_steps: 0, services: [] });

    const cancelledMerged = sync.mergeBackendOrdersWithLocal(
      [{ dbRequestId: 9206, code: 'REQ-9206', status: 'cancelled', report: { paid: true, at: NOW - 10000, summary: '' } }],
      [{ dbRequestId: 9206, code: 'REQ-9206', status: 'cancelled', report: null }],
    );
    assert.equal(cancelledMerged[0].report, null);
  });

  test('mapBackendOpenRequestToOrder map comboDiscount, voucherDiscount, voucher.code, estimated_total & paymentMethod', () => {
    const openOrd = sync.mapBackendOpenRequestToOrder({
      request_id: 9207,
      request_code: 'REQ-9207',
      request_type: 'NORMAL',
      preferred_payment_method: 'BANK_TRANSFER',
      combo_discount_amount: 25000,
      voucher_code: 'GIAM50K',
      voucher_discount_amount: 50000,
      estimated_total: 425000,
      items: [{ request_service_id: 1, service_id: 101, service_name: 'Vệ sinh máy lạnh treo tường', quantity: 2, selected_price: 250000 }],
      created_at: isoAt(NOW - 60000),
    });
    assert.equal(openOrd.comboDiscount, 25000);
    assert.equal(openOrd.voucherDiscount, 50000);
    assert.equal(openOrd.voucher?.code, 'GIAM50K');
    assert.equal(openOrd.total, 425000);
    assert.equal(openOrd.paymentMethod, 'vietqr');
    assert.equal(openOrd.qrPaymentRequested, true);
  });

  test('flattenProcedureSteps kế thừa service_id & category_id từ nhóm dịch vụ cha cho isStepInSupportScope', () => {
    const steps = flattenProcedureSteps({
      services: [{
        service_id: 999,
        category_id: 2,
        service_name: 'Tên dịch vụ tuỳ biến không khớp catalog',
        steps: [{ step_id: 1, step_no: 1, title: 'Sửa ống nước', status: 'PENDING' }],
      }],
    });
    assert.equal(steps[0].category_id, 2);
    assert.equal(steps[0].service_id, 999);
    assert.equal(isStepInSupportScope(steps[0], { assignmentRole: 'SUPPORT', supportCategoryIds: [1] }, []), false);
    assert.equal(isStepInSupportScope(steps[0], { assignmentRole: 'SUPPORT', supportCategoryIds: [2] }, []), true);
  });

  test('INITIAL đổi SL dịch vụ không kèm vật tư + SUPPLEMENTAL (APPROVED VT ngoài & SENT VT kho) giữ đúng delta & tổng', () => {
    const bookedItems = [{ id: '103', dbRequestServiceId: 1, name: 'Sửa máy lạnh không lạnh', qty: 1, price: 200000 }];
    const q1UpNoParts = {
      quotation_id: 701,
      quotation_type: 'INITIAL',
      quotation_status: 'APPROVED',
      total_amount: 400000,
      sent_at: isoAt(NOW - 200000),
      items: [{ quotation_item_id: 1, item_type: 'SERVICE', request_service_id: 1, description_snapshot: 'Sửa máy lạnh không lạnh', quantity: 2, unit_price: 200000 }],
    };
    const q2EstApproved = {
      quotation_id: 702,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'APPROVED',
      total_amount: 0,
      sent_at: isoAt(NOW - 100000),
      items: [{ quotation_item_id: 2, item_type: 'MATERIAL', is_external_purchase: true, description_snapshot: formatEstimatedExternalDesc({ name: 'Van xả áp', minPrice: 100000, maxPrice: 150000 }), quantity: 1, unit_price: 0 }],
    };
    const upApprovedCust = sync.mapBackendCustomerRequestToOrder({
      request_id: 9301,
      request_code: 'REQ-9301',
      request_status: 'IN_PROGRESS',
      goods_amount: 200000,
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      quotations: [q1UpNoParts, q2EstApproved],
      visits: [{ visit_status: 'IN_PROGRESS' }],
      created_at: isoAt(NOW - 300000),
    });
    assert.equal(upApprovedCust.quote.initialServiceDelta, 200000);
    assert.equal(upApprovedCust.quote.totalMin, 500000);
    assert.equal(upApprovedCust.quote.totalMax, 550000);
    assert.equal(ctx.formatOrderTotal(upApprovedCust), '500.000đ – 550.000đ');

    const q1DownNoParts = {
      ...q1UpNoParts,
      quotation_id: 703,
      total_amount: 150000,
      items: [{ quotation_item_id: 3, item_type: 'SERVICE', request_service_id: 1, description_snapshot: 'Sửa máy lạnh không lạnh', quantity: 1, unit_price: 150000 }],
    };
    const downApprovedCust = sync.mapBackendCustomerRequestToOrder({
      request_id: 9302,
      request_code: 'REQ-9302',
      request_status: 'IN_PROGRESS',
      goods_amount: 200000,
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      quotations: [q1DownNoParts, q2EstApproved],
      visits: [{ visit_status: 'IN_PROGRESS' }],
      created_at: isoAt(NOW - 300000),
    });
    assert.equal(downApprovedCust.quote.initialServiceDelta, -50000);
    assert.equal(downApprovedCust.quote.totalMin, 250000);
    assert.equal(downApprovedCust.quote.totalMax, 300000);

    const q2SentWarehouse = {
      quotation_id: 704,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 100000,
      sent_at: isoAt(NOW - 50000),
      items: [{ quotation_item_id: 4, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 100000 }],
    };
    const upSentQuote = sync.mapBackendQuotationToAppQuote([q1UpNoParts, q2SentWarehouse], [], 200000, '', 0, bookedItems, []);
    assert.equal(upSentQuote.initialServiceDelta, 200000);
    assert.equal(upSentQuote.effectivePriorExtra, 200000);
    assert.equal(upSentQuote.totalMin, 500000);
  });

  test('SUPPORT chưa check-in không kế thừa visit.actual_start của LEAD làm arrivedAt/checkIn', () => {
    const supJob = sync.mapBackendTechJobToOrder({
      assignment_id: 881,
      assignment_role: 'SUPPORT',
      assignment_status: 'ACTIVE',
      visit: { visit_number: 1, visit_status: 'IN_PROGRESS', actual_start: isoAt(NOW - 120000) },
      arrived_at: null,
      check_in: null,
      services: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh', quantity: 1, selected_price: 200000 }],
      request: { request_id: 9303, request_code: 'REQ-9303', request_status: 'IN_PROGRESS' },
    }, { name: 'Thợ Phụ', code: 'P1' });
    assert.equal(supJob.status, 'confirmed');
    assert.equal(supJob.arrivedAt, null);
    assert.equal(supJob.checkIn, null);
  });

  test('mergeBackendOrdersWithLocal giữ procedure/repairNotes/materials khi list sync (!ro._detailHydrated) nhưng vẫn cập nhật bên Thợ', () => {
    const custLocal = {
      dbRequestId: 9304,
      code: 'REQ-9304',
      status: 'done',
      _detailHydrated: true,
      procedure: { total_steps: 2, done_steps: 2, services: [] },
      repairNotes: [{ id: 'pg-1', text: 'Ghi chú đã hydrate', at: NOW - 10000 }],
      materials: [{ id: 'm1', name: 'Gas R32', qty: 1 }],
    };
    const listOnlyRemote = {
      dbRequestId: 9304,
      code: 'REQ-9304',
      status: 'done',
      procedure: null,
      repairNotes: [],
      materials: [],
    };
    const mergedCust = sync.mergeBackendOrdersWithLocal([custLocal], [listOnlyRemote]);
    assert.equal(mergedCust[0].procedure?.done_steps, 2);
    assert.equal(mergedCust[0].repairNotes.length, 1);
    assert.equal(mergedCust[0].materials.length, 1);

    const techCleared = sync.mergeBackendOrdersWithLocal(
      [{ ...custLocal, dbAssignmentId: 501 }],
      [{ ...listOnlyRemote, dbAssignmentId: 501 }],
    );
    assert.equal(techCleared[0].repairNotes.length, 0);
    assert.equal(techCleared[0].materials.length, 0);
  });

  test('mapBackendOpenRequestToOrder phòng vệ goods_amount=0 và estimated_total=0 trên đơn thường không voucher', () => {
    const openDefaultZero = sync.mapBackendOpenRequestToOrder({
      request_id: 9305,
      request_code: 'REQ-9305',
      request_type: 'NORMAL',
      goods_amount: 0,
      estimated_total: 0,
      voucher_discount_amount: 0,
      items: [{ request_service_id: 1, service_id: 103, service_name: 'Sửa máy lạnh không lạnh', quantity: 1, selected_price: 200000 }],
      created_at: isoAt(NOW - 60000),
    });
    assert.equal(openDefaultZero.goods, 200000);
    assert.equal(openDefaultZero.total, 200000);
  });

  test('warrantyInfo nhận diện warrantyStartAt tương lai (D+1) & viServerMessage WARRANTY_NOT_STARTED đúng chuẩn D+1', () => {
    const tomorrowMs = NOW + 24 * 3600000;
    const futureW = ctx.warrantyInfo({
      code: 'REQ-9306',
      kind: 'normal',
      status: 'done',
      doneAt: NOW - 60000,
      warrantyDays: 30,
      warrantyStartAt: tomorrowMs,
      warrantyEndAt: tomorrowMs + 29 * 24 * 3600000,
      items: [{ id: '101', qty: 1 }],
    }, [], 0);
    assert.equal(futureW.ok, false);
    assert.equal(futureW.notStarted, true);
    assert.equal(futureW.reason, 'WARRANTY_NOT_STARTED');
    assert.equal(futureW.daysLeft, 30);

    const msg = viServerMessage('', 'WARRANTY_NOT_STARTED', 400);
    assert.match(msg, /ngày mai/);
  });

  test('SUPPLEMENTAL SENT sau INITIAL giảm giá trừ đúng signedApprovedDelta vào extraAmount', () => {
    const bookedItems = [{ id: '103', dbRequestServiceId: 1, name: 'Sửa máy lạnh không lạnh', qty: 2, price: 200000 }];
    const q1DownWithPart = {
      quotation_id: 711,
      quotation_type: 'INITIAL',
      quotation_status: 'APPROVED',
      total_amount: 300000,
      sent_at: isoAt(NOW - 200000),
      items: [
        { quotation_item_id: 1, item_type: 'SERVICE', request_service_id: 1, description_snapshot: 'Sửa máy lạnh không lạnh', quantity: 1, unit_price: 200000 },
        { quotation_item_id: 2, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 100000 },
      ],
    };
    const q2Sent = {
      quotation_id: 712,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 150000,
      sent_at: isoAt(NOW - 50000),
      items: [{ quotation_item_id: 3, item_type: 'MATERIAL', material_id: 1, description_snapshot: 'Gas R32', quantity: 1, unit_price: 150000 }],
    };
    const resQuote1 = sync.mapBackendQuotationToAppQuote([q1DownWithPart, q2Sent], [], 400000, '', 0, bookedItems, []);
    assert.equal(resQuote1.extraAmount, 50000);
    assert.equal(resQuote1.totalMin, 450000);

    const q1DownOnly = {
      ...q1DownWithPart,
      quotation_id: 713,
      total_amount: 200000,
      items: [{ quotation_item_id: 4, item_type: 'SERVICE', request_service_id: 1, description_snapshot: 'Sửa máy lạnh không lạnh', quantity: 1, unit_price: 200000 }],
    };
    const resQuote2 = sync.mapBackendQuotationToAppQuote([q1DownOnly, q2Sent], [], 400000, '', 0, bookedItems, []);
    assert.equal(resQuote2.extraAmount, 0);
    assert.equal(resQuote2.totalMin, 350000);
  });

  test('INITIAL APPROVED giảm giá + SUPPLEMENTAL SENT VT ngoài ước tính giữ extraAmount = 0 & totalMin/Max chuẩn', () => {
    const bookedItems = [{ id: '103', dbRequestServiceId: 1, name: 'Sửa máy lạnh không lạnh', qty: 2, price: 200000 }];
    const q1Down = {
      quotation_id: 721,
      quotation_type: 'INITIAL',
      quotation_status: 'APPROVED',
      total_amount: 200000,
      sent_at: isoAt(NOW - 200000),
      items: [{ quotation_item_id: 1, item_type: 'SERVICE', request_service_id: 1, description_snapshot: 'Sửa máy lạnh không lạnh', quantity: 1, unit_price: 200000 }],
    };
    const q2Est = {
      quotation_id: 722,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 100000,
      sent_at: isoAt(NOW - 50000),
      items: [{ quotation_item_id: 2, item_type: 'MATERIAL', is_external_purchase: true, description_snapshot: formatEstimatedExternalDesc({ name: 'Rơ-le', minPrice: 100000, maxPrice: 200000 }), quantity: 1, unit_price: 100000 }],
    };
    const res = sync.mapBackendQuotationToAppQuote([q1Down, q2Est], [], 400000, '', 0, bookedItems, []);
    assert.equal(res.effectivePriorExtra, -200000);
    assert.equal(res.extraAmount, 0);
    assert.equal(res.totalMin, 300000);
    assert.equal(res.totalMax, 400000);
  });

  test('Kiểm tra guard nguồn UI cho 8 điểm parity vừa sửa', () => {
    const miscSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/misc/MiscScreens.js'), 'utf8');
    assert.match(miscSrc, /\{isEstQuote \? \(/);
    assert.match(miscSrc, /initServiceDelta < 0/);
    assert.match(miscSrc, /Điều chỉnh giảm dịch vụ/);
    assert.match(miscSrc, /isApprovedWithBill/);

    const qeSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/tech/components/QuoteEditor.js'), 'utf8');
    assert.match(qeSrc, /initServiceDelta < 0/);
    assert.match(qeSrc, /Chênh lệch so với giá đặt/);

    const completeSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/tech/components/CompleteSheet.js'), 'utf8');
    assert.match(completeSrc, /serviceReduction > 0/);

    const techSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/tech/TechScreens.js'), 'utf8');
    assert.match(techSrc, /checkedList/);
    assert.match(techSrc, /measureEntries/);
    assert.match(techSrc, /!o\.quote && !isQuoteEditorOpen/);
    assert.match(techSrc, /Khách đã thanh toán trước/);

    const certSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/misc/WarrantyCertificate.js'), 'utf8');
    assert.match(certSrc, /isMaterialOnly/);
    assert.match(certSrc, /BH linh kiện/);
    assert.match(certSrc, /notStartedSubtitle/);
    assert.match(certSrc, /leadMatWarranty/);
  });

  test('origSum < disc kèm VT Q1 và VT ngoài ước tính Q2 giữ tổng không cộng dư do clamp sớm', () => {
    const bookedItems = [{ id: '103', dbRequestServiceId: 1, name: 'Sửa máy lạnh không lạnh', qty: 1, price: 500000 }];
    const q1 = {
      quotation_id: 731,
      quotation_type: 'INITIAL',
      quotation_status: 'APPROVED',
      total_amount: 150000,
      sent_at: isoAt(NOW - 200000),
      items: [
        { quotation_item_id: 1, item_type: 'SERVICE', request_service_id: 1, description_snapshot: 'Sửa máy lạnh không lạnh', quantity: 1, unit_price: 50000 },
        { quotation_item_id: 2, item_type: 'MATERIAL', material_id: 18, description_snapshot: 'Dây điện + CB', quantity: 1, unit_price: 100000 },
      ],
    };
    const q2 = {
      quotation_id: 732,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'SENT',
      total_amount: 100000,
      sent_at: isoAt(NOW - 50000),
      items: [{ quotation_item_id: 3, item_type: 'MATERIAL', is_external_purchase: true, description_snapshot: formatEstimatedExternalDesc({ name: 'Tụ điện', minPrice: 100000, maxPrice: 200000 }), quantity: 1, unit_price: 100000 }],
    };
    const res = sync.mapBackendQuotationToAppQuote([q1, q2], [], 425000, '', 75000, bookedItems, []);
    assert.equal(res.totalMin, 175000);
    assert.equal(res.totalMax, 275000);
  });

  test('mergeBackendOrdersWithLocal giữ nguyên warrantyEndAt & serverWarrantyEligibility khi danh sách thiếu warrantyEndAt', () => {
    const endAt = NOW + 20 * 86400000;
    const elig = { ok: false, notStarted: true, reason: 'WARRANTY_NOT_STARTED', totalDays: 30, daysLeft: 30, fetchedAt: NOW - 10000 };
    const merged = sync.mergeBackendOrdersWithLocal(
      [{ dbRequestId: 9301, code: 'REQ-9301', status: 'done', warrantyStartAt: NOW + 86400000, warrantyEndAt: endAt, warrantyDays: 30, serverWarrantyEligibility: elig }],
      [{ dbRequestId: 9301, code: 'REQ-9301', status: 'done', warrantyStartAt: null, warrantyEndAt: null, warrantyDays: null }],
    );
    assert.equal(merged[0].warrantyEndAt, endAt);
    assert.deepEqual(merged[0].serverWarrantyEligibility, elig);
  });

  test('Kiểm tra guard nguồn UI cho 12 lỗi cạnh biên vừa sửa', () => {
    const qeSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/tech/components/QuoteEditor.js'), 'utf8');
    assert.match(qeSrc, /grossWithPriorMax/);
    assert.match(qeSrc, /netReductionMin/);

    const usedSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/tech/components/UsedAndExtraMaterialsCard.js'), 'utf8');
    assert.match(usedSrc, /o\.kind !== 'warranty' && o\.kind !== 'followup'/);
    assert.match(usedSrc, /!isSupport && unitP > 0/);

    const techSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/tech/TechScreens.js'), 'utf8');
    assert.match(techSrc, /grossDraftMax/);
    assert.match(techSrc, /seenMeasureKeys/);
    assert.match(techSrc, /Còn lại cần thanh toán/);
    assert.match(techSrc, /o\.kind !== 'followup'/);

    const ctxSrc = fs.readFileSync(path.join(__dirname, '..', 'src/context/AppContext.js'), 'utf8');
    assert.match(ctxSrc, /remapped\?\.cancelReason/);
    assert.match(ctxSrc, /o\.kind === "followup" && hasExtra/);

    const miscSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/misc/MiscScreens.js'), 'utf8');
    assert.match(miscSrc, /orderNeedsSync/);
    assert.match(miscSrc, /INACTIVE_Q_ST/);
    assert.match(miscSrc, /netReductionMax/);

    const compSrc = fs.readFileSync(path.join(__dirname, '..', 'src/screens/tech/components/CompleteSheet.js'), 'utf8');
    assert.match(compSrc, /approvedRef/);
  });

  test('DialogHost xếp dọc khi >= 3 nút và repairNotes bỏ lặp symptoms trong findings', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'src/components/common/UIComponents.js'), 'utf8');
    assert.doesNotMatch(uiSrc, /actions\.length <= 2/);
    assert.match(uiSrc, /actions\.length >= 2/);

    const job = sync.mapBackendTechJobToOrder({
      assignment_id: 951,
      assignment_role: 'LEAD',
      assignment_status: 'ACTIVE',
      visit: { visit_number: 1, visit_status: 'IN_PROGRESS', actual_start: isoAt(NOW - 60000) },
      services: [{ request_service_id: 1, service_id: 101, service_name: 'Vệ sinh máy lọc', quantity: 1, selected_price: 250000 }],
      diagnoses: [{
        symptoms: 'Quạt hút yếu, Có mùi',
        findings: 'Quạt hút yếu, Có mùi. Màng lọc đã quá hạn',
        repair_recommendation: 'Thay màng lọc mới',
        recorded_at: isoAt(NOW - 30000),
      }],
      request: { request_id: 9401, request_code: 'REQ-9401', request_status: 'IN_PROGRESS' },
    }, { name: 'Thợ Chính', code: 'L1' });
    assert.equal(job.repairNotes[0].text, 'Triệu chứng: Quạt hút yếu, Có mùi · Kết luận: Màng lọc đã quá hạn · Đề xuất: Thay màng lọc mới');
  });
});
