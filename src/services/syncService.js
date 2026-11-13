import {
  getService,
  TECH_ME,
  MATERIALS,
  resolveServiceSlugFromBackend,
  resolveDbMaterialId,
  ensureServiceFromOrderItem,
} from '../constants/data';

// Tên hiển thị khi đơn đã có thợ nhưng chưa tải được thông tin thợ (GET /customer/requests/:id/tracking).
const ASSIGNED_TECH_PLACEHOLDER = 'Thợ được phân công';
// Phương thức thanh toán khách chọn khi đặt (service_request.preferred_payment_method) -> nhãn trên app.
const PAYMENT_LABELS = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản VietQR',
  CARD_ATM: 'Thẻ ATM',
  VNPAY: 'VNPAY',
  CARD_INTERNATIONAL: 'Thẻ quốc tế',
  GOOGLE_PAY: 'Google Pay',
  APPLE_PAY: 'Apple Pay',
  PAYOS: 'PayOS',
};
export const paymentLabelOf = (method) => PAYMENT_LABELS[String(method || '').toUpperCase()] || 'Tiền mặt';
const materialPriceOf = (materialId) => MATERIALS.find((m) => m.dbId === Number(materialId))?.price ?? 0;
const ts = (iso) => (iso ? new Date(iso).getTime() : Date.now());

const pad = (n) => String(n).padStart(2, '0');

