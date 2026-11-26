// Đối chiếu tài liệu Luồng 2 (đặt đơn & phân việc), duyệt báo giá tại chỗ và bảo hành linh kiện.
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const {
  viServerMessage,
  viNotification,
  viNonWorkingDayDetail,
  extractDuplicateRequestCode,
} = await import('../src/utils/viText.js');
const sync = await import('../src/services/syncService.js');
const { mapQuotePreview, buildPreferredTimeIso } = sync;
const { extractMaterialWarrantiesFromQuotations } = await import('../src/utils/materialWarranty.js');
const { customerStatusMeta } = await import('../src/context/AppContext.js');

test('26/11: buildPreferredTimeIso giữ đủ giờ:phút theo giờ VN, dữ liệu sai trả null (không lấy giờ hiện tại)', () => {
  assert.equal(buildPreferredTimeIso('2026-11-27', '14h45 - 16h45'), '2026-11-27T07:45:00.000Z');
  assert.equal(buildPreferredTimeIso('2026-11-27', '08h00 - 10h00'), '2026-11-27T01:00:00.000Z');
  assert.equal(buildPreferredTimeIso('', '14h45 - 16h45'), null);
  assert.equal(buildPreferredTimeIso('2026-11-27', ''), null);
  assert.equal(buildPreferredTimeIso('2026-11-27', '25h00'), null);
});

test('26/11: đơn chưa có thợ đã quá giờ hẹn hiện "Đang tìm thợ – đã quá giờ hẹn"', () => {
  const now = Date.UTC(2026, 10, 26, 10, 0, 0);
  const meta = customerStatusMeta({ status: 'pending', preferredTimeAt: now - 3600e3, dateKey: '2026-11-26', slot: '15h00 - 17h00' }, now);
  assert.equal(meta.label, 'Đang tìm thợ');
  assert.match(meta.desc, /đã quá giờ hẹn, HRMSS sẽ liên hệ bạn/);
});

test('26/11: đọc warranty_code (BHLK-...) và chấp nhận null cho dòng cũ', () => {
  const list = extractMaterialWarrantiesFromQuotations([{
    quotation_id: 1,
    quotation_status: 'APPROVED',
    items: [{
      quotation_item_id: 11,
      is_external_purchase: true,
      description_snapshot: 'Tụ kích',
      warranties: [
        { material_warranty_id: 12, warranty_code: 'BHLK-REQ-4821375612', external_warranty_code: 'HANG-1', warranty_days: 180, status: 'VALID' },
        { material_warranty_id: 13, warranty_code: null, warranty_days: 90, status: 'PENDING' },
      ],
    }],
  }]);
  assert.equal(list[0].warrantyCode, 'BHLK-REQ-4821375612');
  assert.equal(list[0].externalWarrantyCode, 'HANG-1');
  assert.equal(list[1].warrantyCode, null);

  // Dòng báo giá trong chi tiết đơn khách cũng mang mã BHLK để hiển thị cạnh linh kiện.
  const order = sync.mapBackendCustomerRequestToOrder({
    request_id: 9001,
    request_code: 'REQ-4821375612',
    request_status: 'COMPLETED',
    items: [{ request_service_id: 1, service_id: 1, service_name: 'Sửa máy lạnh', quantity: 1, selected_price: 200000 }],
    quotations: [{
      quotation_id: 1,
      quotation_type: 'SUPPLEMENTAL',
      quotation_status: 'APPROVED',
      customer_decision: 'APPROVED',
      items: [{
        quotation_item_id: 11,
        item_type: 'MATERIAL',
        is_external_purchase: true,
        description_snapshot: 'Tụ kích',
        quantity: 1,
        unit_price: 150000,
        warranties: [{ material_warranty_id: 12, warranty_code: 'BHLK-REQ-4821375612', external_warranty_code: 'HANG-1', warranty_days: 180, status: 'VALID' }],
      }],
    }],
  });
  const line = (order.quote?.lines || []).find((l) => /Tụ kích/.test(l.name));
  assert.equal(line?.warrantyCode, 'BHLK-REQ-4821375612');
  assert.equal(line?.externalWarrantyCode, 'HANG-1');
});

