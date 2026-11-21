// Hiển thị chi tiết Triệu chứng & Chẩn đoán theo cấu trúc Collapsible khớp 1-1 với màn Thợ (SymptomSection).
// Mỗi triệu chứng là 1 Collapsible gồm tiêu đề triệu chứng, ảnh tình trạng đính kèm (nếu có) và hướng giải quyết (Thay thế / Sửa chữa).
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { C, R } from '../../theme';
import { AppIcon, Sheet, Tap } from '../common';
import {
  parseSymptomPhotoMeta,
  parseSymptomsField,
  stripAutoRecommendationPrefix,
  stripSymptomsPrefixFromDiagnosis,
} from '../../utils/symptomItems';

export function SymptomBreakdownView({
  symptoms = '',
  diagnosis = '',
  recommendation = '',
  evidence = [],
  initialAttachments = [],
  defaultExpandFirst = false,
  autoExpandWithPhoto = true,
}) {
  const { tags, symptomItems } = parseSymptomsField(symptoms, evidence);
  const cleanDiagnosis = stripSymptomsPrefixFromDiagnosis(diagnosis, symptoms, tags, symptomItems);
  const cleanRecommendation = stripAutoRecommendationPrefix(recommendation, symptomItems);

  // Ảnh triệu chứng / hiện trạng ban đầu (khách gửi khi đặt đơn hoặc ảnh chẩn đoán chung không gắn nhãn [Triệu chứng] riêng)
  const initialSymptomPhotos = [];
  const seenInitial = new Map();
  const pushInitialPhoto = (raw, fromCustomerList = false) => {
    if (!raw?.uri) return;
    const key = raw.dbAttachmentId != null ? `id:${raw.dbAttachmentId}` : `uri:${raw.uri}`;
    const existing = seenInitial.get(key);
    if (existing) {
      if (fromCustomerList || raw.isCustomerInitial) existing.isCustomerInitial = true;
      if (!existing.note && raw.note) existing.note = raw.note;
      return;
    }
    const entry = {
      id: raw.id || (raw.dbAttachmentId != null ? `att-${raw.dbAttachmentId}` : key),
      dbAttachmentId: raw.dbAttachmentId ?? null,
      uri: raw.uri,
      note: raw.note || '',
      isCustomerInitial: Boolean(fromCustomerList || raw.isCustomerInitial),
    };
    seenInitial.set(key, entry);
    initialSymptomPhotos.push(entry);
  };
  (Array.isArray(initialAttachments) ? initialAttachments : []).forEach((att) => pushInitialPhoto(att, true));
  (Array.isArray(evidence) ? evidence : []).forEach((e) => {
    if (e?.stage === 'diagnosis' && !parseSymptomPhotoMeta(e?.note)) {
      pushInitialPhoto(e, Boolean(e.isCustomerInitial));
    }
  });

  const [expandedIds, setExpandedIds] = useState(() => {
    const map = {};
    if (defaultExpandFirst && symptomItems.length) map[symptomItems[0].id] = true;
    if (autoExpandWithPhoto) {
      symptomItems.forEach((it) => {
        if (it?.photoUri || it?.photos?.length) map[it.id] = true;
      });
    }
    return map;
  });
  const [hasInteracted, setHasInteracted] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const autoExpandSignature = symptomItems
    .filter(
      (it, idx) =>
        (autoExpandWithPhoto && (it?.photoUri || it?.photos?.length)) ||
        (defaultExpandFirst && idx === 0),
    )
    .map((it) => it.id)
    .join('|');

  useEffect(() => {
    if (hasInteracted || !autoExpandSignature) return;
    setExpandedIds((prev) => {
      const next = { ...prev };
      let changed = false;
      autoExpandSignature.split('|').forEach((id) => {
        if (id && !next[id]) {
          next[id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [hasInteracted, autoExpandSignature]);

  if (!tags.length && !symptomItems.length && !initialSymptomPhotos.length && !cleanDiagnosis && !cleanRecommendation) {
    return null;
  }

  const toggle = (id) => {
    setHasInteracted(true);
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <View style={st.wrap}>
      {tags.length > 0 ? (
        <View style={st.tagRow}>
          {tags.map((t) => (
            <View key={t} style={st.tagPill}>
              <Text style={st.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {initialSymptomPhotos.length > 0 ? (
        <View style={st.initialWrap}>
          <Text style={st.secLabel}>Hình ảnh triệu chứng ban đầu ({initialSymptomPhotos.length})</Text>
          <View style={st.photoRow}>
            {initialSymptomPhotos.map((ph, idx) => {
              const caption = ph.note || (ph.isCustomerInitial ? 'Khách đính kèm' : 'Kiểm tra ban đầu');
              return (
                <View key={ph.id || `init_ph_${idx}`} style={st.initialCard}>
                  <Tap
                    onPress={() =>
                      setPreviewPhoto({
                        uri: ph.uri,
                        title: ph.note || (ph.isCustomerInitial ? 'Hình ảnh triệu chứng ban đầu (Khách gửi)' : 'Hình ảnh triệu chứng ban đầu'),
                      })
                    }
                    style={st.thumb}
                    scaleTo={0.97}
                  >
                    <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                  </Tap>
                  <Text style={st.initialCap} numberOfLines={1}>{caption}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {symptomItems.length > 0 ? (
        <View style={st.listWrap}>
          <Text style={st.secLabel}>Chi tiết triệu chứng ({symptomItems.length})</Text>
          {symptomItems.map((item) => {
            const isOpen = Boolean(expandedIds[item.id]);
            const actionLabel = item.action === 'replace' ? 'Thay thế' : item.action === 'repair' ? 'Sửa chữa' : '';
            const badgeStyle =
              item.action === 'replace'
                ? { bg: C.goldSoft, fg: C.goldInk, bd: C.goldBorder }
                : { bg: C.primarySoft, fg: C.primary, bd: C.primaryBorder };

            return (
              <View key={item.id} style={st.card}>
                <Tap onPress={() => toggle(item.id)} style={st.head} scaleTo={0.99}>
                  <View style={[st.chevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>
                    <AppIcon name="chevron-right" size={15} color={C.ink2} strokeWidth={2.5} />
                  </View>
                  <Text style={st.title} numberOfLines={2}>{item.title}</Text>
                  <View style={st.headRight}>
                    {!isOpen && item.photoUri ? (
                      <Image source={{ uri: item.photoUri }} style={st.miniThumb} />
                    ) : item.photoUri ? (
                      <View style={st.photoDot}>
                        <AppIcon name="camera" size={12} color={C.green} strokeWidth={2.4} />
                      </View>
                    ) : null}
                    {actionLabel ? (
                      <View style={[st.badge, { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.bd }]}>
                        <Text style={[st.badgeText, { color: badgeStyle.fg }]}>{actionLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                </Tap>

                {isOpen ? (
                  <View style={st.body}>
                    <Text style={st.subLabel}>Hình ảnh tình trạng</Text>
                    {item.photos?.length ? (
                      <View style={st.photoRow}>
                        {item.photos.map((ph, idx) => (
                          <Tap
                            key={ph.id || `${item.id}_ph_${idx}`}
                            onPress={() => ph.uri && setPreviewPhoto({ uri: ph.uri, title: item.title })}
                            style={st.thumb}
                            scaleTo={0.97}
                          >
                            {ph.uri ? (
                              <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                            ) : (
                              <AppIcon name="camera" size={20} color={C.muted} />
                            )}
                          </Tap>
                        ))}
                      </View>
                    ) : (
                      <Text style={st.emptyText}>Không đính kèm ảnh riêng</Text>
                    )}

                    <Text style={[st.subLabel, { marginTop: 10 }]}>Hướng giải quyết</Text>
                    {item.action === 'replace' ? (
                      <View style={[st.actionBox, st.actionReplace]}>
                        <AppIcon name="refresh-cw" size={14} color={C.goldInk} strokeWidth={2.4} />
                        <Text style={[st.actionText, { color: C.goldInk }]}>Thay thế</Text>
                      </View>
                    ) : item.action === 'repair' ? (
                      <View style={[st.actionBox, st.actionRepair]}>
                        <AppIcon name="hammer" size={14} color={C.primary} strokeWidth={2.4} />
                        <Text style={[st.actionText, { color: C.primary }]}>Sửa chữa</Text>
                      </View>
                    ) : (
                      <Text style={st.emptyText}>Chưa ghi nhận hướng giải quyết</Text>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {cleanDiagnosis ? (
        <Text style={st.metaLine}>
          <Text style={st.metaBold}>Chẩn đoán: </Text>
          {cleanDiagnosis}
        </Text>
      ) : null}

      {cleanRecommendation ? (
        <Text style={st.metaLine}>
          <Text style={st.metaBold}>Đề xuất xử lý: </Text>
          {cleanRecommendation}
        </Text>
      ) : null}

      <Sheet
        visible={Boolean(previewPhoto)}
        onClose={() => setPreviewPhoto(null)}
        title={previewPhoto?.title || 'Hình ảnh triệu chứng'}
      >
        {previewPhoto?.uri ? (
          <Image source={{ uri: previewPhoto.uri }} style={st.previewImg} resizeMode="contain" />
        ) : null}
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  tagText: { fontSize: 12, fontWeight: '700', color: C.ink2 },
  listWrap: { gap: 6 },
  secLabel: { fontSize: 12.5, fontWeight: '800', color: C.ink, marginBottom: 2 },
  card: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 11,
    backgroundColor: C.card,
  },
  chevron: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 13.5, fontWeight: '800', color: C.ink },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniThumb: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
  },
  initialWrap: { gap: 4, marginBottom: 2 },
  initialCard: { width: 78, gap: 3 },
  initialCap: { fontSize: 10.5, color: C.muted, textAlign: 'center', fontWeight: '600' },
  photoDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  body: {
    padding: 11,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
  subLabel: { fontSize: 11.5, fontWeight: '800', color: C.ink2, marginBottom: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: {
    width: 78,
    height: 78,
    borderRadius: R.md,
    overflow: 'hidden',
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 12, color: C.muted, fontStyle: 'italic' },
  actionBox: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: R.sm,
    borderWidth: 1,
  },
  actionReplace: { borderColor: C.goldBorder, backgroundColor: C.goldSoft },
  actionRepair: { borderColor: C.primaryBorder, backgroundColor: C.primarySoft },
  actionText: { fontSize: 12.5, fontWeight: '800' },
  metaLine: { fontSize: 13, color: C.ink2, lineHeight: 19 },
  metaBold: { fontWeight: '700', color: C.ink },
  previewImg: {
    width: '100%',
    height: 280,
    borderRadius: R.md,
    backgroundColor: C.surface,
  },
});
