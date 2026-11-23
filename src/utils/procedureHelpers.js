// Tiện ích thuần JS xử lý các bước quy trình kỹ thuật của công việc (procedure steps).
// Tách riêng không phụ thuộc React Native để dùng chung cho AppContext, UI và bộ kiểm thử Node.

export function flattenProcedureSteps(procedure) {
  if (!procedure || !Array.isArray(procedure.services)) return [];
  return procedure.services.flatMap((sv) =>
    (Array.isArray(sv?.steps) ? sv.steps : []).map((st) => ({
      ...st,
      service_name: sv?.service_name || '',
    })),
  );
}

export function stepRequiresMeasures(step) {
  return Array.isArray(step?.measures) && step.measures.length > 0;
}

// Chỉ chặn hoàn thành khi còn bước bắt buộc ở trạng thái PENDING nhưng đòi hỏi thợ nhập chỉ số đo cụ thể.
export function getBlockingProcedureSteps(procedure) {
  return flattenProcedureSteps(procedure).filter(
    (st) => st.is_required && st.status === 'PENDING' && stepRequiresMeasures(st),
  );
}

// Các bước bắt buộc PENDING không có chỉ số đo bắt buộc -> có thể tự động đồng bộ DONE khi nộp biên bản.
export function getAutoCompletableProcedureSteps(procedure) {
  return flattenProcedureSteps(procedure).filter(
    (st) => st.is_required && st.status === 'PENDING' && !stepRequiresMeasures(st),
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
