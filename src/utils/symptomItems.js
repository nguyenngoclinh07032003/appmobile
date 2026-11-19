// Tiện ích xử lý dữ liệu Triệu chứng thiết bị (tách/ghép chuỗi symptoms, ảnh [Triệu chứng] và hướng xử lý Thay thế / Sửa chữa)
// Dùng chung giữa App Thợ (SymptomSection / useQuoteDraft) và App Khách (SymptomBreakdownView).

export const SYMPTOM_PHOTO_PREFIX = '[Triệu chứng] ';

export const splitSymptomTokens = (s) =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export const formatSymptomPhotoNote = (title, action = '') => {
  const clean = String(title || '').trim();
  if (!clean) return '';
  const suffix = action === 'replace' ? ' (Thay thế)' : action === 'repair' ? ' (Sửa chữa)' : '';
  return `${SYMPTOM_PHOTO_PREFIX}${clean}${suffix}`;
};

export const parseSymptomPhotoMeta = (note) => {
  const s = String(note || '').trim();
  if (!s) return null;
  const body = s.startsWith(SYMPTOM_PHOTO_PREFIX)
    ? s.slice(SYMPTOM_PHOTO_PREFIX.length).trim()
    : s.startsWith('[Triệu chứng]')
      ? s.slice('[Triệu chứng]'.length).trim()
      : null;
  if (!body) return null;
  const m = /^(.+?)\s*\((Thay thế|Sửa chữa)\)\s*$/i.exec(body);
  if (m) {
    return {
      title: m[1].trim(),
      action: /^thay/i.test(m[2]) ? 'replace' : 'repair',
    };
  }
  return { title: body, action: '' };
};

export const parseSymptomPhotoTitle = (note) => parseSymptomPhotoMeta(note)?.title || null;

export function parseSymptomsField(rawSymptoms, evidence = []) {
  const tokens = splitSymptomTokens(rawSymptoms);
  const diagPhotos = (Array.isArray(evidence) ? evidence : []).filter(
    (e) => !e?.stage || e.stage === 'diagnosis',
  );
  const photosForTitle = (title) => {
    const key = String(title || '').trim().toLowerCase();
    return diagPhotos.filter((e) => (parseSymptomPhotoTitle(e?.note) || '').toLowerCase() === key);
  };
  const actionFromPhotos = (matched = []) => {
    for (let i = matched.length - 1; i >= 0; i -= 1) {
      const act = parseSymptomPhotoMeta(matched[i]?.note)?.action;
      if (act) return act;
    }
    return '';
  };
  const photoTitles = new Set(
    diagPhotos
      .map((e) => parseSymptomPhotoTitle(e?.note))
      .filter(Boolean)
      .map((t) => t.toLowerCase()),
  );

  const tags = [];
  const symptomItems = [];
  const seenTitles = new Set();

  tokens.forEach((tok, idx) => {
    const m = /^(.+?)\s*\((Thay thế|Sửa chữa)\)\s*$/i.exec(tok);
    if (m) {
      const cleanTitle = m[1].trim();
      const key = cleanTitle.toLowerCase();
      if (!cleanTitle || seenTitles.has(key)) return;
      seenTitles.add(key);
      const action = /^thay/i.test(m[2]) ? 'replace' : 'repair';
      const matchedPhotos = photosForTitle(cleanTitle);
      symptomItems.push({
        id: `sym_${idx}_${cleanTitle}`,
        title: cleanTitle,
        action,
        localPhotoUri: null,
        photos: matchedPhotos,
        photoUri: matchedPhotos[matchedPhotos.length - 1]?.uri || null,
      });
      return;
    }
    const key = tok.toLowerCase();
    if (photoTitles.has(key)) {
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        const matchedPhotos = photosForTitle(tok);
        symptomItems.push({
          id: `sym_${idx}_${tok}`,
          title: tok,
          action: actionFromPhotos(matchedPhotos),
          localPhotoUri: null,
          photos: matchedPhotos,
          photoUri: matchedPhotos[matchedPhotos.length - 1]?.uri || null,
        });
      }
      return;
    }
    if (!tags.some((t) => t.toLowerCase() === key)) tags.push(tok);
  });

  diagPhotos.forEach((e, idx) => {
    const t = parseSymptomPhotoTitle(e?.note);
    if (!t) return;
    const key = t.toLowerCase();
    if (seenTitles.has(key)) return;
    seenTitles.add(key);
    const matchedPhotos = photosForTitle(t);
    symptomItems.push({
      id: `sym_ev_${idx}_${t}`,
      title: t,
      action: actionFromPhotos(matchedPhotos),
      localPhotoUri: null,
      photos: matchedPhotos,
      photoUri: matchedPhotos[matchedPhotos.length - 1]?.uri || null,
    });
  });

  return { tags, symptomItems };
}

export function buildSymptomsSummary(tags = [], symptomItems = []) {
  const itemTitles = new Set(
    (symptomItems || [])
      .map((it) => String(it?.title || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const parts = [];
  (tags || []).forEach((t) => {
    const clean = String(t || '').trim();
    if (clean && !itemTitles.has(clean.toLowerCase()) && !parts.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      parts.push(clean);
    }
  });
  (symptomItems || []).forEach((it) => {
    const title = String(it?.title || '').trim();
    if (!title) return;
    const label = it.action === 'replace'
      ? `${title} (Thay thế)`
      : it.action === 'repair'
        ? `${title} (Sửa chữa)`
        : title;
    parts.push(label);
  });
  return parts.join(', ');
}

export function buildSymptomRecommendationFallback(symptomItems = []) {
  const replaces = (symptomItems || [])
    .filter((it) => it?.action === 'replace')
    .map((it) => String(it.title || '').trim())
    .filter(Boolean);
  const repairs = (symptomItems || [])
    .filter((it) => it?.action === 'repair')
    .map((it) => String(it.title || '').trim())
    .filter(Boolean);
  const parts = [];
  if (replaces.length) parts.push(`Thay thế: ${replaces.join(', ')}`);
  if (repairs.length) parts.push(`Sửa chữa: ${repairs.join(', ')}`);
  return parts.join('; ');
}

export function stripSymptomsPrefixFromDiagnosis(diagnosis, rawSymptoms, tags = [], symptomItems = []) {
  let out = String(diagnosis || '').trim();
  const rawSym = String(rawSymptoms || '').trim();
  const formattedSym = buildSymptomsSummary(tags, symptomItems);
  for (const prefix of [rawSym, formattedSym]) {
    if (!prefix) continue;
    if (out.startsWith(`${prefix}. `)) {
      return out.slice(prefix.length + 2).trim();
    }
    if (out === prefix) {
      return '';
    }
  }
  return out;
}

export function stripAutoRecommendationPrefix(recommendation, symptomItems = []) {
  const text = String(recommendation || '').trim();
  if (!text || !Array.isArray(symptomItems) || symptomItems.length === 0) return text;
  const autoReco = buildSymptomRecommendationFallback(symptomItems);
  if (!autoReco) return text;
  const lowerText = text.toLowerCase();
  const lowerAuto = autoReco.toLowerCase();
  if (lowerText === lowerAuto) return '';
  if (lowerText.startsWith(`${lowerAuto}. `)) return text.slice(autoReco.length + 2).trim();
  if (lowerText.startsWith(`${lowerAuto}.`)) return text.slice(autoReco.length + 1).trim();
  if (lowerText.startsWith(`${lowerAuto}; `)) return text.slice(autoReco.length + 2).trim();
  return text;
}