export const formatDateLabelFromIso = (isoStr) => {
  const d = isoStr ? new Date(isoStr) : new Date();
  if (Number.isNaN(d.getTime())) return 'Hôm nay';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const formatDateKeyFromIso = (isoStr) => {
  const d = isoStr ? new Date(isoStr) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatSlotFromIso = (isoStr) => {
  const d = isoStr ? new Date(isoStr) : null;
  if (!d || Number.isNaN(d.getTime())) return '08h00 - 10h00';
  const h = d.getHours();
  if (h < 10) return '08h00 - 10h00';
  if (h < 12) return '10h00 - 12h00';
  if (h < 14) return '12h00 - 14h00';
  if (h < 16) return '14h00 - 16h00';
  if (h < 18) return '16h00 - 18h00';
  return '18h00 - 20h00';
};

export const buildPreferredTimeIso = (dateKey, slot) => {
  try {
    const baseDate = dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? dateKey
      : formatDateKeyFromIso(new Date().toISOString());
    const m = /(\d{1,2})h/.exec(slot || '');
    const hour = m ? pad(Math.min(23, Math.max(0, Number(m[1])))) : '09';
    return new Date(`${baseDate}T${hour}:00:00+07:00`).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
};

export const extractAreaFromAddress = (addressText = '') => {
  const full = String(addressText || '').trim();
  if (!full) return 'Hà Nội';
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(', ');
  return parts[0] || 'Hà Nội';
};

export const mapBackendAddressToApp = (row) => {
  if (!row) return null;
  const full = String(row.address_text || '').trim();
  return {
    id: `addr-db-${row.address_id}`,
    dbAddressId: Number(row.address_id) || row.address_id,
    name: row.contact_name || 'Khách hàng',
    phone: row.contact_phone || '',
    area: row.ward_name || extractAreaFromAddress(full),
    wardCode: row.ward_code ?? null,
    wardName: row.ward_name ?? null,
    full,
    isDefault: Boolean(row.is_default),
  };
};

export const mapBackendStatusToAppStatus = (requestStatus, visitStatus, hasApprovedQuote = false, hasPendingQuote = false) => {
  const st = String(requestStatus || '').toUpperCase();
  const vs = String(visitStatus || '').toUpperCase();
  if (st === 'RECEIVED') return 'pending';
  if (st === 'ASSIGNED') {
    if (hasPendingQuote) return 'quoted';
    if (vs === 'IN_PROGRESS') return 'diagnosing';
    return 'confirmed';
  }
  if (st === 'IN_PROGRESS') {
    if (hasPendingQuote) return 'quoted';
    if (hasApprovedQuote) return 'repairing';
    return 'diagnosing';
  }
  if (st === 'DIAGNOSED_PENDING_QUOTATION') return 'quoted';
  if (st === 'READY_FOR_REPAIR') return 'repairing';
  if (st === 'PENDING_PAYMENT') return 'pending_payment';
  if (st === 'PARTIALLY_PAID_RECEIVABLE') return 'partially_paid';
  if (st === 'PENDING_REVIEW') return 'pending_payment'; // trạng thái cũ vẫn thuộc nhóm chờ thanh toán ở BE
  if (st === 'READY_FOR_ACCEPTANCE') return 'pending_review';
  if (st === 'COMPLETED') {
    return 'done';
  }
  if (['WARRANTY_PENDING', 'UNDER_WARRANTY'].includes(st)) {
    return 'warranty_pending';
  }
  if (st === 'OUT_OF_WARRANTY') {
    return 'out_of_warranty';
  }
  if (st.startsWith('CANCELLED')) return 'cancelled';
  return 'pending';
};

export const mapBackendItemsToAppItems = (rawItems = []) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  return rawItems.map((it) => {
    const slug = resolveServiceSlugFromBackend(it.service_id, it.service_name || it.service_name_snapshot);
    const svc = getService(slug) || ensureServiceFromOrderItem(it);
    const price = Number(it.selected_price) || svc?.price || 0;
    return {
      id: slug,
      dbRequestServiceId: it.request_service_id || null,
      dbServiceId: it.service_id || svc?.dbId || null,
      name: it.service_name || it.service_name_snapshot || svc?.name || 'Dịch vụ',
      qty: Math.max(1, Number(it.quantity) || 1),
      price,
    };
  });
};

export const mapBackendQuotationToAppQuote = (quotations = [], diagnoses = [], goodsTotal = 0, problemDesc = '') => {
  if (!Array.isArray(quotations) || quotations.length === 0) return null;
  const latestQuote = quotations[quotations.length - 1];
  const latestDiag = Array.isArray(diagnoses) && diagnoses.length > 0 ? diagnoses[diagnoses.length - 1] : null;
  const lines = (latestQuote.items || []).map((qi) => ({
    type: qi.item_type === 'MATERIAL' ? 'part' : 'service',
    matId: qi.material_id ? `m-db-${qi.material_id}` : undefined,
    name: qi.description_snapshot || 'Hạng mục dịch vụ',
    unit: qi.item_type === 'MATERIAL' ? 'cái' : 'lần',
    qty: Number(qi.quantity) || 1,
    price: Number(qi.unit_price) || 0,
    dbItemId: qi.quotation_item_id || null,
    isCustom: Boolean(qi.is_external_purchase), // linh kiện thợ mua ngoài
    receiptId: qi.receipt_attachment_id || null,
  }));
  const qTotal = Number(latestQuote.total_amount) || lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const isApproved = latestQuote.quotation_status === 'APPROVED' || latestQuote.customer_decision === 'APPROVED';
  // Tổng các báo giá đã duyệt như backend (shared/pricing/bill.js): báo giá ban đầu thay tiền đặt, phát sinh cộng thêm.
  const approvedList = quotations.filter((q) => q.quotation_status === 'APPROVED');
  const sumOf = (list) => list.reduce((s, q) => s + (Number(q.total_amount) || 0), 0);
  const initialApproved = approvedList.filter((q) => q.quotation_type !== 'SUPPLEMENTAL');
  const approvedTotal = approvedList.length
    ? (initialApproved.length ? sumOf(initialApproved) : goodsTotal) + sumOf(approvedList.filter((q) => q.quotation_type === 'SUPPLEMENTAL'))
    : null;
  return {
    dbQuotationId: latestQuote.quotation_id,
    quotationCode: latestQuote.quotation_code,
    quotationType: latestQuote.quotation_type || 'INITIAL',
    status: latestQuote.quotation_status,
    revisionRequested: latestQuote.quotation_status === 'REVISION_REQUESTED' || latestQuote.customer_decision === 'REVISE',
    rejectReason: latestQuote.rejection_reason || '',
    approvedTotal,
    diagnosis: latestDiag?.findings || problemDesc || 'Đã kiểm tra thiết bị tại hiện trường',
    symptoms: latestDiag?.symptoms || '',
    recommendation: latestDiag?.repair_recommendation || '',
    lines,
    total: qTotal,
    booked: goodsTotal,
    needsApproval: !isApproved,
    approved: isApproved,
    at: latestQuote.sent_at ? new Date(latestQuote.sent_at).getTime() : Date.now(),
  };
};

// Hoá đơn (GET /customer/requests/:id/bill hoặc /technician/jobs/:id/bill) -> trường tiền trên app.
// Mọi số tiền phải trả / đã trả / giảm giá lấy từ đây, app không tự tính.
export const mapBackendBill = (summary) => {
  if (!summary?.bill) return null;
  const b = summary.bill;
  return {
    amountDue: Number(b.amount_due) || 0,
    bookedAmount: Number(b.booked_amount) || 0,
    quotationTotal: b.quotation_total == null ? null : Number(b.quotation_total),
    supplementalTotal: Number(b.supplemental_total) || 0,
    tierPartDiscountPercent: Number(b.tier_part_discount_percent) || 0,
    tierPartDiscount: Number(b.tier_part_discount_amount) || 0,
    voucherDiscount: Number(b.voucher_discount_amount) || 0,
    lateDiscount: Number(b.late_discount_amount) || 0,
    paidAmount: Number(summary.paid_amount) || 0,
    remainingAmount: Number(summary.remaining_amount) || 0,
    paymentStatus: summary.payment_status || 'UNPAID', // UNPAID | PENDING | PARTIALLY_PAID | PAID | NOTHING_TO_PAY
    // Khách đã báo trả tiền mặt, chờ thợ / văn phòng xác nhận đã nhận (chưa tính là đã trả).
    cashClaimPending: Boolean(summary.cash_claim_pending),
    paymentMethod: summary.payment_method || null,
    cashToCollect: summary.cash_to_collect != null ? Number(summary.cash_to_collect) : null,
  };
};
// Đơn bảo hành mà thợ kết luận ngoài bảo hành thì tính tiền như đơn thường (backend effectiveRequestType).
const kindOf = (req) => (req?.request_type === 'WARRANTY' && !req?.out_of_warranty ? 'warranty' : 'normal');
const dateMs = (v) => (v ? new Date(v).getTime() : null);
const DAY_MS = 24 * 60 * 60 * 1000;

export const mapBackendCustomerRequestToOrder = (req, customerPhoneFallback = '') => {
  if (!req) return null;
  const techInfo = req.technician || null;
  const techName = techInfo?.full_name || ASSIGNED_TECH_PLACEHOLDER;
  const items = mapBackendItemsToAppItems(req.items || []);
  const itemsGoods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const goods = Number(req.goods_amount) > 0 ? Number(req.goods_amount) : itemsGoods;
  const visits = req.visits || [];
  const latestVisit = visits[visits.length - 1] || null;
  const productDiscount = Number(req.product_discount_amount) || 0;
  const comboDiscount = Number(req.combo_discount_amount) || 0;
  const booked = Math.max(0, goods - productDiscount - comboDiscount);
  const quote = mapBackendQuotationToAppQuote(req.quotations || [], [], booked, req.problem_description);
  const hasPendingQuote = (req.quotations || []).some((q) => q.quotation_status === 'SENT');
  let status = mapBackendStatusToAppStatus(req.request_status, latestVisit?.visit_status, quote?.approved, hasPendingQuote);
  // "Đang đến": hành trình thật từ GET /customer/requests/:id/tracking.
  const journey = req.journey || null;
  if (status === 'confirmed' && journey?.on_the_way) status = 'onway';
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : Date.now();
  const preferredIso = req.preferred_time || latestVisit?.scheduled_start || req.created_at;
  const fullAddr = req.address?.address_text || req.service_address_snapshot || 'Hà Nội';
  const contactPhone = (req.address?.contact_phone && !String(req.address.contact_phone).includes('*'))
    ? req.address.contact_phone
    : (customerPhoneFallback || req.address?.contact_phone || '');
  const bill = mapBackendBill(req.bill);

  const cancelHistory = (req.timeline || []).find((h) => String(h.new_status || '').toUpperCase().startsWith('CANCELLED'));
  // Phí kiểm tra khi huỷ: chỉ lấy từ hoá đơn server (amount_due của đơn huỷ), không đoán.
  const inspectionFee = status === 'cancelled' && bill ? bill.amountDue : 0;

  const history = Array.isArray(req.timeline) && req.timeline.length > 0
    ? req.timeline.map((h) => ({
        status: mapBackendStatusToAppStatus(h.new_status, null, quote?.approved, false),
        at: h.changed_at ? new Date(h.changed_at).getTime() : createdAt,
        note: h.reason || '',
      }))
    : [{ status, at: createdAt }];

  const isDone = status === 'done';
  const warrantyStartAt = dateMs(req.warranty_start_date);
  const warrantyEndAt = dateMs(req.warranty_end_date);
  const warrantyDays = Number(req.warranty_days) > 0
    ? Number(req.warranty_days)
    : (warrantyStartAt && warrantyEndAt ? Math.round((warrantyEndAt - warrantyStartAt) / DAY_MS) : null);
  const doneAt = isDone ? (warrantyStartAt || dateMs(req.updated_at) || createdAt) : null;
  const paid = bill ? ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus) : req.request_status === 'COMPLETED';
  const estimated = Number(req.estimated_total);

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    backendStatus: req.request_status,
    kind: kindOf(req),
    outOfWarranty: Boolean(req.out_of_warranty),
    outOfWarrantyReason: req.out_of_warranty_reason || '',
    requestSource: req.request_source || 'APP',
    originalRequestId: req.original_request_id || null,
    customerPhone: customerPhoneFallback || contactPhone,
    customerTier: req.customer_tier_code || null,
    warrantyDays,
    warrantyStartAt,
    warrantyEndAt,
    items,
    goods,
    productDiscount,
    comboDiscount,
    comboLabel: req.combo_label || '',
    voucher: req.voucher_code ? { code: req.voucher_code } : null,
    voucherDiscount: Number(req.voucher_discount_amount) || 0,
    total: bill ? bill.amountDue : (Number.isFinite(estimated) && estimated > 0 ? estimated : booked),
    finalTotal: bill ? bill.amountDue : (Number.isFinite(estimated) && estimated > 0 ? estimated : booked),
    bill,
    inspectionFee,
    cancelReason: cancelHistory?.reason || 'Đơn đã được huỷ',
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    preferredTimeAt: dateMs(req.preferred_time),
    preferredTimeEndAt: dateMs(req.preferred_time_end),
    payment: paymentLabelOf(req.preferred_payment_method),
    paymentMethod: String(req.preferred_payment_method || '').toUpperCase() === 'BANK_TRANSFER' ? 'vietqr' : 'cash',
    note: req.problem_description || '',
    address: {
      id: `addr-snap-${req.request_id}`,
      name: req.address?.contact_name || 'Khách hàng',
      phone: contactPhone,
      area: extractAreaFromAddress(fullAddr),
      full: fullAddr,
    },
    status,
    history,
    createdAt,
    doneAt,
    travelStartedAt: dateMs(journey?.travel_started_at),
    arrivedAt: dateMs(journey?.arrived_at),
    lateCompensation: bill?.lateDiscount ? { amount: bill.lateDiscount } : null,
    tech: status === 'pending' ? null : {
      name: techName,
      code: techInfo?.technician_id != null ? String(techInfo.technician_id) : '',
      phone: techInfo?.phone || '',
      rating: techInfo?.rating_average ?? null,
      ratingCount: techInfo?.rating_count ?? 0,
      avatar: techInfo?.avatar_url || null,
    },
    quote,
    materials: (quote?.lines || [])
      .filter((l) => l.type === 'part')
      .map((l, idx) => ({ id: `mat-${req.request_id}-${idx}`, matId: l.matId || null, name: l.name, unit: l.unit, qty: l.qty, price: l.price })),
    // Trạng thái chờ thanh toán / còn công nợ theo cách chia của Linh; đã trả hay chưa đọc từ hoá đơn server.
    report: (isDone || ['pending_payment', 'partially_paid', 'pending_review'].includes(status)) ? {
      summary: latestVisit?.work_performed || '',
      paid,
      at: doneAt || dateMs(req.updated_at),
      tech: techName,
      techCode: techInfo?.technician_id != null ? String(techInfo.technician_id) : '',
      warrantyCertificateCode: `BH-${req.request_code}`,
    } : null,
    rating: req.review ? {
      stars: Number(req.review.rating) || 5,
      text: req.review.review_text || '',
    } : null,
  };
};

