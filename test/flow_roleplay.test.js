// Kiểm thử ĐÓNG VAI end-to-end: cùng một đơn được nhìn từ phía KHÁCH (GET /customer/requests/:id) và phía THỢ
// (GET /technician/jobs/:id) ở từng bước. Payload backend được mô phỏng, nhưng toàn bộ mapper / hàm tính tiền /
// nhãn trạng thái là CODE THẬT của app (syncService.js, AppContext.js, data.js, externalPartsPricing.js,
// useQuoteDraft.js, warrantyPolicy.js) — nạp qua test/helpers/ext-loader.mjs (stub react-native / expo / mạng).
//
// Chạy:  node --import ./test/helpers/register-loader.mjs --test test/flow_roleplay.test.js
// (File tự đăng ký loader nên `node --test test/*.test.js` cũng chạy được.)
//
// Test có tiền tố "BUG-xx" + { todo } = LỖI CỦA APP đã phát hiện (assert ghi giá trị ĐÚNG mong đợi). Xem báo cáo.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const sync = await import('../src/services/syncService.js');
const ctx = await import('../src/context/AppContext.js');
const data = await import('../src/constants/data.js');
const ext = await import('../src/utils/externalPartsPricing.js');
const { draftFromOrder } = await import('../src/screens/tech/components/useQuoteDraft.js');
const { analyzeWarrantyEligibility } = await import('../src/utils/warrantyPolicy.js');

const {
  mapBackendCustomerRequestToOrder,
  mapBackendTechJobToOrder,
  mapBackendOpenRequestToOrder,
  mapBackendQuotationToAppQuote,
  mapBackendBill,
  mapBackendStatusToAppStatus,
  mergeBackendOrdersWithLocal,
} = sync;
const {
  orderTotal, orderTotalRange, formatOrderTotal, cashToCollect, isPaid,
  customerStatusMeta, techStatusMeta, bookedValue, warrantyInfo,
} = ctx;
const { stepIndexOf, techStepIndexOf, syncCatalogFromBackend, MATERIALS, ORDER_STEPS, TECH_ORDER_STEPS } = data;
const { computeQuoteRangeTotals, extractExternalPartLifecycle, formatEstimatedExternalDesc, formatFinalizedExternalDesc, parseExternalPartDesc } = ext;

// ---------------------------------------------------------------------------
// Catalog (GET /catalog) — dùng chung cho cả 2 phía
// ---------------------------------------------------------------------------
syncCatalogFromBackend({
  categories: [{ category_id: 1, category_name: 'Điện lạnh', is_active: true }],
  services: [
    { service_id: 101, category_id: 1, service_name: 'Vệ sinh máy lạnh treo tường', base_price: 250000 },
    { service_id: 102, category_id: 1, service_name: 'Dây điện', base_price: 5000 },
    { service_id: 103, category_id: 1, service_name: 'Sửa máy lạnh không lạnh', base_price: 200000 },
    { service_id: 104, category_id: 1, service_name: 'Lắp đặt máy lạnh', base_price: 300000 },
  ],
  materials: [
    { material_id: 1, material_name: 'Gas R32', unit_price: 250000, unit_of_measure: 'kg' },
    { material_id: 18, material_name: 'Dây điện + CB', unit_price: 120000, unit_of_measure: 'bộ' },
  ],
});

// ---------------------------------------------------------------------------
// Bộ dựng payload backend
// ---------------------------------------------------------------------------
const H = 3600000;
const DAY = 24 * H;
const NOW = Date.now();
const isoAt = (ms) => (ms == null ? null : new Date(ms).toISOString());
const PREF = isoAt(NOW + 3 * DAY); // giờ hẹn ở tương lai -> không bị "Quá hạn tiếp nhận"
const TECH_PROFILE = { name: 'Trần Văn Thợ', code: '77', phone: '0912000111', rating: 4.9 };
const CUSTOMER_PHONE = '0988123456';

const svcItem = (sid, name, price, qty = 1) => ({
  request_service_id: sid * 10, service_id: sid, service_name: name, selected_price: price, quantity: qty,
});

let QID = 500;
let QIID = 9000;
const qItem = ({ type = 'SERVICE', materialId = null, desc, unit, qty = 1, totalPrice, lineTotal, external = false, extra = {} }) => ({
  quotation_item_id: ++QIID,
  item_type: type,
  material_id: materialId,
  description_snapshot: desc,
  quantity: qty,
  unit_price: unit,
  ...(totalPrice !== undefined ? { total_price: totalPrice } : {}),
  ...(lineTotal !== undefined ? { line_total: lineTotal } : {}),
  is_external_purchase: external,
  ...extra,
});
const lineAmount = (i) => (i.unit_price != null ? Number(i.unit_price) * (i.quantity || 1) : Number(i.total_price ?? i.line_total ?? 0));
const quotation = ({ type = 'SUPPLEMENTAL', status = 'SENT', items, total }) => ({
  quotation_id: ++QID,
  quotation_code: `BG-${QID}`,
  quotation_type: type,
  quotation_status: status,
  items,
  total_amount: total ?? items.reduce((s, i) => s + lineAmount(i), 0),
  sent_at: isoAt(NOW),
});
const decide = (q, status, note = '') => ({ ...q, quotation_status: status, ...(note ? { revision_note: note } : {}) });

