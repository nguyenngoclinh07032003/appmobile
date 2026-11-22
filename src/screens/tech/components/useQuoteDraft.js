// Bản nháp báo giá của thợ (triệu chứng, chẩn đoán, đề xuất, dòng chi phí).
// Đồng bộ lại khi báo giá trên server đổi (id / revision / updatedAt / trạng thái), nhưng KHÔNG ghi đè
// khi thợ đang sửa dở (dirty). Gửi xong (hoặc bấm "Lấy lại bản trên hệ thống") thì hết dirty.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getService } from '../../../constants/data.js';
import {
  SYMPTOM_PHOTO_PREFIX,
  formatSymptomPhotoNote,
  parseSymptomPhotoMeta,
  parseSymptomPhotoTitle,
  parseSymptomsField,
  buildSymptomsSummary,
  buildSymptomRecommendationFallback,
  stripSymptomsPrefixFromDiagnosis,
  stripAutoRecommendationPrefix,
} from '../../../utils/symptomItems.js';

export {
  SYMPTOM_PHOTO_PREFIX,
  formatSymptomPhotoNote,
  parseSymptomPhotoMeta,
  parseSymptomPhotoTitle,
  parseSymptomsField,
  buildSymptomsSummary,
  buildSymptomRecommendationFallback,
};

// Chữ ký nhận biết "báo giá server đã đổi".
export const quoteSignature = (q) => {
  if (!q) return 'none';
  const lineSig = (q.lines || [])
    .map((l) => `${l.name || ''}:${l.qty || 1}:${l.price || 0}:${l.minPrice || ''}-${l.maxPrice || ''}:${l.isEstimatedRange ? 1 : 0}:${l.isFinalizedExternal ? 1 : 0}`)
    .join(',');
  return [
    q.id ?? q.quoteId ?? q.quote_id ?? q.dbQuotationId ?? '',
    q.revision ?? q.version ?? '',
    q.updatedAt ?? q.updated_at ?? q.at ?? '',
    q.symptoms ?? '',
    q.diagnosis ?? '',
    q.total ?? '',
    q.approved ? 1 : 0,
    q.revisionRequested ? 1 : 0,
    (q.lines || []).length,
    lineSig,
  ].join('|');
};

// Thợ đã check-in tại nhà khách: mọi báo giá gửi lúc này là báo giá PHÁT SINH (server: SUPPLEMENTAL), được
// CỘNG THÊM vào giá khách đã đặt -> chỉ chứa phần làm thêm, không chứa lại dịch vụ đã đặt (server trả 400
// QUOTATION_DUPLICATES_BOOKED_SERVICE, bản server cũ thì tính tiền 2 lần).
export const isOnSiteQuote = (o) => Boolean(
  !(!o?.arrivedAt && !o?.checkIn && o?.status === 'diagnosing' && o?.quote?.revisionRequested && !o?.quote?.isSupplemental) &&
  (o?.arrivedAt || o?.checkIn || ['diagnosing', 'repairing', 'out_of_warranty'].includes(o?.status)),
);

const quotePhaseOf = (o) => {
  const pricingKey = (o?.status === 'out_of_warranty' || o?.outOfWarranty) ? 'paid' : (o?.kind || 'normal');
  return `${isOnSiteQuote(o) ? 'site' : 'pre'}:${pricingKey}`;
};

export function draftFromOrder(o) {
  const q = o?.quote;
  const onSite = isOnSiteQuote(o);
  const isFreeWarranty = o?.kind === 'warranty' && !o?.outOfWarranty && o?.status !== 'out_of_warranty';
  const { tags, symptomItems } = parseSymptomsField(q?.symptoms, o?.evidence || []);
  // Lúc gửi, chẩn đoán được ghép "triệu chứng. kết luận" -> tách lại để không nhân đôi phần triệu chứng.
  const diagnosis = stripSymptomsPrefixFromDiagnosis(q?.diagnosis || '', q?.symptoms, tags, symptomItems);
  const cleanedReco = stripAutoRecommendationPrefix(q?.recommendation || '', symptomItems);
  const recommendation = q?.recommendation ? cleanedReco : (q ? 'Thực hiện dịch vụ và hạng mục vật tư theo báo giá' : '');
  const items = o?.items || [];
  const bookedNameSet = new Set(items.map((it) => String(it.name || '').trim().toLowerCase()));
  const bookedIdSet = new Set(items.map((it) => it.id));

  // Tại nhà khách: nạp dịch vụ ban đầu để hiển thị đầy đủ, và nạp các dòng phát sinh (nếu có).
  if (onSite) {
    const bookedLines = items.map((it) => ({
      key: it.id,
      type: 'labor',
      name: it.name || getService(it.id)?.name || 'Dịch vụ',
      qty: Math.max(1, Number(it.qty) || 1),
      price: isFreeWarranty ? 0 : (it.price != null ? Number(it.price) : (getService(it.id)?.price || 0)),
      unit: 'lần',
      isOriginal: true,
    }));
    // Báo giá trước đó ĐÃ ĐƯỢC KHÁCH DUYỆT (đã nằm trong hoá đơn) → "Thêm phát sinh" là một báo giá phụ MỚI:
    // không nạp lại các dòng đã duyệt, nếu không gửi lên sẽ bị cộng thêm lần nữa (khách trả 2 lần).
    // Chỉ nạp lại khi báo giá chưa duyệt (khách yêu cầu báo giá lại) để thợ chỉnh sửa.
    const revising = q?.approved ? [] : (q?.lines || []).filter((l) => !l.isOriginal && !l.isPriorApproved);
    const lines = [
      ...bookedLines,
      ...revising
        .filter((l) => !(l.type !== 'part' && !l.matId && bookedNameSet.has(String(l.name || '').trim().toLowerCase())))
        .map((l, idx) => ({ ...l, key: l.matId || l.key || `q_${idx}`, isOriginal: false })),
    ];
    return {
      tags,
      symptomItems,
      diagnosis,
      recommendation,
      lines,
    };
  }

  const lines = q?.lines?.length
    ? q.lines.map((l, idx) => {
        const isPart = l.type === 'part' || Boolean(l.matId);
        const nameClean = String(l.name || '').trim().toLowerCase();
        const matchesBooked = !isPart && (bookedIdSet.has(l.key) || bookedNameSet.has(nameClean));
        return {
          ...l,
          key: l.matId || l.key || `q_${idx}`,
          type: isPart ? 'part' : (l.type || 'service'),
          unit: l.unit || (isPart ? 'cái' : 'lần'),
          isOriginal: matchesBooked,
          isCustom: l.isCustom !== undefined ? l.isCustom : (!matchesBooked && !isPart),
        };
      })
    : items.map((it) => {
      const sv = getService(it.id);
      const unitPrice = it.price != null ? Number(it.price) : (sv?.price || 0);
      return {
        key: it.id,
        type: 'labor',
        name: it.name || sv?.name || 'Dịch vụ',
        qty: Math.max(1, Number(it.qty) || 1),
        price: isFreeWarranty ? 0 : unitPrice,
        unit: 'lần',
        isOriginal: true,
      };
    });
  return {
    tags,
    symptomItems,
    diagnosis,
    recommendation,
    lines,
  };
}