export const mapBackendTechJobToOrder = (job, techProfile = TECH_ME) => {
  if (!job || !job.request) return null;
  const req = job.request;
  const visit = job.visit || {};
  const items = mapBackendItemsToAppItems(job.services || []);
  const goods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const hasPendingQuote = (job.quotations || []).some((q) => q.quotation_status === 'SENT');
  const quote = mapBackendQuotationToAppQuote(job.quotations || [], job.diagnoses || [], goods, req.problem_description);
  const isEnded = job.assignment_status === 'ENDED';
  let status = ['PENDING_REVIEW', 'READY_FOR_ACCEPTANCE', 'PENDING_PAYMENT', 'PARTIALLY_PAID_RECEIVABLE'].includes(req.request_status)
    ? mapBackendStatusToAppStatus(req.request_status)
    : (isEnded && !req.request_status?.startsWith('CANCELLED')
      ? 'done'
      : mapBackendStatusToAppStatus(req.request_status, visit.visit_status, quote?.approved, hasPendingQuote));
  // "Đang đến": đã bấm xuất phát (travel_started_at) mà chưa check-in (arrived_at) -> giữ đúng sau khi cài lại / đổi máy.
  if (status === 'confirmed' && job.travel_started_at && !job.arrived_at) status = 'onway';
  const bill = mapBackendBill(job.bill);

  const cancelHistory = (req.timeline || req.status_history || []).find((h) => String(h.new_status || '').toUpperCase().startsWith('CANCELLED'));
  const inspectionFee = status === 'cancelled' && bill ? bill.amountDue : 0;

  const preferredIso = req.preferred_time || visit.scheduled_start || job.assigned_time;
  const createdAt = job.assigned_time ? new Date(job.assigned_time).getTime() : Date.now();
  const fullAddr = req.address_text || 'Hà Nội';
  const myTech = {
    name: techProfile?.name || TECH_ME.name,
    code: techProfile?.code || TECH_ME.code,
    phone: techProfile?.phone || TECH_ME.phone,
    rating: techProfile?.rating ?? null,
  };

  const materialsFromUsages = (job.material_usages || []).map((mu, idx) => ({
    id: mu.usage_id ? `mu-${mu.usage_id}` : `mu-${job.assignment_id}-${idx}`,
    dbUsageId: mu.usage_id || null,
    matId: `m-db-${mu.material_id}`,
    dbMaterialId: mu.material_id,
    name: mu.material_name || `Vật tư #${mu.material_id}`,
    unit: mu.unit_of_measure || 'cái',
    qty: Number(mu.used_quantity) || 1,
    price: materialPriceOf(mu.material_id),
  }));

  const isDone = status === 'done';
  const doneAt = isDone ? (visit.scheduled_end ? new Date(visit.scheduled_end).getTime() : createdAt) : null;

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    dbAssignmentId: job.assignment_id,
    dbVisitNumber: visit.visit_number || 1,
    backendStatus: req.request_status,
    kind: kindOf(req),
    customerPhone: req.contact_phone || '',
    warrantyDays: null,
    items,
    goods,
    productDiscount: bill ? Math.max(0, goods - bill.bookedAmount) : 0,
    comboDiscount: 0,
    voucherDiscount: bill?.voucherDiscount || 0,
    // Tiền thật từ GET /technician/jobs/:id/bill; chưa có hoá đơn thì tạm theo giá dịch vụ.
    total: bill ? bill.amountDue : (quote?.approvedTotal ?? goods),
    finalTotal: bill ? bill.amountDue : (quote?.approvedTotal ?? goods),
    bill,
    cashToCollect: bill?.cashToCollect ?? null,
    paymentMethod: String(req.preferred_payment_method || '').toUpperCase() === 'BANK_TRANSFER' ? 'vietqr' : 'cash',
    travelStartedAt: dateMs(job.travel_started_at),
    arrivedAt: dateMs(job.arrived_at),
    checkIn: job.check_in ? { lat: job.check_in.latitude, lng: job.check_in.longitude, at: dateMs(job.arrived_at) } : null,
    lateCompensation: req.late_minutes > 0 ? { minutes: req.late_minutes, tier: req.late_tier || null, amount: bill?.lateDiscount || 0 } : null,
    preferredTimeAt: dateMs(req.preferred_time),
    preferredTimeEndAt: dateMs(req.preferred_time_end),
    inspectionFee,
    cancelReason: cancelHistory?.reason || 'Đơn đã huỷ',
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    payment: paymentLabelOf(req.preferred_payment_method),
    note: req.problem_description || '',
    address: {
      id: `addr-job-${job.assignment_id}`,
      name: req.contact_name || 'Khách hàng',
      phone: req.contact_phone || '',
      area: extractAreaFromAddress(fullAddr),
      full: fullAddr,
    },
    status,
    history: [{ status, at: createdAt }],
    createdAt,
    doneAt,
    tech: myTech,
    quote,
    materials: materialsFromUsages.length > 0
      ? materialsFromUsages
      : (quote?.lines || []).filter((l) => l.type === 'part').map((l, idx) => ({
          id: `qmat-${job.assignment_id}-${idx}`,
          matId: l.matId || null,
          name: l.name,
          unit: l.unit,
          qty: l.qty,
          price: l.price,
        })),
    // Các bước thực hiện (backend: job.procedure; null = đơn không có bước bắt buộc)
    procedure: job.procedure || null,
    // Tiến độ / ghi chú thợ gửi (POST /technician/jobs/:id/progress).
    progress: (job.progress || []).map((p, idx) => ({
      id: `pg-${job.assignment_id}-${idx}`,
      percent: p.progress_percent,
      note: p.note || '',
      at: p.recorded_at ? new Date(p.recorded_at).getTime() : createdAt,
    })),
    // Linh kiện mua ngoài trong các báo giá đã duyệt: phải gắn ảnh biên lai trước khi nộp hoàn thành (backend RECEIPT_REQUIRED).
    externalParts: (job.quotations || [])
      .filter((q) => q.quotation_status === 'APPROVED')
      .flatMap((q) => (q.items || []).filter((it) => it.is_external_purchase))
      .map((it) => ({ itemId: it.quotation_item_id, name: it.description_snapshot, receiptId: it.receipt_attachment_id || null })),
    followUpRequested: Boolean(visit.follow_up_reason),
    followUpReason: visit.follow_up_reason || '',
    outOfWarranty: Boolean(req.out_of_warranty),
    outOfWarrantyReason: req.out_of_warranty_reason || '',
    repairNotes: (job.diagnoses || []).map((d, idx) => ({
      id: `diag-${job.assignment_id}-${idx}`,
      text: `${d.symptoms ? `[Triệu chứng: ${d.symptoms}] ` : ''}${d.findings || ''}${d.repair_recommendation ? ` -> Đề xuất: ${d.repair_recommendation}` : ''}`,
      at: d.recorded_at ? new Date(d.recorded_at).getTime() : createdAt,
    })),
    report: (isDone || ['pending_payment', 'partially_paid', 'pending_review'].includes(status)) ? {
      summary: visit.work_performed || '',
      paid: bill ? ['PAID', 'NOTHING_TO_PAY'].includes(bill.paymentStatus) : ['COMPLETED', 'READY_FOR_ACCEPTANCE'].includes(String(req.request_status || '').toUpperCase()),
      at: doneAt || dateMs(job.completed_at),
      tech: myTech.name,
      techCode: myTech.code,
      warrantyCertificateCode: `BH-${req.request_code}`,
    } : null,
  };
};

