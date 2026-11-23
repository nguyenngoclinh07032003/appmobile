import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import './helpers/register-loader.mjs';

// Cho phép test import bản thật của src/services/api.js qua query ?real=1
// (trong khi các import thường từ syncService/AppContext vẫn dùng stub của ext-loader).
register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier.includes('api.js?real=1')) {
        return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  `)}`,
  import.meta.url,
);

const { R } = await import('../src/theme/theme.js');
const realApi = await import('../src/services/api.js?real=1');
const sync = await import('../src/services/syncService.js');
const ctx = await import('../src/context/AppContext.js');
const { formatEstimatedExternalDesc, formatFinalizedExternalDesc } = await import('../src/utils/externalPartsPricing.js');
const { normalizeWarrantyEndYmd, applyServerWarrantyEligibility } = await import('../src/utils/warrantyPolicy.js');

const { hrmssApi, authTokens } = realApi;

const makeJwt = (expOffsetSec) => {
  const hdr = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const pay = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSec })).toString('base64url');
  return `${hdr}.${pay}.sig`;
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('theme: R.pill bằng 999', () => {
  assert.equal(R.pill, 999);
});

test('api: decideQuotation chuẩn hoá lowercase revise/approve và rawRequest giữ nguyên data: null', async () => {
  const prevFetch = globalThis.fetch;
  const captured = [];
  authTokens.clear();
  authTokens.set(makeJwt(3600));
  authTokens.setRefresh('rf_test');
  try {
    globalThis.fetch = async (url, init = {}) => {
      captured.push({ url, body: init.body ? JSON.parse(init.body) : null });
      return jsonResponse(200, { ok: true, data: null, message: 'OK' });
    };

    const reviseRes = await hrmssApi.decideQuotation(101, { decision: 'revise', rejection_reason: 'Giá cao' });
    assert.equal(reviseRes.ok, true);
    assert.equal(reviseRes.data, null);
    assert.equal(captured[0].body.decision, 'REVISE');
    assert.equal(captured[0].body.rejection_reason, 'Giá cao');

    await hrmssApi.decideQuotation(102, { decision: 'approve' });
    assert.equal(captured[1].body.decision, 'APPROVED');

    await hrmssApi.decideQuotation(103, { decision: false });
    assert.equal(captured[2].body.decision, 'REJECTED');

    const detailRes = await hrmssApi.getCustomerRequestDetail(104);
    assert.equal(detailRes.ok, true);
    assert.equal(detailRes.data, null);
  } finally {
    globalThis.fetch = prevFetch;
    authTokens.clear();
  }
});

test('api: apiRequest phân biệt refresh 401 (SESSION_EXPIRED) vs lỗi 5xx (giữ phiên)', async () => {
  const prevFetch = globalThis.fetch;
  let expiredCalls = 0;
  authTokens.onExpired(() => { expiredCalls += 1; });
  try {
    // 1) Refresh thất bại với 401 -> SESSION_EXPIRED, xoá token và gọi onExpired
    authTokens.clear();
    authTokens.set(makeJwt(3600));
    authTokens.setRefresh('rf_expired');
    globalThis.fetch = async (url) => {
      if (String(url).includes('/auth/mobile/refresh')) {
        return jsonResponse(401, { ok: false, message: 'Refresh expired' });
      }
      return jsonResponse(401, { ok: false, code: 'TOKEN_EXPIRED', message: 'Expired' });
    };
    const r401 = await hrmssApi.getMe();
    assert.equal(r401.ok, false);
    assert.equal(r401.status, 401);
    assert.equal(r401.code, 'SESSION_EXPIRED');
    assert.equal(expiredCalls, 1);
    assert.equal(authTokens.get(), null);
    assert.equal(authTokens.getRefresh(), null);

    // 2) Refresh lỗi 500 -> giữ refresh token & không gọi onExpired
    authTokens.set(makeJwt(3600));
    authTokens.setRefresh('rf_keep_me');
    globalThis.fetch = async (url) => {
      if (String(url).includes('/auth/mobile/refresh')) {
        return jsonResponse(500, { ok: false, code: 'INTERNAL_ERROR', message: 'Server error' });
      }
      return jsonResponse(401, { ok: false, code: 'TOKEN_EXPIRED', message: 'Expired' });
    };
    const r500 = await hrmssApi.getMe();
    assert.equal(r500.ok, false);
    assert.equal(r500.status, 500);
    assert.equal(expiredCalls, 1);
    assert.equal(authTokens.getRefresh(), 'rf_keep_me');
  } finally {
    globalThis.fetch = prevFetch;
    authTokens.onExpired(null);
    authTokens.clear();
  }
});