const billSummary = ({ booked, quotationTotal = null, supplemental = 0, tier = 0, voucher = 0, late = 0, due, paid = 0, payStatus, method = 'CASH', prodDisc = 0, comboDisc = 0 }) => {
  const ps = payStatus ?? (due === 0 ? 'NOTHING_TO_PAY' : paid >= due ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID');
  return {
    bill: {
      amount_due: due, booked_amount: booked, quotation_total: quotationTotal, supplemental_total: supplemental,
      tier_part_discount_percent: 0, tier_part_discount_amount: tier, voucher_discount_amount: voucher,
      late_discount_amount: late, product_discount_amount: prodDisc, combo_discount_amount: comboDisc,
    },
    paid_amount: paid,
    remaining_amount: Math.max(0, due - paid),
    payment_status: ps,
    payment_method: method,
    cash_to_collect: method === 'CASH' ? Math.max(0, due - paid) : 0,
  };
};

let RID = 7000;
const newOrder = (o = {}) => ({
  requestId: ++RID,
  code: `REQ-${RID}`,
  type: 'NORMAL',
  outOfWarranty: false,
  items: [],
  goods: null,
  prodDisc: 0,
  comboDisc: 0,
  voucher: 0,
  techSeesVoucher: false,
  status: 'RECEIVED',
  visitStatus: null,
  quotations: [],
  diagnoses: [],
  bill: null,
  travelStartedAt: null,
  arrivedAt: null,
  assignment: 'ACTIVE',
  completedAt: null,
  timeline: [],
  warrantyStart: null,
  warrantyEnd: null,
  warrantyDays: null,
  payment: 'CASH',
  estimated: null,
  ...o,
});

const customerPayload = (st) => ({
  request_id: st.requestId,
  request_code: st.code,
  request_status: st.status,
  request_type: st.type,
  out_of_warranty: st.outOfWarranty,
  items: st.items,
  goods_amount: st.goods,
  product_discount_amount: st.prodDisc,
  combo_discount_amount: st.comboDisc,
  voucher_discount_amount: st.voucher,
  voucher_code: st.voucher ? 'GIAM20K' : null,
  estimated_total: st.estimated,
  preferred_time: PREF,
  created_at: isoAt(NOW - 2 * H),
  updated_at: isoAt(NOW),
  preferred_payment_method: st.payment,
  problem_description: 'Máy lạnh kém lạnh, chảy nước',
  address: { address_text: '25 Duy Tân, Dịch Vọng Hậu, Cầu Giấy, Hà Nội', contact_name: 'Nguyễn Văn Khách', contact_phone: CUSTOMER_PHONE },
  technician: st.status === 'RECEIVED' ? null : { technician_id: 77, full_name: 'Trần Văn Thợ', phone: '0912000111', rating_average: 4.9, rating_count: 20 },
  visits: st.visitStatus ? [{ visit_status: st.visitStatus, scheduled_start: PREF, work_performed: st.completedAt ? 'Đã xử lý xong' : '' }] : [],
  quotations: st.quotations,
  diagnoses: st.diagnoses,
  bill: st.bill,
  timeline: st.timeline,
  journey: st.travelStartedAt
    ? { on_the_way: !st.arrivedAt, travel_started_at: isoAt(st.travelStartedAt), arrived_at: isoAt(st.arrivedAt) }
    : null,
  warranty_start_date: isoAt(st.warrantyStart),
  warranty_end_date: isoAt(st.warrantyEnd),
  warranty_days: st.warrantyDays,
});

const techPayload = (st) => (st.status === 'RECEIVED' ? null : {
  assignment_id: 90000 + st.requestId,
  assignment_status: st.assignment,
  assigned_time: isoAt(NOW - H),
  travel_started_at: isoAt(st.travelStartedAt),
  arrived_at: isoAt(st.arrivedAt),
  check_in: st.arrivedAt ? { latitude: 21.03, longitude: 105.78 } : null,
  visit: { visit_number: 1, visit_status: st.visitStatus || 'SCHEDULED', scheduled_start: PREF, scheduled_end: isoAt(st.completedAt) },
  services: st.items,
  quotations: st.quotations,
  diagnoses: st.diagnoses,
  bill: st.bill,
  completed_at: isoAt(st.completedAt),
  request: {
    request_id: st.requestId,
    request_code: st.code,
    request_status: st.status,
    request_type: st.type,
    out_of_warranty: st.outOfWarranty,
    goods_amount: st.goods,
    product_discount_amount: st.prodDisc,
    combo_discount_amount: st.comboDisc,
    ...(st.techSeesVoucher ? { voucher_discount_amount: st.voucher } : {}),
    preferred_time: PREF,
    address_text: '25 Duy Tân, Dịch Vọng Hậu, Cầu Giấy, Hà Nội',
    contact_name: 'Nguyễn Văn Khách',
    contact_phone: CUSTOMER_PHONE,
    preferred_payment_method: st.payment,
    problem_description: 'Máy lạnh kém lạnh, chảy nước',
    timeline: st.timeline,
  },
});

const snap = (st) => {
  const cust = mapBackendCustomerRequestToOrder(customerPayload(st), CUSTOMER_PHONE);
  const job = techPayload(st);
  const tech = job ? mapBackendTechJobToOrder(job, TECH_PROFILE) : null;
  return { cust, tech };
};

const DIAG = { symptoms: 'Kém lạnh', findings: 'Đã kiểm tra thiết bị', repair_recommendation: 'Xử lý theo báo giá', recorded_at: isoAt(NOW) };
const STEP = (key) => ORDER_STEPS.findIndex((x) => x.key === key);
const TSTEP = (key) => TECH_ORDER_STEPS.findIndex((x) => x.key === key);

// Tiền khách thấy == tiền thợ thấy (orderTotal, chuỗi hiển thị, khoảng giá, tổng báo giá).
const assertSameMoney = ({ cust, tech }, msg = '') => {
  assert.equal(orderTotal(cust), orderTotal(tech), `${msg} orderTotal khách vs thợ`);
  assert.equal(formatOrderTotal(cust), formatOrderTotal(tech), `${msg} formatOrderTotal khách vs thợ`);
  assert.deepEqual(orderTotalRange(cust), orderTotalRange(tech), `${msg} orderTotalRange khách vs thợ`);
  if (cust.quote || tech.quote) {
    assert.equal(cust.quote?.total, tech.quote?.total, `${msg} quote.total khách vs thợ`);
    assert.equal(cust.quote?.extraAmount, tech.quote?.extraAmount, `${msg} quote.extraAmount khách vs thợ`);
  }
};
const assertBoth = (s, { status, total, text, range }) => {
  if (status) {
    assert.equal(s.cust.status, status, `khách: status`);
    assert.equal(s.tech.status, status, `thợ: status`);
  }
  if (total != null) {
    assert.equal(orderTotal(s.cust), total, 'khách: orderTotal');
    assert.equal(orderTotal(s.tech), total, 'thợ: orderTotal');
  }
  if (text) {
    assert.equal(formatOrderTotal(s.cust), text, 'khách: formatOrderTotal');
    assert.equal(formatOrderTotal(s.tech), text, 'thợ: formatOrderTotal');
  }
  if (range) {
    for (const [who, o] of [['khách', s.cust], ['thợ', s.tech]]) {
      const r = orderTotalRange(o);
      assert.equal(r.min, range[0], `${who}: range.min`);
      assert.equal(r.max, range[1], `${who}: range.max`);
      assert.equal(r.isRange, range[0] !== range[1] || Boolean(o.quote?.hasEstimatedRange), `${who}: isRange`);
    }
  }
};
// Timeline không được lùi.
const makeTimeline = () => {
  const c = [];
  const t = [];
  return {
    push(s) { c.push(stepIndexOf(s.cust)); if (s.tech) t.push(techStepIndexOf(s.tech)); },
    assertMonotonic() {
      for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1], `timeline khách lùi: ${c.join(' → ')}`);
      for (let i = 1; i < t.length; i++) assert.ok(t[i] >= t[i - 1], `timeline thợ lùi: ${t.join(' → ')}`);
    },
    c,
    t,
  };
};