export const mapBackendOpenRequestToOrder = (req) => {
  if (!req) return null;
  const items = mapBackendItemsToAppItems(req.services || req.items || []);
  const goods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const preferredIso = req.preferred_time || req.created_at;
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : Date.now();
  const fullAddr = req.address_text || req.service_address_snapshot || 'Hà Nội';

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    kind: kindOf(req),
    customerPhone: req.contact_phone || '',
    warrantyDays: null,
    items,
    goods,
    productDiscount: 0,
    comboDiscount: 0,
    voucherDiscount: 0,
    // Chợ việc chỉ có giá niêm yết; tiền thật có khi nhận việc (hoá đơn).
    total: kindOf(req) === 'warranty' ? 0 : goods,
    finalTotal: kindOf(req) === 'warranty' ? 0 : goods,
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    payment: paymentLabelOf(req.preferred_payment_method),
    note: req.problem_description || '',
    address: {
      id: `addr-open-${req.request_id}`,
      name: req.contact_name || 'Khách hàng',
      phone: req.contact_phone || '',
      area: extractAreaFromAddress(fullAddr),
      full: fullAddr,
    },
    status: 'pending',
    history: [{ status: 'pending', at: createdAt }],
    createdAt,
    tech: null,
  };
};

// Ảnh của việc (GET /uploads?job_id=) -> evidence trên app.
const EVIDENCE_STAGE = { PROBLEM_PHOTO: 'diagnosis', BEFORE_REPAIR: 'before', AFTER_REPAIR: 'after', DOCUMENT: 'after' };
export const mapBackendPhotoToEvidence = (row) => ({
  id: `att-${row.attachment_id}`,
  dbAttachmentId: row.attachment_id,
  uri: row.image_url,
  stage: EVIDENCE_STAGE[row.evidence_type] || 'after',
  note: row.description || '',
  at: row.uploaded_at ? new Date(row.uploaded_at).getTime() : Date.now(),
});