test('viText: đủ câu tiếng Việt cho bảng mã lỗi Luồng 2 và duyệt báo giá tại chỗ', () => {
  const codes = [
    'EMAIL_NOT_VERIFIED', 'ADDRESS_NOT_FOUND', 'INVALID_SERVICE', 'DUPLICATE_REQUEST', 'NON_WORKING_DAY',
    'CANNOT_CANCEL', 'CANCEL_TOO_LATE', 'CANNOT_EDIT', 'EDIT_TOO_LATE', 'TECHNICIAN_NOT_ELIGIBLE',
    'TECHNICIAN_NOT_FOUND', 'ALREADY_ASSIGNED', 'CANNOT_REASSIGN', 'INVALID_REQUEST_STATE', 'REQUEST_NOT_AVAILABLE',
    'NO_CATEGORY_TO_SUPPORT', 'SUPPORT_NOT_FOUND', 'TOO_MANY_ACTIVE_JOBS', 'NOT_ACCEPTING_JOBS', 'SPECIALTY_MISMATCH',
    'REQUEST_DECLINED', 'TIME_CONFLICT', 'JOB_NOT_FOUND', 'JOB_NOT_ACTIVE', 'LEAD_ONLY', 'OUTSIDE_SUPPORT_SCOPE',
    'NOT_SUPPORT_TECHNICIAN', 'TRAVEL_NOT_STARTED', 'ALREADY_ARRIVED', 'TOO_FAR_FROM_CUSTOMER', 'CHECK_IN_REQUIRED',
    'LEAD_NOT_STARTED', 'INVALID_VISIT_STATE', 'QUOTATION_PENDING', 'QUOTATION_REVISION_PENDING',
    'QUOTATION_ALREADY_APPROVED', 'QUOTATION_DUPLICATES_BOOKED_SERVICE', 'REMIND_TOO_SOON', 'NO_PENDING_QUOTATION',
    'QUOTATION_NOT_FOUND', 'PROCEDURE_INCOMPLETE', 'RECEIPT_REQUIRED', 'PHOTO_REQUIRED', 'STEP_REQUIRED',
    'PAYMENT_REQUIRED', 'PRE_VISIT_QUOTE_NEEDS_APP', 'CUSTOMER_HAS_APP', 'INVALID_PHOTO',
    'MATERIAL_WARRANTY_NOT_FOUND', 'MATERIAL_WARRANTY_NOT_ACTIVE', 'MATERIAL_WARRANTY_CLOSED',
  ];
  const generic = new Set([
    viServerMessage(null, 'UNKNOWN_X', 400),
    viServerMessage(null, 'UNKNOWN_X', 403),
    viServerMessage(null, 'UNKNOWN_X', 404),
    viServerMessage(null, 'UNKNOWN_X', 409),
  ]);
  for (const c of codes) {
    const msg = viServerMessage('Some english text', c, 409);
    assert.ok(msg && !generic.has(msg), `Thiếu câu tiếng Việt riêng cho ${c}`);
  }
});

test('viText: thông báo Luồng 2 có tiêu đề tiếng Việt riêng', () => {
  const types = [
    'REQUEST_CREATED_BY_STAFF', 'TECH_ASSIGNED', 'JOB_RESCHEDULED', 'QUOTE_REMINDER', 'QUOTATION_REVISION',
    'TECH_ON_THE_WAY', 'TECH_ARRIVED', 'LATE_COMPENSATION', 'REPAIR_NOTE', 'TECH_RELEASED', 'APOLOGY_VOUCHER',
    'PAYMENT_DUE', 'JOB_SUBMITTED', 'ACCEPTANCE_APPROVED', 'FOLLOW_UP_REQUESTED', 'OUT_OF_WARRANTY',
    'REQUEST_CANCELLED_BY_STAFF', 'REQUEST_UNASSIGNED', 'REQUEST_AUTO_CANCELLED', 'TECHNICIAN_LATE',
    'TECHNICIAN_DELAYED', 'SUPPORT_PART_DONE', 'REQUEST_NEEDS_DISPATCH', 'JOB_ASSIGNED', 'JOB_REASSIGNED',
  ];
  for (const t of types) {
    const n = viNotification({ type: t, request_code: 'REQ-123456' });
    assert.notEqual(n.title, 'Thông báo mới', `Thiếu tiêu đề cho ${t}`);
  }
});

test('NON_WORKING_DAY và DUPLICATE_REQUEST đọc đúng chi tiết errors[]', () => {
  assert.match(viNonWorkingDayDetail([{ field: 'preferred_time', message: 'SUNDAY' }]), /Chủ nhật/);
  assert.match(viNonWorkingDayDetail([{ message: 'HOLIDAY:Quốc khánh' }]), /ngày lễ \(Quốc khánh\)/);
  assert.equal(viNonWorkingDayDetail([]), '');
  assert.equal(extractDuplicateRequestCode([{ message: 'REQ-123456-7890' }]), 'REQ-123456-7890');
  assert.equal(extractDuplicateRequestCode([{ message: 'khác' }]), '');
});

test('mapQuotePreview: đọc tổng tiền, giảm giá, voucher và số ngày bảo hành từ quote-preview', () => {
  const p = mapQuotePreview({
    preview: {
      goods_amount: 500000,
      product_discount_amount: 20000,
      combo_discount_amount: 24000,
      combo_label: 'Combo 2 máy',
      voucher_discount_amount: 50000,
      estimated_total: 406000,
      warranty_days: 90,
    },
  });
  assert.deepEqual(
    { goods: p.goods, pd: p.productDiscount, cd: p.comboDiscount, vd: p.voucherDiscount, total: p.total, w: p.warrantyDays },
    { goods: 500000, pd: 20000, cd: 24000, vd: 50000, total: 406000, w: 90 },
  );
  // Dạng phẳng, không có bảo hành
  const flat = mapQuotePreview({ goods_amount: 200000, estimated_total: 200000, warranty_days: null });
  assert.equal(flat.total, 200000);
  assert.equal(flat.warrantyDays, null);
  // Không có tổng tiền -> null (app giữ số tạm tính trên máy)
  assert.equal(mapQuotePreview({ foo: 1 }), null);
  assert.equal(mapQuotePreview(null), null);
});