export function useQuoteDraft(o) {
  const [draft, setDraft] = useState(() => draftFromOrder(o));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const orderRef = useRef(o);
  orderRef.current = o;

  const sig = quoteSignature(o?.quote);
  const lastSig = useRef(sig);

  const markDirty = useCallback((v) => { dirtyRef.current = v; setDirty(v); }, []);

  const orderKey = o?.code || '';
  const hasOrder = Boolean(o);
  const lastOrderRef = useRef({ orderKey, hasOrder });
  useEffect(() => {
    if (
      lastOrderRef.current.orderKey === orderKey &&
      lastOrderRef.current.hasOrder === hasOrder
    ) {
      return;
    }
    const switchedOrder = lastOrderRef.current.orderKey !== orderKey;
    lastOrderRef.current = { orderKey, hasOrder };
    if (!switchedOrder && dirtyRef.current) return;
    if (switchedOrder) markDirty(false);
    lastSig.current = quoteSignature(orderRef.current?.quote);
    lastPhase.current = quotePhaseOf(orderRef.current);
    setDraft(draftFromOrder(orderRef.current));
  }, [orderKey, hasOrder, markDirty]);

  useEffect(() => {
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (dirtyRef.current) return; // đang sửa dở -> giữ bản của thợ
    setDraft(draftFromOrder(orderRef.current));
  }, [sig]);

  // Màn việc mở từ trước khi xuất phát rồi thợ check-in: báo giá trên server chưa đổi (chưa có báo giá) nên cơ chế
  // theo quoteSignature ở trên không chạy, bản nháp vẫn còn các dòng dịch vụ đã đặt (đúng cho báo giá trước khi đi).
  // Tại nhà, báo giá là PHÁT SINH (cộng thêm) -> phải làm mới dòng theo giai đoạn mới, kể cả khi đang sửa dở;
  // nếu giữ lại, "Gửi báo giá phát sinh" sẽ gửi lại dịch vụ đã đặt (server mới trả 400, server cũ tính tiền 2 lần).
  const phase = quotePhaseOf(o);
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === lastPhase.current) return;
    lastPhase.current = phase;
    const fresh = draftFromOrder(orderRef.current);
    // Đang sửa dở: chỉ thay dòng chi phí, giữ triệu chứng / chẩn đoán / đề xuất thợ đã nhập. Không sửa dở: lấy bản mới.
    setDraft((p) => (dirtyRef.current ? { ...p, lines: fresh.lines } : fresh));
  }, [phase]);

  const makeSetter = (field) => (valueOrFn) => {
    markDirty(true);
    setDraft((p) => ({ ...p, [field]: typeof valueOrFn === 'function' ? valueOrFn(p[field]) : valueOrFn }));
  };

  // Bỏ bản nháp, lấy lại theo báo giá hiện có trên hệ thống.
  const resetFromServer = useCallback(() => {
    markDirty(false);
    lastSig.current = quoteSignature(orderRef.current?.quote);
    setDraft(draftFromOrder(orderRef.current));
  }, [markDirty]);

  return {
    ...draft,
    symptomItems: draft.symptomItems || [],
    dirty,
    setTags: makeSetter('tags'),
    setSymptomItems: makeSetter('symptomItems'),
    setDiagnosis: makeSetter('diagnosis'),
    setRecommendation: makeSetter('recommendation'),
    setLines: makeSetter('lines'),
    markSaved: () => markDirty(false),
    resetFromServer,
    total: draft.lines.reduce((sum, l) => sum + (l.isEstimatedRange ? (Number(l.minPrice) || 0) : (Number(l.price) || 0)) * (Number(l.qty) || 0), 0),
  };
}
