// Tiện ích xử lý Bảo hành linh kiện (material_warranty): trạng thái, trích xuất từ báo giá,
// kiểm tra hợp lệ và tạo payload khi thợ lập báo giá hoặc chốt giá vật tư mua ngoài.
// Giữ thuần JS không phụ thuộc React Native.
import { sortQuotationsAsc, parseExternalPartDesc } from './externalPartsPricing.js';

export const MATERIAL_WARRANTY_STATUS_META = {
  PENDING: { label: 'Chờ kích hoạt', tone: 'neutral' },
  VALID: { label: 'Còn bảo hành', tone: 'green' },
  EXPIRING_SOON: { label: 'Sắp hết hạn', tone: 'gold' },
  OUT_OF_WARRANTY: { label: 'Hết bảo hành', tone: 'muted' },
  REPLACED: { label: 'Đã đổi linh kiện', tone: 'primary' },
  VOID: { label: 'Đã huỷ bảo hành', tone: 'red' },
};

export function extractMaterialWarrantiesFromQuotations(quotations = []) {
  const list = sortQuotationsAsc(quotations);
  const out = [];
  for (const q of list) {
    for (const it of (Array.isArray(q?.items) ? q.items : [])) {
      const warranties = Array.isArray(it?.warranties) ? it.warranties : [];
      if (!warranties.length) continue;
      const extMeta = parseExternalPartDesc(it.description_snapshot);
      const itemName = extMeta?.cleanName || it.description_snapshot || 'Linh kiện / vật tư';
      const finAtt = it?.receipt_attachment && typeof it.receipt_attachment === 'object' ? it.receipt_attachment : null;
      const receiptAttachmentId = it.receipt_attachment_id ?? finAtt?.attachment_id ?? finAtt?.id ?? null;
      const receiptUrl = it.receipt_url || it.receipt_image_url || finAtt?.image_url || finAtt?.file_url || finAtt?.url || finAtt?.uri || null;
      const isExternalPurchase = Boolean(it.is_external_purchase || it.external_purchase || (it.item_type === 'MATERIAL' && !it.material_id));

      for (const w of warranties) {
        if (!w || typeof w !== 'object') continue;
        const status = String(w.status || 'PENDING').trim().toUpperCase();
        out.push({
          id: w.material_warranty_id ?? w.warranty_id ?? w.id ?? `${it.quotation_item_id || 'item'}_${out.length}`,
          quotationId: q.quotation_id ?? null,
          quotationStatus: q.quotation_status ?? null,
          itemId: it.quotation_item_id ?? null,
          itemName,
          quantity: Math.max(1, Number(it.quantity) || 1),
          isExternalPurchase,
          receiptAttachmentId,
          receiptUrl,
          serialNumber: w.serial_number || null,
          externalWarrantyCode: w.external_warranty_code || null,
          warrantyDays: w.warranty_days != null ? Number(w.warranty_days) : null,
          startsAt: w.starts_at || null,
          expiresAt: w.expires_at || null,
          remainingDays: w.remaining_days != null ? Number(w.remaining_days) : null,
          status,
          replacesId: w.replaces_id ?? null,
          statusReason: w.status_reason || null,
          statusChangedAt: w.status_changed_at || null,
        });
      }
    }
  }
  return out;
}

export function validateQuoteItemWarrantyFields({
  isExternalPurchase = false,
  warrantyDays = '',
  externalWarrantyCode = '',
  serialNumber = '',
} = {}) {
  const sn = String(serialNumber ?? '').trim();
  if (sn.length > 100) {
    return { ok: false, error: 'Số sê-ri linh kiện tối đa 100 ký tự.' };
  }
  if (!isExternalPurchase) {
    return { ok: true };
  }
  const code = String(externalWarrantyCode ?? '').trim();
  if (code.length > 100) {
    return { ok: false, error: 'Mã phiếu bảo hành hãng tối đa 100 ký tự.' };
  }
  const daysRaw = warrantyDays == null ? '' : String(warrantyDays).trim();
  if (code && !daysRaw) {
    return { ok: false, error: 'Khi nhập mã phiếu bảo hành hãng, cần nhập số ngày bảo hành (1–3650).' };
  }
  if (daysRaw) {
    const n = Number(daysRaw);
    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      return { ok: false, error: 'Số ngày bảo hành linh kiện mua ngoài phải là số nguyên từ 1 đến 3650 ngày.' };
    }
  }
  return { ok: true };
}

export function buildQuoteItemWarrantyPayload({
  isMaterial = false,
  isExternalPurchase = false,
  warrantyDays = null,
  externalWarrantyCode = null,
  serialNumber = null,
} = {}) {
  if (!isMaterial) return {};
  const payload = {};
  const sn = String(serialNumber ?? '').trim();
  if (sn) {
    payload.serial_number = sn.slice(0, 100);
  }
  // Vật tư HRMSS (có material_id) KHÔNG được gửi warranty_days hay external_warranty_code.
  if (isExternalPurchase) {
    const daysRaw = warrantyDays == null ? '' : String(warrantyDays).trim();
    const n = daysRaw ? Number(daysRaw) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 3650) {
      payload.warranty_days = n;
      const code = String(externalWarrantyCode ?? '').trim();
      if (code) {
        payload.external_warranty_code = code.slice(0, 100);
      }
    }
  }
  return payload;
}
