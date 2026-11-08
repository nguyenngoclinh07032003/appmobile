import {
  getService,
  TECH_ME,
  resolveServiceSlugFromBackend,
  resolveDbMaterialId,
} from '../constants/data';

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
    area: extractAreaFromAddress(full),
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
  if (['PENDING_REVIEW', 'READY_FOR_ACCEPTANCE', 'PENDING_PAYMENT', 'PARTIALLY_PAID_RECEIVABLE', 'COMPLETED'].includes(st)) {
    return 'done';
  }
  if (st.startsWith('CANCELLED')) return 'cancelled';
  return 'pending';
};

export const mapBackendItemsToAppItems = (rawItems = []) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [{ id: 'vs-ml-1', qty: 1, price: 180000 }];
  }
  return rawItems.map((it) => {
    const slug = resolveServiceSlugFromBackend(it.service_id, it.service_name || it.service_name_snapshot);
    const svc = getService(slug);
    const price = Number(it.selected_price) || svc?.price || 180000;
    return {
      id: slug,
      dbRequestServiceId: it.request_service_id || null,
      dbServiceId: it.service_id || svc?.dbId || 1,
      name: it.service_name || it.service_name_snapshot || svc?.name || 'Dịch vụ HRMSS',
      qty: 1,
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
  }));
  const qTotal = Number(latestQuote.total_amount) || lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const isApproved = latestQuote.quotation_status === 'APPROVED' || latestQuote.customer_decision === 'APPROVED';
  return {
    dbQuotationId: latestQuote.quotation_id,
    quotationCode: latestQuote.quotation_code,
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

export const mapBackendCustomerRequestToOrder = (req, customerPhoneFallback = '') => {
  if (!req) return null;
  const items = mapBackendItemsToAppItems(req.items || []);
  const goods = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const visits = req.visits || [];
  const latestVisit = visits[visits.length - 1] || null;
  const quote = mapBackendQuotationToAppQuote(req.quotations || [], [], goods, req.problem_description);
  const hasPendingQuote = (req.quotations || []).some((q) => q.quotation_status === 'SENT');
  const status = mapBackendStatusToAppStatus(req.request_status, latestVisit?.visit_status, quote?.approved, hasPendingQuote);
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : Date.now();
  const preferredIso = req.preferred_time || latestVisit?.scheduled_start || req.created_at;
  const fullAddr = req.address?.address_text || req.service_address_snapshot || 'Hà Nội';
  const contactPhone = (req.address?.contact_phone && !String(req.address.contact_phone).includes('*'))
    ? req.address.contact_phone
    : (customerPhoneFallback || req.address?.contact_phone || '');

  const cancelHistory = (req.timeline || []).find((h) => String(h.new_status || '').toUpperCase().startsWith('CANCELLED'));
  const hasFeeInHistory = cancelHistory && /(?=.*phí kiểm tra)(?!.*miễn phí)/i.test(cancelHistory.reason || '') && /100[.,]?000/i.test(cancelHistory.reason || '');
  const inspectionFee = hasFeeInHistory ? 100000 : 0;

  const history = Array.isArray(req.timeline) && req.timeline.length > 0
    ? req.timeline.map((h) => ({
        status: mapBackendStatusToAppStatus(h.new_status, null, quote?.approved, false),
        at: h.changed_at ? new Date(h.changed_at).getTime() : createdAt,
        note: h.reason || '',
      }))
    : [{ status, at: createdAt }];

  const isDone = status === 'done';
  const doneAt = isDone ? (req.updated_at ? new Date(req.updated_at).getTime() : createdAt) : null;

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    kind: 'normal',
    customerPhone: customerPhoneFallback || contactPhone,
    warrantyDays: 60,
    items,
    goods,
    productDiscount: 0,
    comboDiscount: 0,
    voucherDiscount: 0,
    total: status === 'cancelled' ? inspectionFee : (quote?.approved ? quote.total : goods),
    finalTotal: status === 'cancelled' ? inspectionFee : (quote?.approved ? quote.total : goods),
    inspectionFee,
    cancelReason: cancelHistory?.reason || 'Đơn đã được huỷ',
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    payment: 'VNPay QR',
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
    tech: status === 'pending' ? null : {
      name: TECH_ME.name,
      code: TECH_ME.code,
      phone: TECH_ME.phone,
      rating: 5.0,
    },
    quote,
    materials: (quote?.lines || [])
      .filter((l) => l.type === 'part')
      .map((l, idx) => ({ id: `mat-${req.request_id}-${idx}`, matId: l.matId || 'm-gas-r32', name: l.name, unit: l.unit, qty: l.qty, price: l.price })),
    report: isDone ? {
      summary: latestVisit?.work_performed || 'Đã hoàn thành sửa chữa & bảo dưỡng thiết bị chuẩn kỹ thuật HRMSS.',
      paid: req.request_status === 'COMPLETED',
      at: doneAt,
      tech: TECH_ME.name,
      techCode: TECH_ME.code,
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
  const status = isEnded && !req.request_status?.startsWith('CANCELLED')
    ? 'done'
    : mapBackendStatusToAppStatus(req.request_status, visit.visit_status, quote?.approved, hasPendingQuote);

  const cancelHistory = (req.timeline || req.status_history || []).find((h) => String(h.new_status || '').toUpperCase().startsWith('CANCELLED'));
  const hasFeeInHistory = cancelHistory && /(?=.*phí kiểm tra)(?!.*miễn phí)/i.test(cancelHistory.reason || '') && /100[.,]?000/i.test(cancelHistory.reason || '');
  const inspectionFee = hasFeeInHistory ? 100000 : 0;

  const preferredIso = req.preferred_time || visit.scheduled_start || job.assigned_time;
  const createdAt = job.assigned_time ? new Date(job.assigned_time).getTime() : Date.now();
  const fullAddr = req.address_text || 'Hà Nội';
  const myTech = {
    name: techProfile?.name || TECH_ME.name,
    code: techProfile?.code || TECH_ME.code,
    phone: techProfile?.phone || TECH_ME.phone,
    rating: techProfile?.rating || 5.0,
  };

  const materialsFromUsages = (job.material_usages || []).map((mu, idx) => ({
    id: `mu-${job.assignment_id}-${idx}`,
    matId: `m-db-${mu.material_id}`,
    dbMaterialId: mu.material_id,
    name: mu.material_name || `Vật tư #${mu.material_id}`,
    unit: mu.unit_of_measure || 'cái',
    qty: Number(mu.used_quantity) || 1,
    price: 250000,
  }));

  const isDone = status === 'done';
  const doneAt = isDone ? (visit.scheduled_end ? new Date(visit.scheduled_end).getTime() : createdAt) : null;

  return {
    code: req.request_code,
    dbRequestId: req.request_id,
    dbAssignmentId: job.assignment_id,
    dbVisitNumber: visit.visit_number || 1,
    kind: 'normal',
    customerPhone: req.contact_phone || '',
    warrantyDays: 60,
    items,
    goods,
    productDiscount: 0,
    comboDiscount: 0,
    voucherDiscount: 0,
    total: status === 'cancelled' ? inspectionFee : (quote?.approved ? quote.total : goods),
    finalTotal: status === 'cancelled' ? inspectionFee : (quote?.approved ? quote.total : goods),
    inspectionFee,
    cancelReason: cancelHistory?.reason || 'Đơn đã huỷ',
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    payment: 'VNPay QR',
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
          matId: l.matId || 'm-gas-r32',
          name: l.name,
          unit: l.unit,
          qty: l.qty,
          price: l.price,
        })),
    repairNotes: (job.diagnoses || []).map((d, idx) => ({
      id: `diag-${job.assignment_id}-${idx}`,
      text: `${d.symptoms ? `[Triệu chứng: ${d.symptoms}] ` : ''}${d.findings || ''}${d.repair_recommendation ? ` -> Đề xuất: ${d.repair_recommendation}` : ''}`,
      at: d.recorded_at ? new Date(d.recorded_at).getTime() : createdAt,
    })),
    report: isDone ? {
      summary: visit.work_performed || 'Đã hoàn thành công việc sửa chữa & bảo dưỡng.',
      paid: req.request_status === 'COMPLETED',
      at: doneAt,
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
    kind: 'normal',
    customerPhone: req.contact_phone || '',
    warrantyDays: 60,
    items,
    goods,
    productDiscount: 0,
    comboDiscount: 0,
    voucherDiscount: 0,
    total: goods,
    finalTotal: goods,
    dateLabel: formatDateLabelFromIso(preferredIso),
    dateKey: formatDateKeyFromIso(preferredIso),
    slot: formatSlotFromIso(preferredIso),
    payment: 'Thanh toán khi nhận hàng',
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
      byKey.set(matchKey, {
        ...lo,
        ...ro,
        code: ro.code || lo.code,
        status: keepOnway ? 'onway' : (keepRepairing ? 'repairing' : ro.status),
        tracking: lo.tracking || ro.tracking,
        checkIn: lo.checkIn || ro.checkIn,
        chat: lo.chat?.length ? lo.chat : (ro.chat || []),
        evidence: lo.evidence?.length ? lo.evidence : (ro.evidence || []),
        progress: lo.progress?.length ? lo.progress : (ro.progress || []),
        repairNotes: ro.repairNotes?.length ? ro.repairNotes : (lo.repairNotes || []),
        materials: ro.materials?.length ? ro.materials : (lo.materials || []),
        quote: ro.quote || lo.quote || null,
        rating: ro.rating || lo.rating || null,
        report: ro.report || lo.report || null,
      });
    } else if (!lo.dbRequestId) {
      // Chỉ giữ đơn local nếu chưa từng đồng bộ lên DB
      byKey.set(k, lo);
    }
  });
  return [...byKey.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

export { resolveDbMaterialId };