// ===========================================================================
// KỊCH BẢN 1 — Đơn đơn giản 250.000đ, tiền mặt, không phát sinh
// ===========================================================================
describe('KB1: đơn đơn giản 250.000đ → không phát sinh → tiền mặt → done + bảo hành', () => {
  const st = newOrder({ items: [svcItem(101, 'Vệ sinh máy lạnh treo tường', 250000)], goods: 250000 });
  const tl = makeTimeline();

  test('B1 khách đặt (RECEIVED): khách "Chờ nhận việc", chợ việc của thợ thấy 250.000đ', () => {
    const s = snap(st);
    assert.equal(s.cust.status, 'pending');
    assert.equal(s.tech, null);
    assert.equal(customerStatusMeta(s.cust).label, 'Chờ nhận việc');
    assert.equal(orderTotal(s.cust), 250000);
    assert.equal(formatOrderTotal(s.cust), '250.000đ');
    assert.equal(bookedValue(s.cust), 250000);
    const open = mapBackendOpenRequestToOrder({ request_id: st.requestId, request_code: st.code, services: st.items, preferred_time: PREF, created_at: isoAt(NOW) });
    assert.equal(open.total, 250000);
    assert.equal(open.status, 'pending');
    tl.push({ cust: s.cust });
  });

  test('B2 thợ nhận (ASSIGNED): cả 2 "Thợ đã nhận", tiền 250.000đ = bill', () => {
    st.status = 'ASSIGNED';
    st.visitStatus = 'SCHEDULED';
    st.bill = billSummary({ booked: 250000, due: 250000 });
    const s = snap(st);
    assertBoth(s, { status: 'confirmed', total: 250000, text: '250.000đ' });
    assert.equal(customerStatusMeta(s.cust).label, 'Thợ đã nhận');
    assert.equal(techStatusMeta(s.tech).label, 'Thợ đã nhận');
    assert.equal(s.cust.tech.name, 'Trần Văn Thợ');
    assertSameMoney(s);
    tl.push(s);
  });

  test('B3 thợ xuất phát: cả 2 "Thợ đang đến"; merge local không làm lùi trạng thái', () => {
    st.travelStartedAt = NOW - 30 * 60000;
    const s = snap(st);
    assertBoth(s, { status: 'onway', total: 250000 });
    // Backend chưa kịp có journey (trả confirmed) nhưng máy đã ở 'onway' -> giữ 'onway'.
    const remote = { ...s.cust, status: 'confirmed' };
    const merged = mergeBackendOrdersWithLocal([s.cust], [remote]);
    assert.equal(merged[0].status, 'onway');
    tl.push(s);
  });

  test('B4 check-in (IN_PROGRESS, visit IN_PROGRESS): cả 2 "Đang kiểm tra"', () => {
    st.arrivedAt = NOW - 10 * 60000;
    st.status = 'IN_PROGRESS';
    st.visitStatus = 'IN_PROGRESS';
    const s = snap(st);
    assertBoth(s, { status: 'diagnosing', total: 250000 });
    assert.equal(customerStatusMeta(s.cust).label, techStatusMeta(s.tech).label);
    tl.push(s);
  });

  test('B5 thợ xác nhận KHÔNG phát sinh (ghi chẩn đoán, không báo giá): tiền không đổi ở 2 phía', () => {
    st.diagnoses = [DIAG];
    const s = snap(st);
    assert.equal(s.tech.status, 'repairing');
    assertSameMoney(s);
    assert.equal(orderTotal(s.cust), 250000);
    tl.push(s);
  });

  test('Regression (BUG-01): B5 không phát sinh (có chẩn đoán / needs_quotation=false) → cả thợ và khách đều ở "Đang thực hiện"', () => {
    const s = snap(st);
    assert.equal(s.tech.status, 'repairing');
    assert.equal(s.cust.status, 'repairing', `khách đang là '${s.cust.status}' (${customerStatusMeta(s.cust).label})`);
    // Trường hợp backend không gửi mảng diagnoses mà gửi needs_quotation=false trên request:
    const sFlag = mapBackendCustomerRequestToOrder({ ...customerPayload(st), diagnoses: [], needs_quotation: false }, CUSTOMER_PHONE);
    assert.equal(sFlag.status, 'repairing');
  });

  test('B6 thợ hoàn thành → PENDING_PAYMENT: cả 2 "Chờ thanh toán", thu tiền mặt 250.000đ = bill.amount_due', () => {
    st.status = 'PENDING_PAYMENT';
    st.visitStatus = 'COMPLETED';
    st.completedAt = NOW - 5 * 60000;
    st.bill = billSummary({ booked: 250000, due: 250000 });
    const s = snap(st);
    assertBoth(s, { status: 'pending_payment', total: 250000, text: '250.000đ' });
    assert.equal(customerStatusMeta(s.cust).label, 'Chờ thanh toán');
    assert.equal(techStatusMeta(s.tech).label, 'Chờ thanh toán');
    assert.equal(cashToCollect(s.tech), 250000);
    assert.equal(cashToCollect(s.cust), 250000);
    assert.equal(isPaid(s.cust), false);
    assert.equal(isPaid(s.tech), false);
    assert.equal(s.cust.report?.paid, false);
    const wi = warrantyInfo(s.cust, [s.cust]);
    assert.equal(wi.ok, false);
    assert.equal(wi.pending, true, 'bảo hành chỉ bắt đầu khi hoàn thành');
    tl.push(s);
  });

  test('B7 khách trả đủ → COMPLETED: cả 2 "Hoàn thành", isPaid, bảo hành 60 ngày bắt đầu', () => {
    st.status = 'COMPLETED';
    st.assignment = 'ENDED';
    st.bill = billSummary({ booked: 250000, due: 250000, paid: 250000 });
    st.warrantyStart = NOW - H;
    st.warrantyEnd = st.warrantyStart + 60 * DAY;
    st.warrantyDays = 60;
    const s = snap(st);
    assertBoth(s, { status: 'done', total: 250000 });
    assert.equal(isPaid(s.cust), true);
    assert.equal(isPaid(s.tech), true);
    assert.equal(s.cust.report.paid, true);
    assert.equal(s.tech.report.paid, true);
    assert.equal(cashToCollect(s.tech), 0);
    assert.equal(s.cust.doneAt, st.warrantyStart);
    assert.equal(s.cust.warrantyDays, 60);
    const wi = warrantyInfo(s.cust, [s.cust]);
    assert.equal(wi.ok, true, wi.text);
    assert.equal(wi.totalDays, 60);
    assert.ok(wi.daysLeft >= 59 && wi.daysLeft <= 60, `daysLeft=${wi.daysLeft}`);
    const elig = analyzeWarrantyEligibility({ completedAt: s.cust.warrantyStartAt, warrantyDays: 60, serverNow: NOW, warrantyEndAt: s.cust.warrantyEndAt });
    assert.equal(elig.eligible, true);
    // local đang "Chờ thanh toán" + remote "Hoàn thành" -> merge ra done, paid.
    const merged = mergeBackendOrdersWithLocal([{ ...s.cust, status: 'pending_payment', report: { paid: false } }], [s.cust]);
    assert.equal(merged[0].status, 'done');
    assert.equal(merged[0].report.paid, true);
    tl.push(s);
  });

  test('Timeline phía thợ không lùi; timeline khách không lùi (bỏ qua bug-01)', () => {
    tl.assertMonotonic();
  });
});

// ===========================================================================
// KỊCH BẢN 2 — Phát sinh vật tư kho "Dây điện + CB" 120.000đ trên dịch vụ 5.000đ
// ===========================================================================
const supplementalWarehouseFlow = (makeItem) => {
  const st = newOrder({
    items: [svcItem(102, 'Dây điện', 5000)], goods: 5000,
    status: 'DIAGNOSED_PENDING_QUOTATION', visitStatus: 'IN_PROGRESS',
    travelStartedAt: NOW - H, arrivedAt: NOW - 30 * 60000, diagnoses: [DIAG],
    bill: billSummary({ booked: 5000, due: 5000 }),
  });
  const q1 = quotation({ items: [makeItem()], total: 120000 });
  st.quotations = [q1];
  const sent = snap(st);
  st.status = 'IN_PROGRESS';
  st.quotations = [decide(q1, 'APPROVED')];
  st.bill = billSummary({ booked: 5000, supplemental: 120000, due: 125000 });
  const approved = snap(st);
  return { sent, approved };
};

