// Tiện ích thuần JS xử lý các bước quy trình kỹ thuật của công việc (procedure steps).
// Tách riêng không phụ thuộc React Native để dùng chung cho AppContext, UI và bộ kiểm thử Node.
import { toVietnamese } from './viText';

export function flattenProcedureSteps(procedure) {
  if (!procedure || !Array.isArray(procedure.services)) return [];
  return procedure.services.flatMap((sv) =>
    (Array.isArray(sv?.steps) ? sv.steps : []).map((st) => ({
      ...st,
      service_name: sv?.service_name || '',
      service_id: st?.service_id ?? sv?.service_id ?? null,
      category_id: st?.category_id ?? st?.service_category_id ?? sv?.category_id ?? sv?.service_category_id ?? null,
    })),
  );
}

export function getServiceSectionKey(service, idx = 0) {
  if (!service) return String(idx);
  if (service.request_service_id != null && service.request_service_id !== '') {
    return String(service.request_service_id);
  }
  if (service.service_id != null && service.service_id !== '') {
    return String(service.service_id);
  }
  return String(idx);
}

export function getServiceSectionStats(service) {
  const steps = Array.isArray(service?.steps) ? service.steps : [];
  const total = steps.length;
  const done = steps.filter((st) => st?.status && st.status !== 'PENDING').length;
  const allDone = total > 0 && done === total;
  const hasRequiredPending = steps.some((st) => Boolean(st?.is_required) && st?.status === 'PENDING');
  return { total, done, allDone, hasRequiredPending };
}

export function findCurrentServiceKey(procedure) {
  const services = Array.isArray(procedure?.services) ? procedure.services : [];
  if (!services.length) return null;
  const cur = procedure?.current_step || null;
  if (cur) {
    if (cur.request_service_id != null) {
      const byReqSvc = services.findIndex((sv) => String(sv?.request_service_id) === String(cur.request_service_id));
      if (byReqSvc >= 0) return getServiceSectionKey(services[byReqSvc], byReqSvc);
    }
    if (cur.step_id != null) {
      const byStep = services.findIndex((sv) =>
        Array.isArray(sv?.steps) && sv.steps.some((st) => String(st?.step_id) === String(cur.step_id)),
      );
      if (byStep >= 0) return getServiceSectionKey(services[byStep], byStep);
    }
  }
  const firstPendingIdx = services.findIndex((sv) =>
    Array.isArray(sv?.steps) && sv.steps.some((st) => st?.status === 'PENDING'),
  );
  if (firstPendingIdx >= 0) return getServiceSectionKey(services[firstPendingIdx], firstPendingIdx);
  return getServiceSectionKey(services[0], 0);
}

export function getDefaultOpenServiceKeys(procedure) {
  const services = Array.isArray(procedure?.services) ? procedure.services : [];
  if (!services.length) return new Set();
  if (services.length === 1) return new Set([getServiceSectionKey(services[0], 0)]);
  const curKey = findCurrentServiceKey(procedure);
  return curKey ? new Set([curKey]) : new Set();
}

export function computeNextOpenServiceKeysAfterTick(prevOpenSet, prevProcedure, nextProcedure, completedStepId) {
  const targetProc = nextProcedure || prevProcedure;
  const services = Array.isArray(targetProc?.services) ? targetProc.services : [];
  const validKeys = new Set(services.map((sv, idx) => getServiceSectionKey(sv, idx)));
  const nextSet = new Set([...(prevOpenSet || [])].filter((k) => validKeys.has(k)));

  const completedIdx = services.findIndex((sv) =>
    Array.isArray(sv?.steps) && sv.steps.some((st) => String(st?.step_id) === String(completedStepId)),
  );
  if (completedIdx >= 0) {
    const sv = services[completedIdx];
    const svKey = getServiceSectionKey(sv, completedIdx);
    const { total, done } = getServiceSectionStats(sv);
    if (total > 0 && done === total) {
      nextSet.delete(svKey);
      const nextCurKey = findCurrentServiceKey(targetProc);
      if (nextCurKey) {
        const nextCurIdx = services.findIndex((s, i) => getServiceSectionKey(s, i) === nextCurKey);
        const nextCurHasPending = nextCurIdx >= 0 && Array.isArray(services[nextCurIdx]?.steps)
          && services[nextCurIdx].steps.some((st) => st?.status === 'PENDING');
        if (nextCurHasPending) nextSet.add(nextCurKey);
      }
    }
  }
  return nextSet;
}

export function getIncompleteRequiredServiceKeys(procedure, errors = []) {
  const services = Array.isArray(procedure?.services) ? procedure.services : [];
  if (!services.length) return [];
  const errMsgs = (Array.isArray(errors) ? errors : [])
    .map((e) => String(e?.message || '').trim().toLowerCase())
    .filter(Boolean);
  const keys = [];
  services.forEach((sv, idx) => {
    const { hasRequiredPending } = getServiceSectionStats(sv);
    const svName = String(sv?.service_name || '').trim().toLowerCase();
    const matchedErr = Boolean(svName && errMsgs.some((m) => m.includes(svName)));
    if (hasRequiredPending || matchedErr) {
      keys.push(getServiceSectionKey(sv, idx));
    }
  });
  return keys;
}

