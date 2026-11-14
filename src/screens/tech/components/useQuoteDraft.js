// Bản nháp báo giá của thợ (triệu chứng, chẩn đoán, đề xuất, dòng chi phí).
// Đồng bộ lại khi báo giá trên server đổi (id / revision / updatedAt / trạng thái), nhưng KHÔNG ghi đè
// khi thợ đang sửa dở (dirty). Gửi xong (hoặc bấm "Lấy lại bản trên hệ thống") thì hết dirty.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getService } from '../../../constants/data.js';

const splitTags = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// Chữ ký nhận biết "báo giá server đã đổi".
export const quoteSignature = (q) => {
  if (!q) return 'none';
  return [
    q.id ?? q.quoteId ?? q.quote_id ?? '',
    q.revision ?? q.version ?? '',
    q.updatedAt ?? q.updated_at ?? q.at ?? '',
    q.total ?? '',
    q.approved ? 1 : 0,
    q.revisionRequested ? 1 : 0,
    (q.lines || []).length,
  ].join('|');
};

export function draftFromOrder(o) {
  const q = o?.quote;
  const tags = splitTags(q?.symptoms);
  let diagnosis = q?.diagnosis || '';
  // Lúc gửi, chẩn đoán được ghép "triệu chứng. kết luận" -> tách lại để không nhân đôi phần triệu chứng.
  const symptomsText = tags.join(', ');
  if (symptomsText && diagnosis.startsWith(`${symptomsText}. `)) diagnosis = diagnosis.slice(symptomsText.length + 2);
  else if (symptomsText && diagnosis === symptomsText) diagnosis = '';
  const items = o?.items || [];
  const bookedNameSet = new Set(items.map((it) => String(it.name || '').trim().toLowerCase()));
  const bookedIdSet = new Set(items.map((it) => it.id));

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
        price: o?.kind === 'warranty' ? 0 : unitPrice,
        unit: 'lần',
        isOriginal: true,
      };
    });
  return { tags, diagnosis, recommendation: q?.recommendation || '', lines };
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

  useEffect(() => {
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (dirtyRef.current) return; // đang sửa dở -> giữ bản của thợ
    setDraft(draftFromOrder(orderRef.current));
  }, [sig]);

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
    dirty,
    setTags: makeSetter('tags'),
    setDiagnosis: makeSetter('diagnosis'),
    setRecommendation: makeSetter('recommendation'),
    setLines: makeSetter('lines'),
    markSaved: () => markDirty(false),
    resetFromServer,
    total: draft.lines.reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 0), 0),
  };
}