describe('KB2: phát sinh vật tư kho 120.000đ (material_id 18) trên dịch vụ 5.000đ', () => {
  const variants = {
    'unit_price=120000': () => qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: 120000 }),
    'unit_price=null, total_price=120000': () => qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: null, totalPrice: 120000 }),
    'unit_price=null, line_total=120000': () => qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: null, lineTotal: 120000 }),
    'unit_price=null, không total (lấy giá catalog)': () => qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: null }),
    'unit_price="0", total_price="120000" (chuỗi)': () => qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: '0', totalPrice: '120000' }),
  };
  for (const [name, makeItem] of Object.entries(variants)) {
    test(`[${name}] SENT: cả 2 "Chờ duyệt báo giá" tổng 125.000đ; APPROVED: 125.000đ = bill.amount_due`, () => {
      const { sent, approved } = supplementalWarehouseFlow(makeItem);
      assertBoth(sent, { status: 'quoted', total: 125000, text: '125.000đ' });
      assertSameMoney(sent, 'SENT');
      assert.equal(sent.cust.quote.total, 125000);
      assert.equal(sent.cust.quote.extraAmount, 120000);
      assert.equal(sent.cust.quote.hasEstimatedRange, false);
      const part = sent.cust.quote.lines.find((l) => l.matId === 'm-db-18');
      assert.ok(part, 'có dòng vật tư kho');
      assert.equal(part.isOriginal, false, 'vật tư kho không được đánh dấu là dịch vụ đã đặt');
      assert.equal(part.type, 'part');
      assert.equal(part.price, 120000);
      const orig = sent.cust.quote.lines.filter((l) => l.isOriginal);
      assert.equal(orig.length, 1);
      assert.equal(orig[0].price, 5000);
      assert.equal(sent.cust.quote.warehouseExtra, 120000);

      assertBoth(approved, { status: 'repairing', total: 125000, text: '125.000đ' });
      assertSameMoney(approved, 'APPROVED');
      assert.equal(approved.cust.quote.approvedTotal, 125000);
      assert.equal(orderTotal(approved.cust), mapBackendBill(approved.cust.bill ? { bill: { amount_due: approved.cust.bill.amountDue } } : null).amountDue);
      assert.equal(orderTotal(approved.cust), 125000);
      assert.equal(approved.cust.materials.length, 1);
      assert.equal(approved.cust.materials[0].price, 120000);
    });
  }

  test('Tên vật tư "Dây điện + CB" chứa tên dịch vụ đã đặt "Dây điện" nhưng có material_id → không bị nhận nhầm là dịch vụ đã đặt', () => {
    const { sent } = supplementalWarehouseFlow(variants['unit_price=120000']);
    const extraLines = sent.cust.quote.lines.filter((l) => !l.isOriginal);
    assert.equal(extraLines.length, 1);
    assert.equal(extraLines[0].name, 'Dây điện + CB');
  });

  test('Regression (BUG-02): dòng phát sinh KHÔNG có material_id (item_type SERVICE) tên chứa tên dịch vụ đã đặt → không bị coi nhầm là dịch vụ đã đặt', () => {
    const { sent, approved } = supplementalWarehouseFlow(() => qItem({ type: 'SERVICE', desc: 'Dây điện + CB loại tốt (thay mới)', unit: 120000 }));
    assert.equal(approved.cust.quote.total, 125000, 'sau duyệt đúng 125.000 (lấy total_amount)');
    const line = sent.cust.quote.lines.find((l) => l.name.startsWith('Dây điện + CB'));
    assert.equal(line.isOriginal, false, 'dòng phát sinh không bị đánh dấu isOriginal=true');
    assert.equal(orderTotal(sent.cust), 125000, `khách thấy ${formatOrderTotal(sent.cust)} lúc duyệt`);
    assert.equal(orderTotal(sent.tech), 125000, `thợ thấy ${formatOrderTotal(sent.tech)}`);
  });

  test('Regression (BUG-02b): KB thực tế — đặt "Vệ sinh máy lạnh treo tường" 1 dàn, tại nhà thêm dàn thứ 2 "Vệ sinh máy lạnh treo tường (dàn 2)" 250.000đ → khách thấy 500.000đ', () => {
    const st = newOrder({
      items: [svcItem(101, 'Vệ sinh máy lạnh treo tường', 250000)], goods: 250000,
      status: 'DIAGNOSED_PENDING_QUOTATION', visitStatus: 'IN_PROGRESS', arrivedAt: NOW - H, diagnoses: [DIAG],
    });
    st.quotations = [quotation({ items: [qItem({ desc: 'Vệ sinh máy lạnh treo tường (dàn 2)', unit: 250000 })] })];
    const s = snap(st);
    assert.equal(orderTotal(s.cust), 500000, `khách thấy ${formatOrderTotal(s.cust)}`);
  });
});

// ===========================================================================
// KỊCH BẢN 3 — Vật tư mua ngoài giá dao động → chốt giá → yêu cầu chỉnh → chốt lại → duyệt
// ===========================================================================
describe('KB3: vật tư ngoài "Tụ kích" 120–180k → chốt 140k → khách yêu cầu chỉnh → chốt 130k → duyệt', () => {
  const B = 200000;
  const st = newOrder({
    items: [svcItem(103, 'Sửa máy lạnh không lạnh', B)], goods: B,
    status: 'DIAGNOSED_PENDING_QUOTATION', visitStatus: 'IN_PROGRESS',
    travelStartedAt: NOW - H, arrivedAt: NOW - 40 * 60000, diagnoses: [DIAG],
    bill: billSummary({ booked: B, due: B }),
  });
  const tl = makeTimeline();
  const estDesc = formatEstimatedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 });
  const q1 = quotation({ items: [qItem({ desc: estDesc, unit: 0, external: true })], total: 0 });
  let q2;
  let q3;

  test('Mô tả estimated/finalized parse đúng', () => {
    assert.deepEqual(parseExternalPartDesc(estDesc), { kind: 'estimated_external', cleanName: 'Tụ kích', minPrice: 120000, maxPrice: 180000 });
    const fin = parseExternalPartDesc(formatFinalizedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }));
    assert.equal(fin.kind, 'finalized_external');
    assert.equal(fin.cleanName, 'Tụ kích');
  });

  test('a) SENT báo giá dao động: cả 2 "Chờ duyệt báo giá", hiển thị khoảng 320.000đ – 380.000đ', () => {
    st.quotations = [q1];
    const s = snap(st);
    assertBoth(s, { status: 'quoted', range: [320000, 380000], text: '320.000đ – 380.000đ' });
    assertSameMoney(s);
    const est = s.cust.quote.lines.find((l) => l.isEstimatedRange);
    assert.ok(est);
    assert.equal(est.isOriginal, false);
    assert.equal(est.minPrice, 120000);
    assert.equal(est.maxPrice, 180000);
    assert.equal(s.cust.quote.isExternalFinalization, false);
    assert.equal(s.cust.externalPriceState, 'none');
    assert.equal(customerStatusMeta(s.cust).label, 'Chờ duyệt báo giá');
    tl.push(s);
  });

  test('b) khách duyệt: "Đang thực hiện", pendingExternalEstimates=[Tụ kích], state needs_final_price, vẫn hiển thị khoảng', () => {
    st.status = 'IN_PROGRESS';
    st.quotations = [decide(q1, 'APPROVED')];
    st.bill = billSummary({ booked: B, supplemental: 0, due: B });
    const s = snap(st);
    assertBoth(s, { status: 'repairing', range: [320000, 380000] });
    assertSameMoney(s);
    for (const o of [s.cust, s.tech]) {
      assert.equal(o.pendingExternalEstimates.length, 1);
      assert.equal(o.pendingExternalEstimates[0].name, 'Tụ kích');
      assert.equal(o.externalPriceState, 'needs_final_price');
    }
    assert.equal(customerStatusMeta(s.cust).label, 'Đang thực hiện');
    assert.equal(techStatusMeta(s.tech).label, 'Đang thực hiện · Chờ chốt VT');
    tl.push(s);
  });

  test('c) thợ gửi chốt giá 140k (SUPPLEMENTAL #2 SENT): quoted + isExternalFinalization, tổng 340.000đ (không cộng range cũ), timeline không lùi', () => {
    q2 = quotation({ items: [qItem({ desc: formatFinalizedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }), unit: 140000, external: true })] });
    st.quotations = [decide(q1, 'APPROVED'), q2];
    const s = snap(st);
    assertBoth(s, { status: 'quoted', total: 340000, text: '340.000đ' });
    assertSameMoney(s);
    for (const o of [s.cust, s.tech]) {
      assert.equal(o.quote.isExternalFinalization, true);
      assert.equal(o.quote.hasEstimatedRange, false);
      assert.equal(o.quote.lines.some((l) => l.isEstimatedRange), false, 'không còn dòng placeholder dự kiến');
      assert.equal(o.externalPriceState, 'awaiting_customer_approval');
    }
    assert.equal(customerStatusMeta(s.cust).label, 'Chờ xác nhận chi phí cuối');
    assert.equal(techStatusMeta(s.tech).label, 'Chờ khách xác nhận Bill');
    assert.equal(stepIndexOf(s.cust), STEP('repairing'));
    assert.equal(techStepIndexOf(s.tech), TSTEP('repairing'));
    tl.push(s);
  });

  test('d) khách yêu cầu chỉnh giá (REVISION_REQUESTED): nhãn "Đang chỉnh lại chi phí cuối" / "Cần chỉnh lại giá vật tư", state revision_requested, timeline giữ bước repairing', () => {
    st.status = 'DIAGNOSED_PENDING_QUOTATION';
    st.quotations = [decide(q1, 'APPROVED'), decide(q2, 'REVISION_REQUESTED', 'Giá cao quá')];
    const s = snap(st);
    assertBoth(s, { status: 'diagnosing' });
    assertSameMoney(s);
    assert.equal(customerStatusMeta(s.cust).label, 'Đang chỉnh lại chi phí cuối');
    assert.equal(techStatusMeta(s.tech).label, 'Cần chỉnh lại giá vật tư');
    assert.equal(s.cust.externalPriceState, 'revision_requested');
    assert.equal(s.cust.quote.revisionRequested, true);
    assert.equal(stepIndexOf(s.cust), STEP('repairing'));
    assert.equal(techStepIndexOf(s.tech), TSTEP('repairing'));
    tl.push(s);
  });

  test('Regression (BUG-03): d) trong lúc chờ chỉnh giá, vẫn giữ khoảng dự kiến đã duyệt 320.000đ – 380.000đ (không tụt về 200.000đ)', () => {
    const s = snap(st);
    const r = orderTotalRange(s.cust);
    assert.ok(r.min >= 320000, `khách thấy ${formatOrderTotal(s.cust)} (mong đợi khoảng 320.000đ – 380.000đ hoặc 340.000đ)`);
  });

  test('e) thợ gửi lại 130k (SUPPLEMENTAL #3 SENT): quoted, tổng 330.000đ, không lẫn dòng 140k cũ', () => {
    q3 = quotation({ items: [qItem({ desc: formatFinalizedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }), unit: 130000, external: true })] });
    st.status = 'DIAGNOSED_PENDING_QUOTATION';
    st.quotations = [decide(q1, 'APPROVED'), decide(q2, 'REVISION_REQUESTED', 'Giá cao quá'), q3];
    const s = snap(st);
    assertBoth(s, { status: 'quoted', total: 330000, text: '330.000đ' });
    assertSameMoney(s);
    assert.equal(s.cust.quote.lines.some((l) => l.price === 140000), false);
    assert.equal(s.cust.externalPriceState, 'awaiting_customer_approval');
    assert.equal(stepIndexOf(s.cust), STEP('repairing'));
    tl.push(s);
  });

  test('f) khách duyệt: finalized, tổng 330.000đ = bill.amount_due, nhãn "Chờ bàn giao thiết bị" / "Chờ ký bàn giao & Mở TT"', () => {
    st.status = 'IN_PROGRESS';
    st.quotations = [decide(q1, 'APPROVED'), decide(q2, 'REVISION_REQUESTED', 'Giá cao quá'), decide(q3, 'APPROVED')];
    st.bill = billSummary({ booked: B, supplemental: 130000, due: 330000 });
    const s = snap(st);
    assertBoth(s, { status: 'repairing', total: 330000, text: '330.000đ' });
    assertSameMoney(s);
    assert.equal(orderTotal(s.cust), s.cust.bill.amountDue);
    for (const o of [s.cust, s.tech]) {
      assert.equal(o.externalPriceState, 'finalized');
      assert.equal(o.pendingExternalEstimates.length, 0);
      assert.equal(o.finalizedExternalParts.length, 1);
      assert.equal(o.finalizedExternalParts[0].actualPrice, 130000);
      assert.equal(o.quote.lines.some((l) => l.isEstimatedRange), false);
      assert.equal(o.quote.lines.filter((l) => !l.isOriginal).reduce((x, l) => x + (l.actualPrice ?? l.price) * l.qty, 0), 130000);
    }
    assert.equal(customerStatusMeta(s.cust).label, 'Chờ bàn giao thiết bị');
    assert.equal(techStatusMeta(s.tech).label, 'Chờ ký bàn giao & Mở TT');
    tl.push(s);
  });

  test('g) hoàn thành → chờ thanh toán 330.000đ → trả đủ → done', () => {
    st.status = 'PENDING_PAYMENT';
    st.visitStatus = 'COMPLETED';
    st.completedAt = NOW;
    const s = snap(st);
    assertBoth(s, { status: 'pending_payment', total: 330000 });
    assert.equal(cashToCollect(s.tech), 330000);
    tl.push(s);
    st.status = 'COMPLETED';
    st.assignment = 'ENDED';
    st.bill = billSummary({ booked: B, supplemental: 130000, due: 330000, paid: 330000 });
    const s2 = snap(st);
    assertBoth(s2, { status: 'done', total: 330000 });
    tl.push(s2);
  });

  test('Timeline khách & thợ không lùi trong toàn bộ luồng chốt giá', () => {
    tl.assertMonotonic();
  });
});