export function formatProcedureIncompleteAlert(procedure, errors = []) {
  const errList = (Array.isArray(errors) ? errors : [])
    .map((e) => toVietnamese(e?.message, String(e?.message || '').trim() || 'Chưa hoàn thành bước bắt buộc'))
    .filter(Boolean);
  const missingBullets = errList.map((m) => `• ${m}`).join('\n');
  const ownMissing = getAutoCompletableProcedureSteps(procedure);
  const hasServices = Array.isArray(procedure?.services) && procedure.services.length > 0;
  const isSupportOnlyBlocking = errList.length > 0 && (!hasServices || ownMissing.length === 0);

  if (isSupportOnlyBlocking) {
    return `Phần việc của thợ phụ chưa hoàn thành, liên hệ thợ phụ.${missingBullets ? `\n\n${missingBullets}` : ''}`;
  }
  return `Đánh dấu xong các bước bắt buộc trong thẻ "Các bước thực hiện" rồi nộp lại (nếu có bước thuộc phần thợ phụ, liên hệ thợ phụ hoàn thành).${missingBullets ? `\n\n${missingBullets}` : ''}`;
}

// BE đã bỏ trường chỉ số đo (measures / measurements): giữ lại hàm tương thích trả rỗng để không chặn hoàn thành.
export function getBlockingProcedureSteps() {
  return [];
}

// Các bước bắt buộc PENDING -> tự động đồng bộ DONE khi thợ nộp biên bản hoàn thành.
export function getAutoCompletableProcedureSteps(procedure) {
  return flattenProcedureSteps(procedure).filter(
    (st) => st.is_required && st.status === 'PENDING',
  );
}

// Phân bổ photo_ids cho các bước yêu cầu ảnh khi tự động đồng bộ:
// - Bước sau (step_no > 1) ưu tiên ảnh AFTER_REPAIR.
// - Bước đầu (step_no === 1) ưu tiên ảnh riêng trong otherPhotoIds hoặc ảnh AFTER thứ hai;
//   nếu chỉ có 1 ảnh AFTER duy nhất đã dùng cho bước sau, trả needsBeforeUpload: true để caller
//   upload thêm 1 ảnh BEFORE_REPAIR riêng (tránh ghi đè FK đơn procedure_step_id trên backend).
export function pickStepPhotoAllocation(
  stepsNeedingPhoto = [],
  { afterPhotoIds = [], otherPhotoIds = [] } = {},
) {
  const safeSteps = Array.isArray(stepsNeedingPhoto) ? stepsNeedingPhoto : [];
  const afterPool = [...new Set((afterPhotoIds || []).filter((id) => id != null && id !== ''))];
  const otherPool = [...new Set((otherPhotoIds || []).filter((id) => id != null && id !== ''))];
  const usedIds = new Set();
  const allocations = new Map();

  const takeUnused = (pool) => {
    for (const id of pool) {
      const key = String(id);
      if (!usedIds.has(key)) {
        usedIds.add(key);
        return id;
      }
    }
    return null;
  };

  // Phân bổ cho các bước step_no > 1 trước (từ cuối về đầu).
  const laterSteps = safeSteps
    .filter((st) => Number(st?.step_no) > 1)
    .sort((a, b) => (Number(b?.step_no) || 0) - (Number(a?.step_no) || 0));

  for (const st of laterSteps) {
    const id = takeUnused(afterPool) ?? takeUnused(otherPool) ?? afterPool[0] ?? otherPool[0] ?? null;
    allocations.set(st.step_id, {
      stepId: st.step_id,
      stepNo: st.step_no,
      photoId: id,
      fallbackPhotoId: id,
      needsBeforeUpload: false,
    });
  }

  // Phân bổ cho bước step_no <= 1 (ưu tiên ảnh chưa dùng để không đè FK của bước sau).
  const firstSteps = safeSteps.filter((st) => !(Number(st?.step_no) > 1));
  for (const st of firstSteps) {
    const uniqueId = takeUnused(otherPool) ?? takeUnused(afterPool);
    if (uniqueId != null) {
      allocations.set(st.step_id, {
        stepId: st.step_id,
        stepNo: st.step_no,
        photoId: uniqueId,
        fallbackPhotoId: uniqueId,
        needsBeforeUpload: false,
      });
    } else {
      const fallbackId = afterPool[0] ?? otherPool[0] ?? null;
      allocations.set(st.step_id, {
        stepId: st.step_id,
        stepNo: st.step_no,
        photoId: null,
        fallbackPhotoId: fallbackId,
        needsBeforeUpload: true,
      });
    }
  }

  return allocations;
}