test('syncService: INITIAL approved với cọc vật tư ngoài không trừ trùng tiền đặt và quoted trừ ưu đãi', () => {
  const estDesc = formatEstimatedExternalDesc('Dây đồng', 200000, 400000);
  const finDesc = formatFinalizedExternalDesc('Dây đồng', 300000, 200000, 400000, 250000, 1);
  const reqPayload = {
    request_id: 501,
    request_code: 'REQ-501',
    request_status: 'IN_PROGRESS',
    preferred_time: '2026-11-24T08:00:00+07:00',
    services: [{ service_id: 1, service_name: 'Vệ sinh máy lạnh', price_snapshot: 200000, quantity: 1 }],
    total_amount: 200000,
    quotations: [
      {
        quotation_id: 1,
        quotation_type: 'INITIAL',
        quotation_status: 'APPROVED',
        total_amount: 450000,
        sent_at: '2026-11-23T08:00:00Z',
        items: [
          { quotation_item_id: 11, item_type: 'SERVICE', description_snapshot: 'Vệ sinh máy lạnh', unit_price: 200000, quantity: 1 },
          { quotation_item_id: 12, item_type: 'MATERIAL', is_external_purchase: true, description_snapshot: estDesc, unit_price: 250000, quantity: 1 },
        ],
      },
      {
        quotation_id: 2,
        quotation_type: 'SUPPLEMENTAL',
        quotation_status: 'APPROVED',
        total_amount: 50000,
        sent_at: '2026-11-23T09:00:00Z',
        items: [
          { quotation_item_id: 21, item_type: 'MATERIAL', is_external_purchase: true, description_snapshot: finDesc, unit_price: 50000, quantity: 1 },
        ],
      },
    ],
  };
  const order = sync.mapBackendCustomerRequestToOrder(reqPayload);
  assert.equal(order.total, 500000);

  // Đơn đang chờ duyệt báo giá (quoted): trừ đủ tierPartDiscount + lateDiscount + voucherDiscount
  const quotedReq = {
    request_id: 502,
    request_code: 'REQ-502',
    request_status: 'DIAGNOSED_PENDING_QUOTATION',
    preferred_time: '2026-11-24T08:00:00+07:00',
    services: [{ service_id: 1, service_name: 'Sửa máy lạnh', price_snapshot: 300000, quantity: 1 }],
    total_amount: 300000,
    quotations: [
      {
        quotation_id: 3,
        quotation_type: 'INITIAL',
        quotation_status: 'SENT',
        total_amount: 500000,
        sent_at: '2026-11-23T08:00:00Z',
        items: [
          { quotation_item_id: 31, item_type: 'SERVICE', description_snapshot: 'Sửa máy lạnh', unit_price: 300000, quantity: 1 },
          { quotation_item_id: 32, item_type: 'MATERIAL', material_id: 99, description_snapshot: 'Tụ điện', unit_price: 200000, quantity: 1 },
        ],
      },
    ],
    bill: {
      bill: {
        bill_id: 77,
        total_amount: 500000,
        tier_part_discount_amount: 20000,
        late_discount_amount: 30000,
        voucher_discount_amount: 50000,
        payment_status: 'UNPAID',
      },
    },
  };
  const custQuoted = sync.mapBackendCustomerRequestToOrder(quotedReq);
  assert.equal(custQuoted.total, 400000);

  const techQuoted = sync.mapBackendTechJobToOrder({
    assignment_id: 88,
    assignment_status: 'ACTIVE',
    request: quotedReq,
    quotations: quotedReq.quotations,
    bill: quotedReq.bill,
  });
  assert.equal(techQuoted.total, 400000);
});

