// Tiện ích xử lý vai trò Đội thợ (thợ chính LEAD / thợ phụ SUPPORT) và phạm vi danh mục phụ trách.
// Giữ thuần JS không phụ thuộc React Native để dùng chung cho syncService, AppContext, UI và bộ kiểm thử Node.

export function normalizeAssignmentRole(rawRole) {
  return String(rawRole || '').trim().toUpperCase() === 'SUPPORT' ? 'SUPPORT' : 'LEAD';
}

export function isSupportAssignment(order) {
  return normalizeAssignmentRole(order?.assignmentRole) === 'SUPPORT';
}

// Thợ phụ đã check-in tại nhà khách nhưng lượt đến vẫn SCHEDULED (chờ thợ chính check-in mới mở làm việc).
export function isSupportWaitingForLead(order) {
  return Boolean(
    isSupportAssignment(order) &&
    (order?.arrivedAt || order?.checkIn) &&
    String(order?.visitStatus || '').trim().toUpperCase() === 'SCHEDULED',
  );
}

const parseNumericCategoryId = (rawCat) => {
  if (rawCat == null || rawCat === '') return null;
  if (typeof rawCat === 'number') return Number.isFinite(rawCat) && rawCat > 0 ? rawCat : null;
  const s = String(rawCat).trim();
  const direct = /^[1-9]\d*$/.exec(s);
  if (direct) return Number(direct[0]);
  const prefixed = /^c([1-9]\d*)$/i.exec(s);
  return prefixed ? Number(prefixed[1]) : null;
};

// Kiểm tra một bước quy trình kỹ thuật có thuộc danh mục thợ phụ phụ trách hay không.
// Trả true nếu là thợ chính hoặc chưa xác định được danh mục (backend vẫn là chốt cuối với 403 OUTSIDE_SUPPORT_SCOPE).
export function isStepInSupportScope(step, order, servicesList = []) {
  if (!isSupportAssignment(order)) return true;
  const allowedIds = (Array.isArray(order?.supportCategoryIds) ? order.supportCategoryIds : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!allowedIds.length) return true;

  let catId = parseNumericCategoryId(step?.category_id ?? step?.service_category_id);

  if (!catId && Array.isArray(servicesList) && servicesList.length > 0) {
    const stepSvcId = step?.service_id != null ? Number(step.service_id) : null;
    const stepSvcName = String(step?.service_name || '').trim().toLowerCase();
    const matchedSvc = servicesList.find(
      (sv) =>
        (stepSvcId != null && Number(sv?.dbId ?? sv?.service_id) === stepSvcId) ||
        (stepSvcName && String(sv?.name || '').trim().toLowerCase() === stepSvcName),
    );
    if (matchedSvc) {
      catId = parseNumericCategoryId(matchedSvc.categoryId ?? matchedSvc.category_id ?? matchedSvc.category);
    }
  }

  if (!catId && Array.isArray(order?.items)) {
    const stepSvcName = String(step?.service_name || '').trim().toLowerCase();
    const stepSvcId = step?.service_id != null ? Number(step.service_id) : null;
    const matchedItem = order.items.find(
      (it) =>
        (stepSvcId != null && Number(String(it?.id || '').replace(/^s/, '')) === stepSvcId) ||
        (stepSvcName && String(it?.name || '').trim().toLowerCase() === stepSvcName),
    );
    if (matchedItem) {
      catId = parseNumericCategoryId(matchedItem.categoryId ?? matchedItem.category_id ?? matchedItem.category);
    }
  }

  if (!catId) return true;
  return allowedIds.includes(catId);
}

export function resolveCategoryNamesByIds(catIds = [], categories = []) {
  const ids = [...new Set((Array.isArray(catIds) ? catIds : []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  const safeCats = Array.isArray(categories) ? categories : [];
  return ids.map((id) => {
    const match = safeCats.find((c) => parseNumericCategoryId(c?.dbId ?? c?.id) === id);
    return match?.label || `Danh mục #${id}`;
  });
}
