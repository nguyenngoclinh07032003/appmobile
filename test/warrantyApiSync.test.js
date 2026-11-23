import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const sync = await import('../src/services/syncService.js');
const ctx = await import('../src/context/AppContext.js');
const data = await import('../src/constants/data.js');
const { applyServerWarrantyEligibility } = await import('../src/utils/warrantyPolicy.js');

const {
  syncCatalogFromBackend,
  setServiceWarrantyDays,
  resolveServiceWarrantyDays,
  getService,
  ALL_SERVICES,
} = data;

const {
  mapBackendCustomerRequestToOrder,
  mapBackendTechJobToOrder,
  mergeCustomerRequestDetail,
  mergeBackendOrdersWithLocal,
} = sync;

const { warrantyInfo } = ctx;

test('data: syncCatalogFromBackend, setServiceWarrantyDays và resolveServiceWarrantyDays đọc đúng warranty_days', () => {
  syncCatalogFromBackend({
    categories: [{ category_id: 1, category_name: 'Máy lạnh', is_active: true }],
    services: [
      { service_id: 1, category_id: 1, service_name: 'Vệ sinh máy lạnh', base_price: '180000.00', warranty_days: 7 },
      { service_id: 10, category_id: 1, service_name: 'Dịch vụ vệ sinh máy lạnh 2 lần trong 1 năm', base_price: '400000.00', warranty_days: 7 },
      { service_id: 79, category_id: 1, service_name: 'Sửa chữa điều hòa', base_price: '250000.00', warranty_days: 60 },
      { service_id: 81, category_id: 1, service_name: 'Sạc gas máy lạnh', base_price: '400000.00', warranty_days: 0 },
      { service_id: 11, category_id: 1, service_name: '[TEST] Thử thanh toán 5.000đ', base_price: '5000.00', warranty_days: null },
    ],
  });

  assert.equal(getService('s1')?.warrantyDays, 7);
  assert.equal(getService('s1')?.warranty, 'BH 7 ngày');

  assert.equal(getService('s10')?.warrantyDays, 7);
  assert.equal(getService('s10')?.warranty, 'BH 7 ngày');

  assert.equal(getService('s79')?.warrantyDays, 60);
  assert.equal(getService('s79')?.warranty, 'BH 60 ngày');

  assert.equal(getService('s81')?.warrantyDays, 0);
  assert.equal(getService('s81')?.warranty, '');

  assert.equal(getService('s11')?.warrantyDays, null);
  assert.equal(getService('s11')?.warranty, '');

  assert.equal(resolveServiceWarrantyDays(getService('s1'), { warrantyDays: 14 }), 14);
  assert.equal(resolveServiceWarrantyDays(getService('s11'), null), null);

  assert.equal(setServiceWarrantyDays(1, 30), true);
  assert.equal(ALL_SERVICES.find((x) => x.dbId === 1)?.warrantyDays, 30);
  assert.equal(ALL_SERVICES.find((x) => x.dbId === 1)?.warranty, 'BH 30 ngày');
  assert.equal(setServiceWarrantyDays(1, 7), true);
});

const baseReq = (over = {}) => ({
  request_id: 500,
  request_code: 'REQ-500',
  request_status: 'COMPLETED',
  preferred_payment_method: 'BANK_TRANSFER',
  created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  updated_at: new Date(Date.now() - 3600000).toISOString(),
  items: [{ request_service_id: 1, service_id: 1, service_name: 'Vệ sinh máy lạnh', quantity: 1, selected_price: 180000 }],
  visits: [{ visit_status: 'COMPLETED', work_performed: 'Xong' }],
  quotations: [],
  diagnoses: [],
  ...over,
});

const baseJob = (reqOver = {}) => ({
  assignment_id: 90500,
  assignment_status: 'ENDED',
  assigned_time: new Date(Date.now() - 3 * 3600000).toISOString(),
  completed_at: new Date(Date.now() - 3600000).toISOString(),
  visit: { visit_number: 1, visit_status: 'COMPLETED', work_performed: 'Xong' },
  services: reqOver.items || [{ request_service_id: 1, service_id: 1, service_name: 'Vệ sinh máy lạnh', quantity: 1, selected_price: 180000 }],
  quotations: [],
  diagnoses: [],
  request: baseReq(reqOver),
});