// ===========================================================================
// KỊCH BẢN 4 — Kết hợp: dịch vụ + vật tư kho + phí công + VT ngoài dao động + VT ngoài chốt thẳng
// ===========================================================================
describe('KB4: kết hợp dịch vụ 300k + kho 120k + phí công 100k + VT ngoài 120–180k + VT ngoài chốt thẳng 90k', () => {
  const st = newOrder({
    items: [svcItem(104, 'Lắp đặt máy lạnh', 300000)], goods: 300000,
    status: 'DIAGNOSED_PENDING_QUOTATION', visitStatus: 'IN_PROGRESS', arrivedAt: NOW - H, diagnoses: [DIAG],
    bill: billSummary({ booked: 300000, due: 300000 }),
  });
  const q1 = quotation({
    items: [
      qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: 120000 }),
      qItem({ type: 'SERVICE', desc: 'Phí công đi dây âm tường', unit: 100000 }),
      qItem({ desc: formatEstimatedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }), unit: 0, external: true }),
      qItem({ desc: formatFinalizedExternalDesc({ name: 'Rơ le ngoài', minPrice: null, maxPrice: null }), unit: 90000, external: true }),
    ],
  });
  let q2;

  test('a) SENT: tổng khoảng 730.000đ – 790.000đ ở cả 2 phía, đủ 5 dòng, phân loại dòng đúng', () => {
    assert.equal(q1.total_amount, 310000);
    st.quotations = [q1];
    const s = snap(st);
    assertBoth(s, { status: 'quoted', range: [730000, 790000], text: '730.000đ – 790.000đ' });
    assertSameMoney(s);
    const L = s.cust.quote.lines;
    assert.equal(L.length, 5);
    assert.equal(L.filter((l) => l.isOriginal).length, 1);
    assert.equal(L.find((l) => l.matId === 'm-db-18').isCustom, false);
    assert.equal(L.find((l) => l.name === 'Phí công đi dây âm tường').price, 100000);
    assert.equal(L.find((l) => l.name === 'Rơ le ngoài').isFinalizedExternal, true);
    assert.equal(L.find((l) => l.name === 'Rơ le ngoài').minPrice, null);
    assert.equal(L.find((l) => l.name === 'Tụ kích').isEstimatedRange, true);
    assert.equal(s.cust.quote.warehouseExtra, 120000);
  });

  test('Regression (BUG-04): a) báo giá ĐẦU TIÊN có cả dòng chốt giá và dòng dự kiến → giữ trạng thái "Chờ duyệt báo giá" & bước quoted', () => {
    const s = snap(st);
    assert.equal(s.cust.quote.isExternalFinalization, false, 'báo giá đầu còn dòng dự kiến chưa chốt');
    assert.equal(customerStatusMeta(s.cust).label, 'Chờ duyệt báo giá', `khách thấy "${customerStatusMeta(s.cust).label}"`);
    assert.equal(techStatusMeta(s.tech).label, 'Chờ duyệt báo giá', `thợ thấy "${techStatusMeta(s.tech).label}"`);
    assert.equal(stepIndexOf(s.cust), STEP('quoted'));
    assert.notEqual(s.cust.externalPriceState, 'awaiting_customer_approval');
  });

  test('b) APPROVED: repairing, khoảng 730–790k, bill 610.000đ (VT dự kiến tính 0), Tụ kích chờ chốt', () => {
    st.status = 'IN_PROGRESS';
    st.quotations = [decide(q1, 'APPROVED')];
    st.bill = billSummary({ booked: 300000, supplemental: 310000, due: 610000 });
    const s = snap(st);
    assertBoth(s, { status: 'repairing', range: [730000, 790000] });
    assertSameMoney(s);
    assert.equal(s.cust.quote.approvedTotal, 610000);
    assert.equal(s.cust.externalPriceState, 'needs_final_price');
    assert.deepEqual(s.cust.pendingExternalEstimates.map((x) => x.name), ['Tụ kích']);
    assert.deepEqual(s.cust.finalizedExternalParts.map((x) => x.name), ['Rơ le ngoài']);
  });

  test('c) chốt Tụ kích 150k (SENT): tổng 760.000đ, không double-count, không còn placeholder', () => {
    q2 = quotation({ items: [qItem({ desc: formatFinalizedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }), unit: 150000, external: true })] });
    st.quotations = [decide(q1, 'APPROVED'), q2];
    const s = snap(st);
    assertBoth(s, { status: 'quoted', total: 760000, text: '760.000đ' });
    assertSameMoney(s);
    const L = s.cust.quote.lines;
    assert.equal(L.some((l) => l.isEstimatedRange), false);
    assert.deepEqual(L.map((l) => l.name).sort(), ['Dây điện + CB', 'Lắp đặt máy lạnh', 'Phí công đi dây âm tường', 'Rơ le ngoài', 'Tụ kích'].sort());
    const recomputed = computeQuoteRangeTotals(L, { bookedBase: 300000, priorApprovedExtra: 0, isOnSite: true });
    assert.equal(recomputed.totalMin, 760000);
    assert.equal(customerStatusMeta(s.cust).label, 'Chờ xác nhận chi phí cuối');
  });

  test('d) APPROVED: 760.000đ = bill.amount_due, finalized', () => {
    st.status = 'IN_PROGRESS';
    st.quotations = [decide(q1, 'APPROVED'), decide(q2, 'APPROVED')];
    st.bill = billSummary({ booked: 300000, supplemental: 460000, due: 760000 });
    const s = snap(st);
    assertBoth(s, { status: 'repairing', total: 760000, text: '760.000đ' });
    assertSameMoney(s);
    assert.equal(orderTotal(s.cust), s.cust.bill.amountDue);
    assert.equal(s.cust.externalPriceState, 'finalized');
    assert.equal(s.cust.pendingExternalEstimates.length, 0);
    // Vật tư hiển thị: kho 120k + Rơ le 90k + Tụ kích 150k
    assert.equal(s.cust.materials.reduce((x, m) => x + m.price * m.qty, 0), 360000);
  });
});