export const mergeBackendOrdersWithLocal = (localOrders = [], remoteOrders = []) => {
  const byKey = new Map();
  const keyOf = (o) => (o?.dbRequestId ? `db-${o.dbRequestId}` : o?.code);

  remoteOrders.forEach((ro) => {
    const k = keyOf(ro);
    if (!k) return;
    byKey.set(k, ro);
  });

  localOrders.forEach((lo) => {
    const k = keyOf(lo);
    if (!k) return;
    const matchKey = byKey.has(k)
      ? k
      : [...byKey.entries()].find(([, v]) => v.code === lo.code)?.[0];
    if (matchKey) {
      const ro = byKey.get(matchKey);
      // Giữ trạng thái di chuyển ('onway') hoặc chat/ảnh minh chứng trên máy nếu backend đang ở ASSIGNED / IN_PROGRESS
      const keepOnway = lo.status === 'onway' && ro.status === 'confirmed';
      const keepRepairing = lo.status === 'repairing' && ro.status === 'diagnosing';
      // Thợ đang sửa lại báo giá (reopenQuote): giữ form mở tới khi server có báo giá mới.
      const keepEditing = Boolean(lo.quoteEditing) && ['quoted', 'repairing'].includes(ro.status)
        && (ro.quote?.dbQuotationId || null) === (lo.quoteEditingFrom || null);
      byKey.set(matchKey, {
        ...lo,
        ...ro,
        code: ro.code || lo.code,
        status: keepEditing ? lo.status : (keepOnway ? 'onway' : (keepRepairing ? 'repairing' : ro.status)),
        quoteEditing: keepEditing,
        ...(keepEditing ? { quote: lo.quote } : {}),
        tracking: lo.tracking || ro.tracking,
        checkIn: lo.checkIn || ro.checkIn,
        chat: lo.chat?.length ? lo.chat : (ro.chat || []),
        // Ảnh, tiến độ lấy từ server; chỉ giữ bản trên máy khi server chưa trả trường này.
        evidence: ro.evidence !== undefined ? ro.evidence : (lo.evidence || []),
        progress: ro.progress !== undefined ? ro.progress : (lo.progress || []),
        repairNotes: ro.repairNotes?.length ? ro.repairNotes : (lo.repairNotes || []),
        materials: ro.materials !== undefined ? ro.materials : (lo.materials || []),
        quote: ro.quote || lo.quote || null,
        rating: ro.rating || lo.rating || null,
        report: ro.report || lo.report || null,
      });
    }
    // Đơn chỉ có trên máy (chưa từng lưu lên server) bị bỏ: mọi đơn đều tạo qua backend.
  });
  return [...byKey.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// Thông báo backend (GET /notifications) -> dạng thông báo của app. Link mở đơn theo request_id nếu app có đơn đó.
export const mapBackendNotification = (n, orders = [], linkName = 'order') => {
  if (!n) return null;
  const order = n.request_id != null ? orders.find((o) => String(o.dbRequestId) === String(n.request_id)) : null;
  return {
    id: `notif-db-${n.notification_id}`,
    dbNotificationId: n.notification_id,
    at: ts(n.created_at),
    read: Boolean(n.is_read),
    icon: n.icon || '🔔',
    type: n.type || null,
    title: n.title || '',
    body: n.body || '',
    ...(order ? { link: { name: linkName, params: { code: order.code } } } : {}),
  };
};

// Mẫu voucher backend (voucher_id, label, discount_amount, discount_percent, ...) -> dạng voucher app dùng để tính giảm giá.
const voucherFields = (v) => ({
  label: v?.label || '',
  ...(v?.discount_amount != null ? { discount: Number(v.discount_amount) } : {}),
  ...(v?.discount_percent != null ? { percent: Number(v.discount_percent) } : {}),
  ...(v?.max_discount_amount != null ? { max: Number(v.max_discount_amount) } : {}),
  ...(v?.min_order_amount != null ? { min: Number(v.min_order_amount) } : {}),
});

// Voucher trong ví của khách (GET /customer/vouchers).
export const mapWalletVoucher = (w) => (w ? {
  ...voucherFields(w.voucher),
  code: w.code,
  wallet: true,
  status: w.status,
  customerVoucherId: w.customer_voucher_id,
  expiresAt: w.expires_at ? ts(w.expires_at) : null,
} : null);

// Mã công khai khách nhập tay (GET /customer/vouchers/catalog -> public_vouchers).
export const mapPublicVoucher = (v) => (v?.code ? { ...voucherFields(v), code: v.code, public: true } : null);

// Lựa chọn đổi điểm (catalog -> redeem_options): id = voucher_id gửi lên POST /customer/vouchers/redeem.
export const mapRedeemOption = (v) => (v ? {
  id: String(v.voucher_id),
  cost: Number(v.point_cost) || 0,
  title: v.label || '',
  validDays: v.valid_days ?? null,
  voucher: voucherFields(v),
} : null);

// Sổ điểm (GET /customer/loyalty -> history[]).
export const mapPointHistory = (h) => (h ? {
  id: `pt-db-${h.point_transaction_id}`,
  title: h.title || '',
  delta: Number(h.points_delta) || 0,
  at: ts(h.created_at),
  type: h.reason_type ? String(h.reason_type).toLowerCase() : null,
} : null);

export { resolveDbMaterialId };