test('syncService: mapBackendCustomerRequestToOrder và mapBackendTechJobToOrder đọc đúng mọi biến thể bảo hành từ API', () => {
  syncCatalogFromBackend({
    categories: [{ category_id: 1, category_name: 'Máy lạnh', is_active: true }],
    services: [
      { service_id: 1, category_id: 1, service_name: 'Vệ sinh máy lạnh', base_price: '180000.00', warranty_days: 7 },
      { service_id: 10, category_id: 1, service_name: 'Dịch vụ vệ sinh máy lạnh 2 lần trong 1 năm', base_price: '400000.00', warranty_days: 7 },
      { service_id: 11, category_id: 1, service_name: '[TEST] Thử thanh toán 5.000đ', base_price: '5000.00', warranty_days: null },
    ],
  });

  // 1) req.warranty_days = 7
  const o7 = mapBackendCustomerRequestToOrder(baseReq({ warranty_days: 7 }));
  const j7 = mapBackendTechJobToOrder(baseJob({ warranty_days: 7 }));
  assert.equal(o7.warrantyDays, 7);
  assert.equal(j7.warrantyDays, 7);

  // 2) req.warranty_days = 0 (không rơi về null / 60)
  const o0 = mapBackendCustomerRequestToOrder(baseReq({ warranty_days: 0 }));
  const j0 = mapBackendTechJobToOrder(baseJob({ warranty_days: 0 }));
  assert.equal(o0.warrantyDays, 0);
  assert.equal(j0.warrantyDays, 0);

  // 3) warranty_days: null & warranty_end_date: null, dịch vụ danh mục có warranty_days = 7 -> 7
  const oCat7 = mapBackendCustomerRequestToOrder(baseReq({ warranty_days: null, warranty_end_date: null }));
  const jCat7 = mapBackendTechJobToOrder(baseJob({ warranty_days: null, warranty_end_date: null }));
  assert.equal(oCat7.warrantyDays, 7);
  assert.equal(jCat7.warrantyDays, 7);

  // 4) warranty_days: null & warranty_end_date: null, dịch vụ test (#11) có warranty_days = null -> 0 (không ép thành 60)
  const testItems = [{ request_service_id: 2, service_id: 11, service_name: '[TEST] Thử thanh toán 5.000đ', quantity: 1, selected_price: 5000 }];
  const oNoBh = mapBackendCustomerRequestToOrder(baseReq({ items: testItems, warranty_days: null, warranty_end_date: null }));
  const jNoBh = mapBackendTechJobToOrder(baseJob({ items: testItems, warranty_days: null, warranty_end_date: null }));
  assert.equal(oNoBh.warrantyDays, 0);
  assert.equal(jNoBh.warrantyDays, 0);

  // 5) warranty_start_date + warranty_end_date cách nhau 7 ngày
  const startIso = '2026-11-23T01:00:00.000Z';
  const endIso = '2026-11-30T01:00:00.000Z';
  const oDates = mapBackendCustomerRequestToOrder(baseReq({
    items: testItems,
    warranty_days: null,
    warranty_start_date: startIso,
    warranty_end_date: endIso,
  }));
  const jDates = mapBackendTechJobToOrder(baseJob({
    items: testItems,
    warranty_days: null,
    warranty_start_date: startIso,
    warranty_end_date: endIso,
  }));
  assert.equal(oDates.warrantyDays, 7);
  assert.equal(jDates.warrantyDays, 7);

  // 6) nested req.warranty = { warranty_days: 30, start_date, end_date, certificate_code }
  const oNested = mapBackendCustomerRequestToOrder(baseReq({
    warranty_days: undefined,
    warranty: { warranty_days: 30, start_date: startIso, end_date: '2026-12-23T01:00:00.000Z', certificate_code: 'BH-CERT-30' },
  }));
  const jNested = mapBackendTechJobToOrder(baseJob({
    warranty_days: undefined,
    warranty: { warranty_days: 30, start_date: startIso, end_date: '2026-12-23T01:00:00.000Z', certificate_code: 'BH-CERT-30' },
  }));
  assert.equal(oNested.warrantyDays, 30);
  assert.equal(jNested.warrantyDays, 30);
  assert.equal(oNested.report.warrantyCertificateCode, 'BH-CERT-30');
  assert.equal(jNested.report.warrantyCertificateCode, 'BH-CERT-30');
});

test('syncService: mergeCustomerRequestDetail & mergeBackendOrdersWithLocal giữ nguyên field bảo hành và eligibility', () => {
  const merged = mergeCustomerRequestDetail(
    { request_id: 700, request_status: 'COMPLETED' },
    {
      request: { request_id: 700, request_status: 'COMPLETED' },
      warranty_days: 7,
      warranty_start_date: '2026-11-23T01:00:00.000Z',
      warranty_end_date: '2026-11-30',
      warranty: { warranty_days: 7, certificate_code: 'BH-700' },
    },
  );
  assert.equal(merged.warranty_days, 7);
  assert.equal(merged.warranty_end_date, '2026-11-30');
  assert.equal(merged.warranty?.certificate_code, 'BH-700');

  const mergedOrders = mergeBackendOrdersWithLocal(
    [{ dbRequestId: 700, code: 'REQ-700', status: 'done', warrantyEndAt: 1000, serverWarrantyEligibility: { eligible: true, warranty_days: 7 } }],
    [{ dbRequestId: 700, code: 'REQ-700', status: 'done', warrantyEndAt: 1000 }],
  );
  assert.deepEqual(mergedOrders[0].serverWarrantyEligibility, { eligible: true, warranty_days: 7 });
});