// ===========================================================================
// KỊCH BẢN 5 — Báo giá trước khi xuất phát (INITIAL) có giảm giá sản phẩm/combo + voucher
// ===========================================================================
describe('KB5: INITIAL trước khi đi, goods 500k − giảm SP 50k − combo 30k, voucher 20k; + vật tư 120k', () => {
  const base = () => newOrder({
    items: [svcItem(101, 'Vệ sinh máy lạnh treo tường', 250000, 2)], goods: 500000,
    prodDisc: 50000, comboDisc: 30000, voucher: 20000,
    status: 'ASSIGNED', visitStatus: 'SCHEDULED',
  });
  const mkInitial = () => quotation({
    type: 'INITIAL',
    items: [
      qItem({ desc: 'Vệ sinh máy lạnh treo tường', unit: 250000, qty: 2, extra: { request_service_id: 1010, service_id: 101 } }),
      qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: 120000 }),
    ],
  });
  const q = mkInitial();
  const billBefore = billSummary({ booked: 420000, voucher: 20000, due: 400000, prodDisc: 50000, comboDisc: 30000 });

  test('SENT (ASSIGNED): cả 2 "Chờ duyệt báo giá"; quote.total = 620k − 80k = 540k (trừ giảm giá đúng 1 lần); khách trả 520k', () => {
    const st = base();
    st.quotations = [q];
    st.bill = billBefore;
    const s = snap(st);
    assertBoth(s, { status: 'quoted', total: 520000, text: '520.000đ' });
    assertSameMoney(s);
    assert.equal(bookedValue(s.cust), 420000);
    assert.equal(s.cust.quote.total, 540000);
    assert.equal(s.cust.quote.totalMin, 540000, 'computeQuoteRangeTotals (trước khi đi) không trừ giảm giá 2 lần');
    const L = s.cust.quote.lines;
    assert.equal(L.find((l) => l.matId === 'm-db-18').isOriginal, false);
    assert.equal(L.find((l) => l.name === 'Vệ sinh máy lạnh treo tường').isOriginal, true);
    assert.equal(stepIndexOf(s.cust), STEP('quoted'));
    assert.equal(techStepIndexOf(s.tech), TSTEP('diagnosing'));
  });

  test('APPROVED (vẫn ASSIGNED): "Thợ đã nhận", tiền = bill.amount_due 520k ở cả 2 phía; approvedTotal 540k', () => {
    const st = base();
    st.quotations = [decide(q, 'APPROVED')];
    st.bill = billSummary({ booked: 420000, quotationTotal: 620000, voucher: 20000, due: 520000, prodDisc: 50000, comboDisc: 30000 });
    const s = snap(st);
    assertBoth(s, { status: 'confirmed', total: 520000, text: '520.000đ' });
    assertSameMoney(s);
    assert.equal(s.cust.quote.approvedTotal, 540000);
    // Thợ mở lại draft trước khi đi: dịch vụ đã đặt giữ isOriginal, vật tư không bị nhân đôi
    const d = draftFromOrder(s.tech);
    assert.equal(d.lines.length, 2);
    assert.equal(d.lines.filter((l) => l.isOriginal).length, 1);
  });

  test('Tại nhà thêm phát sinh Gas R32 250k sau INITIAL đã duyệt: SENT 770k → APPROVED 770k = bill', () => {
    const st = base();
    st.status = 'DIAGNOSED_PENDING_QUOTATION';
    st.visitStatus = 'IN_PROGRESS';
    st.arrivedAt = NOW - H;
    st.diagnoses = [DIAG];
    st.bill = billSummary({ booked: 420000, quotationTotal: 620000, voucher: 20000, due: 520000, prodDisc: 50000, comboDisc: 30000 });
    const qs = quotation({ items: [qItem({ type: 'MATERIAL', materialId: 1, desc: 'Gas R32', unit: 250000 })] });
    st.quotations = [decide(q, 'APPROVED'), qs];
    const s = snap(st);
    assertBoth(s, { status: 'quoted', total: 770000, text: '770.000đ' });
    assertSameMoney(s);
    assert.equal(s.cust.quote.total, 790000);
    assert.equal(s.cust.quote.lines.filter((l) => l.matId === 'm-db-18').length, 1, 'vật tư đợt 1 hiện đúng 1 lần');
    st.status = 'IN_PROGRESS';
    st.quotations = [decide(q, 'APPROVED'), decide(qs, 'APPROVED')];
    st.bill = billSummary({ booked: 420000, quotationTotal: 620000, supplemental: 250000, voucher: 20000, due: 770000, prodDisc: 50000, comboDisc: 30000 });
    const s2 = snap(st);
    assertBoth(s2, { status: 'repairing', total: 770000 });
    assert.equal(s2.cust.quote.approvedTotal, 790000);
  });

  test('Regression (BUG-05): thợ chưa có bill (job.bill null) vẫn trừ voucher khớp với khách (520.000đ)', () => {
    const st = base();
    st.quotations = [q];
    st.techSeesVoucher = true; // dù request có voucher_discount_amount
    const s = snap(st);
    assert.equal(orderTotal(s.cust), 520000);
    assert.equal(orderTotal(s.tech), 520000, `thợ thấy ${formatOrderTotal(s.tech)}`);
  });
});