test('syncService & AppContext: mergeBackendOrdersWithLocal bảo toàn locallyFinalizedExternalNames và keepCashClaim', () => {
  const localFin = [
    {
      dbRequestId: 601,
      code: 'REQ-601',
      status: 'repairing',
      tech: { code: 'T10' },
      locallyFinalizedExternalNames: ['Dây đồng'],
      pendingExternalEstimates: [{ name: 'Dây đồng' }],
      externalPriceState: 'finalized',
    },
  ];
  const remoteStale = [
    {
      dbRequestId: 601,
      code: 'REQ-601',
      status: 'repairing',
      tech: { code: 'T10' },
      pendingExternalEstimates: [{ name: 'Dây đồng', itemId: 1 }],
      externalPriceState: 'needs_final_price',
    },
  ];
  const merged = sync.mergeBackendOrdersWithLocal(localFin, remoteStale);
  assert.deepEqual(merged[0].locallyFinalizedExternalNames, ['Dây đồng']);
  assert.deepEqual(merged[0].pendingExternalEstimates, []);
  assert.equal(merged[0].externalPriceState, 'finalized');
  assert.notEqual(ctx.techStatusMeta(merged[0]).label, 'Đang thực hiện · Chờ chốt VT');
  assert.deepEqual(ctx.getPendingExternalEstimates(remoteStale[0]).length, 1);
  assert.deepEqual(ctx.getPendingExternalEstimates(merged[0]).length, 0);

  // keepCashClaim cập nhật cả cashToCollect ở root lẫn bill
  const localClaim = [
    {
      dbRequestId: 602,
      code: 'REQ-602',
      status: 'pending_payment',
      tech: { code: 'T10' },
      paymentMethod: 'cash',
      cashClaimLocked: true,
      cashClaimAt: Date.now(),
      bill: { remainingAmount: 350000, amountDue: 350000, paymentMethod: 'VIETQR', cashClaimPending: false },
    },
  ];
  const remoteQr = [
    {
      dbRequestId: 602,
      code: 'REQ-602',
      status: 'pending_payment',
      tech: { code: 'T10' },
      paymentMethod: 'vietqr',
      bill: { remainingAmount: 350000, amountDue: 350000, paymentMethod: 'BANK_TRANSFER', cashClaimPending: false },
    },
  ];
  const mergedClaim = sync.mergeBackendOrdersWithLocal(localClaim, remoteQr);
  assert.equal(mergedClaim[0].paymentMethod, 'cash');
  assert.equal(mergedClaim[0].cashToCollect, 350000);
  assert.equal(mergedClaim[0].bill.cashToCollect, 350000);
  assert.equal(mergedClaim[0].bill.cashClaimPending, true);
});

test('AppContext: cashToCollect trả 0 cho VietQR và countValidVouchers lọc hết hạn & trùng mã', () => {
  assert.equal(
    ctx.cashToCollect({
      paymentMethod: 'vietqr',
      cashToCollect: 400000,
      bill: { paymentMethod: 'BANK_TRANSFER', amountDue: 400000, remainingAmount: 400000, cashToCollect: 400000 },
    }),
    0,
  );
  assert.equal(
    ctx.cashToCollect({
      paymentMethod: 'cash',
      bill: { paymentMethod: 'CASH', remainingAmount: 280000, cashToCollect: 280000 },
    }),
    280000,
  );

  const nowTs = 1795000000000;
  const wallet = [
    { customerVoucherId: 1, code: 'GIAM20', expiresAt: nowTs + 60000 },
    { customerVoucherId: 2, code: 'HETHAN', expiresAt: nowTs - 1000 },
  ];
  const pub = [
    { code: 'GIAM20', expiresAt: nowTs + 60000 },
    { code: 'CONHAN', expiresAt: nowTs + 60000 },
    { code: 'HET2', expiresAt: nowTs - 500 },
  ];
  assert.equal(ctx.countValidVouchers(wallet, pub, nowTs), 2);
  assert.deepEqual(
    ctx.getValidVouchers(wallet, pub, nowTs).map((v) => v.code),
    ['GIAM20', 'CONHAN'],
  );
});

test('warrantyPolicy: normalizeWarrantyEndYmd & applyServerWarrantyEligibility chốt 18h00 ngày cuối', () => {
  assert.equal(normalizeWarrantyEndYmd('2026-11-23'), '2026-11-23');
  assert.equal(normalizeWarrantyEndYmd('2026-11-23T00:00:00.000Z'), '2026-11-23');
  assert.equal(normalizeWarrantyEndYmd('2026-11-23T23:59:59.000Z'), '2026-11-23');
  // 17:00 UTC ngày 22 == 00:00 GMT+7 ngày 23
  assert.equal(normalizeWarrantyEndYmd('2026-11-22T17:00:00.000Z'), '2026-11-23');

  // Nếu cache serverElig còn eligible: true nhưng đồng hồ GMT+7 đã qua 18h00 ngày cuối -> từ chối
  const afterCutoffNow = new Date('2026-11-23T18:15:00+07:00');
  const blocked = applyServerWarrantyEligibility(
    { ok: true, totalDays: 60 },
    { eligible: true, warranty_days: 60, warranty_end_date: '2026-11-23', is_final_day: true, days_remaining: 1 },
    null,
    afterCutoffNow,
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.isCutoff, true);
  assert.equal(blocked.reason, 'WARRANTY_FINAL_DAY_CUTOFF');
});