test('warrantyPolicy & warrantyInfo: applyServerWarrantyEligibility và không ép gói test thành 60 ngày', () => {
  syncCatalogFromBackend({
    categories: [{ category_id: 1, category_name: 'Máy lạnh', is_active: true }],
    services: [
      { service_id: 10, category_id: 1, service_name: 'Dịch vụ vệ sinh máy lạnh 2 lần trong 1 năm', base_price: '400000.00', warranty_days: 7 },
      { service_id: 11, category_id: 1, service_name: '[TEST] Thử thanh toán 5.000đ', base_price: '5000.00', warranty_days: null },
    ],
  });

  // Đơn test không bảo hành (#11) -> warrantyInfo phải trả noWarranty: true, totalDays: 0
  const noBhOrder = mapBackendCustomerRequestToOrder(baseReq({
    request_code: 'REQ-9250959189',
    items: [{ request_service_id: 11, service_id: 11, service_name: '[TEST] Thử thanh toán 5.000đ', quantity: 1, selected_price: 5000 }],
  }));
  const noBhInfo = warrantyInfo(noBhOrder, [noBhOrder], 0);
  assert.equal(noBhInfo.ok, false);
  assert.equal(noBhInfo.noWarranty, true);
  assert.equal(noBhInfo.totalDays, 0);

  // Dịch vụ #10 có warranty_days = 7 dù kindFromName là 'lifetime' vẫn được hưởng đúng 7 ngày bảo hành
  const pkgOrder = mapBackendCustomerRequestToOrder(baseReq({
    request_code: 'REQ-PKG10',
    items: [{ request_service_id: 10, service_id: 10, service_name: 'Dịch vụ vệ sinh máy lạnh 2 lần trong 1 năm', quantity: 1, selected_price: 400000 }],
  }));
  const pkgInfo = warrantyInfo(pkgOrder, [pkgOrder], 0);
  assert.equal(pkgInfo.ok, true);
  assert.equal(pkgInfo.totalDays, 7);

  // applyServerWarrantyEligibility: eligible: true
  const baseEligible = { ok: true, totalDays: 60, daysLeft: 60, until: Date.now() + 86400000 };
  const srvOk = applyServerWarrantyEligibility(baseEligible, {
    eligible: true,
    warranty_days: 7,
    days_remaining: 5,
    warranty_end_date: '2026-11-30',
    is_final_day: false,
    available_dates: ['2026-11-26', '2026-11-27'],
    available_slots_today: ['14h00 - 16h00'],
  }, () => '30/11/2026');
  assert.equal(srvOk.ok, true);
  assert.equal(srvOk.totalDays, 7);
  assert.equal(srvOk.daysLeft, 5);
  assert.deepEqual(srvOk.availableDates, ['2026-11-26', '2026-11-27']);
  assert.deepEqual(srvOk.serverAvailableSlotsToday, ['14h00 - 16h00']);
  assert.equal(srvOk.text, 'Còn 5/7 ngày bảo hành (đến 30/11/2026).');

  // applyServerWarrantyEligibility: WARRANTY_FINAL_DAY_CUTOFF
  const srvCutoff = applyServerWarrantyEligibility(baseEligible, {
    eligible: false,
    reason_code: 'WARRANTY_FINAL_DAY_CUTOFF',
    warranty_days: 7,
    warranty_end_date: '2026-11-26',
    is_final_day: true,
    message: 'Đã quá giờ tiếp nhận ngày cuối.',
    support_hotline: '1900 886633',
  });
  assert.equal(srvCutoff.ok, false);
  assert.equal(srvCutoff.isCutoff, true);
  assert.equal(srvCutoff.isFinalDay, true);
  assert.equal(srvCutoff.supportHotline, '1900 886633');

  // applyServerWarrantyEligibility: WARRANTY_NOT_APPLICABLE / warranty_days: 0
  const srvNoBh = applyServerWarrantyEligibility(baseEligible, {
    eligible: false,
    reason_code: 'WARRANTY_NOT_APPLICABLE',
    warranty_days: 0,
  });
  assert.equal(srvNoBh.ok, false);
  assert.equal(srvNoBh.noWarranty, true);
  assert.equal(srvNoBh.totalDays, 0);
});