// ===========================================================================
// KỊCH BẢN 6 — Từ chối báo giá / huỷ đơn có phí kiểm tra
// ===========================================================================
describe('KB6: từ chối báo giá / huỷ đơn', () => {
  test('6a) từ chối báo giá INITIAL trước khi đi → huỷ miễn phí: cả 2 "Đã huỷ", 0đ', () => {
    const st = newOrder({ items: [svcItem(101, 'Vệ sinh máy lạnh treo tường', 250000)], goods: 250000, visitStatus: 'SCHEDULED' });
    const q = quotation({ type: 'INITIAL', items: [qItem({ desc: 'Vệ sinh máy lạnh treo tường', unit: 250000, extra: { request_service_id: 1010 } }), qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: 120000 })] });
    st.status = 'CANCELLED_BY_CUSTOMER';
    st.assignment = 'CANCELLED';
    st.quotations = [decide(q, 'REJECTED')];
    st.timeline = [{ new_status: 'CANCELLED_BY_CUSTOMER', reason: 'Khách từ chối báo giá', changed_at: isoAt(NOW) }];
    const s = snap(st);
    assertBoth(s, { status: 'cancelled', total: 0, text: '0đ' });
    assert.equal(s.cust.inspectionFee, 0);
    assert.equal(customerStatusMeta(s.cust).label, 'Đã huỷ');
    assert.equal(techStatusMeta(s.tech).label, 'Đã huỷ');
    assert.equal(warrantyInfo(s.cust, [s.cust]).ok, false);
  });

  test('6b) tại nhà từ chối báo giá & huỷ → phí kiểm tra 100.000đ = bill.amount_due ở cả 2 phía', () => {
    const st = newOrder({
      items: [svcItem(103, 'Sửa máy lạnh không lạnh', 200000)], goods: 200000,
      visitStatus: 'IN_PROGRESS', arrivedAt: NOW - H, diagnoses: [DIAG],
    });
    const q = quotation({ items: [qItem({ type: 'MATERIAL', materialId: 1, desc: 'Gas R32', unit: 250000 })] });
    st.status = 'CANCELLED_BY_CUSTOMER';
    st.assignment = 'ENDED';
    st.quotations = [decide(q, 'REJECTED')];
    st.timeline = [{ new_status: 'CANCELLED_BY_CUSTOMER', reason: 'Khách từ chối báo giá tại nhà', changed_at: isoAt(NOW) }];
    st.bill = billSummary({ booked: 200000, due: 100000 });
    const s = snap(st);
    assertBoth(s, { status: 'cancelled', total: 100000, text: '100.000đ' });
    assert.equal(s.cust.inspectionFee, 100000);
    assert.equal(s.tech.inspectionFee, 100000);
    assert.equal(cashToCollect(s.tech), 100000);
    assert.equal(s.cust.cancelReason, 'Khách từ chối báo giá tại nhà');
  });

  test('6c) tại nhà từ chối phát sinh nhưng vẫn làm dịch vụ đã đặt: tiền = giá đặt 200.000đ ở 2 phía', () => {
    const st = newOrder({
      items: [svcItem(103, 'Sửa máy lạnh không lạnh', 200000)], goods: 200000,
      status: 'IN_PROGRESS', visitStatus: 'IN_PROGRESS', arrivedAt: NOW - H, diagnoses: [DIAG],
      bill: billSummary({ booked: 200000, due: 200000 }),
    });
    st.quotations = [decide(quotation({ items: [qItem({ type: 'MATERIAL', materialId: 1, desc: 'Gas R32', unit: 250000 })] }), 'REJECTED')];
    const s = snap(st);
    assertBoth(s, { total: 200000, text: '200.000đ' });
    assert.equal(s.tech.status, 'repairing');
  });

  const approvedThenSecond = (secondStatus, withBill) => {
    const st = newOrder({
      items: [svcItem(102, 'Dây điện', 5000)], goods: 5000,
      status: 'IN_PROGRESS', visitStatus: 'IN_PROGRESS', arrivedAt: NOW - H, diagnoses: [DIAG],
      bill: withBill ? billSummary({ booked: 5000, supplemental: 120000, due: 125000 }) : null,
    });
    const q1 = decide(quotation({ items: [qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: 120000 })] }), 'APPROVED');
    const before = snap({ ...st, quotations: [q1] });
    const q2 = decide(quotation({ items: [qItem({ type: 'MATERIAL', materialId: 1, desc: 'Gas R32', unit: 250000 })] }), secondStatus, 'Không đồng ý');
    st.status = secondStatus === 'REVISION_REQUESTED' ? 'DIAGNOSED_PENDING_QUOTATION' : 'IN_PROGRESS';
    st.quotations = [q1, q2];
    return { before, after: snap(st) };
  };

  test('6d) đợt 1 đã duyệt (125k), đợt 2 bị TỪ CHỐI, có bill: tiền vẫn 125.000đ ở 2 phía', () => {
    const { before, after } = approvedThenSecond('REJECTED', true);
    assertBoth(before, { status: 'repairing', total: 125000 });
    assertBoth(after, { total: 125000 });
    assert.equal(after.tech.status, 'repairing');
  });

  test('Regression (BUG-06): đợt 1 đã duyệt, đợt 2 bị TỪ CHỐI → cả khách và thợ giữ trạng thái "Đang thực hiện" (timeline không lùi)', () => {
    const { before, after } = approvedThenSecond('REJECTED', true);
    assert.equal(after.cust.status, 'repairing', `khách: ${after.cust.status}`);
    assert.ok(stepIndexOf(after.cust) >= stepIndexOf(before.cust), 'timeline khách lùi');
  });

  test('Regression (BUG-07): đợt 1 đã duyệt, đợt 2 bị TỪ CHỐI / YÊU CẦU SỬA, chưa có bill → giữ đủ 125.000đ ở cả 2 phía', () => {
    for (const st2 of ['REJECTED', 'REVISION_REQUESTED']) {
      const { after } = approvedThenSecond(st2, false);
      assert.equal(orderTotal(after.cust), 125000, `[${st2}] khách thấy ${formatOrderTotal(after.cust)}`);
      assert.equal(orderTotal(after.tech), 125000, `[${st2}] thợ thấy ${formatOrderTotal(after.tech)}`);
    }
  });

  test('Regression (BUG-08): đợt 1 đã duyệt, đợt 2 (không phải chốt giá) bị YÊU CẦU SỬA → timeline khách không lùi từ "Đang thực hiện"', () => {
    const { before, after } = approvedThenSecond('REVISION_REQUESTED', true);
    assert.ok(stepIndexOf(after.cust) >= stepIndexOf(before.cust), `khách: ${before.cust.status} → ${after.cust.status}`);
  });
});

// ===========================================================================
// KỊCH BẢN 7 — Đơn bảo hành
// ===========================================================================
describe('KB7: đơn bảo hành (request_type WARRANTY) → 0đ, không hiện tiền', () => {
  const st = newOrder({
    type: 'WARRANTY', items: [svcItem(101, 'Vệ sinh máy lạnh treo tường', 250000)], goods: null,
    status: 'WARRANTY_PENDING',
  });
  const steps = [
    ['WARRANTY_PENDING', null, 'warranty_pending'],
    ['ASSIGNED', 'SCHEDULED', 'confirmed'],
    ['IN_PROGRESS', 'IN_PROGRESS', null],
    ['PENDING_PAYMENT', 'COMPLETED', 'done'],
  ];
  for (const [rs, vs, expected] of steps) {
    test(`${rs}: kind=warranty, orderTotal 0đ ở cả 2 phía${expected ? `, status ${expected}` : ''}`, () => {
      st.status = rs;
      st.visitStatus = vs;
      if (rs === 'IN_PROGRESS') { st.arrivedAt = NOW - H; st.diagnoses = [DIAG]; }
      if (rs === 'PENDING_PAYMENT') { st.completedAt = NOW; st.bill = billSummary({ booked: 0, due: 0 }); }
      const s = snap(st);
      assert.equal(s.cust.kind, 'warranty');
      assert.equal(orderTotal(s.cust), 0);
      assert.equal(formatOrderTotal(s.cust), '0đ');
      assert.equal(warrantyInfo(s.cust, [s.cust]).text, 'Đây là đơn bảo hành.');
      if (expected) assert.equal(s.cust.status, expected);
      if (s.tech) {
        assert.equal(s.tech.kind, 'warranty');
        assert.equal(orderTotal(s.tech), 0);
        assert.equal(formatOrderTotal(s.tech), '0đ');
        if (expected && rs !== 'WARRANTY_PENDING') assert.equal(s.tech.status, expected);
        const d = draftFromOrder(s.tech);
        assert.ok(d.lines.filter((l) => l.isOriginal).every((l) => l.price === 0), 'draft bảo hành giá 0');
      }
    });
  }

  test('Regression (Audit A3): đơn bảo hành chuẩn hoá goods = 0, total = 0, orderTotal() = 0 ở cả 2 phía', () => {
    st.status = 'ASSIGNED';
    st.bill = null;
    const s = snap(st);
    assert.equal(orderTotal(s.cust), 0);
    assert.equal(s.cust.goods, 0);
    assert.equal(s.cust.total, 0);
    assert.equal(s.tech.goods, 0);
    assert.equal(s.tech.total, 0);
  });

  test('Ngoài bảo hành (out_of_warranty=true): tính tiền như đơn thường', () => {
    const st2 = newOrder({ type: 'WARRANTY', outOfWarranty: true, items: [svcItem(101, 'Vệ sinh máy lạnh treo tường', 250000)], goods: 250000, status: 'OUT_OF_WARRANTY', visitStatus: 'IN_PROGRESS' });
    const s = snap(st2);
    assert.equal(s.cust.kind, 'normal');
    assert.equal(s.cust.status, 'out_of_warranty');
    assert.equal(orderTotal(s.cust), 250000);
  });
});

// ===========================================================================
// KỊCH BẢN 8 — Thợ mở lại draft báo giá khi đợt 1 đã duyệt, đang sửa đợt 2
// ===========================================================================
describe('KB8: draftFromOrder không nạp lại dòng đợt 1 đã duyệt', () => {
  const mk = () => newOrder({
    items: [svcItem(102, 'Dây điện', 5000)], goods: 5000,
    status: 'IN_PROGRESS', visitStatus: 'IN_PROGRESS', travelStartedAt: NOW - 2 * H, arrivedAt: NOW - H, diagnoses: [DIAG],
  });
  const q1 = decide(quotation({ items: [qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: 120000 })] }), 'APPROVED');
  const q2 = quotation({ items: [qItem({ type: 'MATERIAL', materialId: 1, desc: 'Gas R32', unit: 250000 })] });
  const extraSum = (d) => d.lines.filter((l) => !l.isOriginal).reduce((x, l) => x + l.price * l.qty, 0);

  test('Đợt 1 APPROVED, thợ bấm "Thêm phát sinh": draft chỉ có dịch vụ đã đặt (không có vật tư đợt 1)', () => {
    const st = mk();
    st.quotations = [q1];
    const { tech } = snap(st);
    assert.equal(tech.status, 'repairing');
    const d = draftFromOrder(tech);
    assert.equal(d.lines.length, 1);
    assert.equal(d.lines[0].isOriginal, true);
    assert.equal(extraSum(d), 0);
  });

  for (const st2 of ['SENT', 'REVISION_REQUESTED']) {
    test(`Đợt 2 ${st2}, thợ sửa lại: draft = dịch vụ đã đặt + chỉ dòng đợt 2 (250k), không có 120k của đợt 1`, () => {
      const st = mk();
      st.status = st2 === 'SENT' ? 'DIAGNOSED_PENDING_QUOTATION' : 'DIAGNOSED_PENDING_QUOTATION';
      st.quotations = [q1, st2 === 'SENT' ? q2 : decide(q2, st2, 'Giảm giá giúp')];
      const { tech, cust } = snap(st);
      assert.ok(tech.quote.lines.some((l) => l.matId === 'm-db-18' && l.isPriorApproved), 'quote hiển thị có gộp đợt 1');
      const d = draftFromOrder(tech);
      assert.equal(d.lines.some((l) => l.matId === 'm-db-18'), false, 'draft không được chứa vật tư đợt 1');
      assert.equal(d.lines.filter((l) => l.isOriginal).length, 1);
      assert.equal(extraSum(d), 250000);
      if (st2 === 'SENT') assert.equal(orderTotal(cust), 375000);
    });
  }

  test('Đợt 2 là chốt giá VT ngoài bị yêu cầu sửa: draft chỉ có dòng chốt giá, không có dòng dự kiến / đợt 1', () => {
    const st = mk();
    const qe = decide(quotation({ items: [qItem({ desc: formatEstimatedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }), unit: 0, external: true })], total: 0 }), 'APPROVED');
    const qf = decide(quotation({ items: [qItem({ desc: formatFinalizedExternalDesc({ name: 'Tụ kích', minPrice: 120000, maxPrice: 180000 }), unit: 140000, external: true })] }), 'REVISION_REQUESTED');
    st.status = 'DIAGNOSED_PENDING_QUOTATION';
    st.quotations = [q1, qe, qf];
    const { tech } = snap(st);
    const d = draftFromOrder(tech);
    const extra = d.lines.filter((l) => !l.isOriginal);
    assert.equal(extra.length, 1);
    assert.equal(extra[0].isFinalizedExternal, true);
    assert.equal(extra[0].price, 140000);
  });

  test('mergeBackendOrdersWithLocal giữ bản đang sửa (quoteEditing) tới khi server có báo giá mới', () => {
    const st = mk();
    st.quotations = [q1];
    const { tech } = snap(st);
    const local = { ...tech, quoteEditing: true, quoteEditingFrom: tech.quote.dbQuotationId, quote: { ...tech.quote, lines: [] } };
    const m1 = mergeBackendOrdersWithLocal([local], [tech]);
    assert.equal(m1[0].quoteEditing, true);
    assert.equal(m1[0].quote.lines.length, 0);
    st.status = 'DIAGNOSED_PENDING_QUOTATION';
    st.quotations = [q1, q2];
    const fresh = snap(st).tech;
    const m2 = mergeBackendOrdersWithLocal([local], [fresh]);
    assert.equal(m2[0].quoteEditing, false);
    assert.equal(m2[0].status, 'quoted');
  });
});

// ===========================================================================
// Kiểm tra bổ sung trạng thái backend
// ===========================================================================
describe('Bổ sung: ánh xạ trạng thái', () => {
  test('mapBackendStatusToAppStatus cơ bản', () => {
    assert.equal(mapBackendStatusToAppStatus('RECEIVED'), 'pending');
    assert.equal(mapBackendStatusToAppStatus('ASSIGNED', 'IN_PROGRESS'), 'diagnosing');
    assert.equal(mapBackendStatusToAppStatus('IN_PROGRESS', null, true, false), 'repairing');
    assert.equal(mapBackendStatusToAppStatus('IN_PROGRESS', null, true, true), 'quoted');
    assert.equal(mapBackendStatusToAppStatus('PARTIALLY_PAID_RECEIVABLE'), 'pending_payment');
    assert.equal(mapBackendStatusToAppStatus('SOMETHING_NEW'), 'confirmed');
  });

  test('Regression (BUG-09): READY_FOR_REPAIR mà đang có báo giá phát sinh SENT → chuyển "Chờ duyệt báo giá" để khách thấy bước duyệt', () => {
    assert.equal(mapBackendStatusToAppStatus('READY_FOR_REPAIR', 'IN_PROGRESS', true, true), 'quoted');
  });

  test('extractExternalPartLifecycle: báo giá chưa duyệt không tạo pending estimate', () => {
    const lc = extractExternalPartLifecycle([quotation({ items: [qItem({ desc: formatEstimatedExternalDesc({ name: 'X', minPrice: 1, maxPrice: 2 }), unit: 0 })] })]);
    assert.equal(lc.pendingExternalEstimates.length, 0);
    assert.equal(lc.externalPriceState, 'none');
  });

  test('mapBackendQuotationToAppQuote trực tiếp: SUPPLEMENTAL SENT không có dòng gốc thì tự chèn dịch vụ đã đặt', () => {
    const q = quotation({ items: [qItem({ type: 'MATERIAL', materialId: 18, desc: 'Dây điện + CB', unit: 120000 })] });
    const r = mapBackendQuotationToAppQuote([q], [], 5000, '', 0, [{ id: 's102', name: 'Dây điện', qty: 1, price: 5000 }]);
    assert.equal(r.lines.length, 2);
    assert.equal(r.total, 125000);
    assert.equal(MATERIALS.find((m) => m.dbId === 18).price, 120000);
  });
});
