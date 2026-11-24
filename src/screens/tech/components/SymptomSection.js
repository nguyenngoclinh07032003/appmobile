// Khối "Triệu chứng & chẩn đoán" của thợ: 4 bước rõ ràng, chạm là chọn, hạn chế phải gõ phím.
// 1. Triệu chứng: gợi ý theo loại thiết bị + triệu chứng chung, chọn nhiều; thêm được triệu chứng khác.
// 2. Kết luận chẩn đoán / 3. Đề xuất xử lý: ô nhập + cụm từ gợi ý chạm để chèn (chạm lại để bỏ).
// 4. Ảnh minh chứng chẩn đoán.
// Chỉ đổi giao diện: dữ liệu vẫn là tags / diagnosis / recommendation của useQuoteDraft, ảnh qua addEvidence.
import React, { useState } from 'react';
import { View, Text, Image, TextInput, StyleSheet } from 'react-native';
import { C, R } from '../../../theme';
import { DIAG_TAGS, DIAG_FINDINGS, DIAG_ACTIONS, categorySlugOf } from '../../../constants/data';
import { Tap, Card, Field, AppIcon } from '../../../components';
import { parseSymptomPhotoTitle } from './useQuoteDraft';

// Chèn / bỏ một cụm từ gợi ý trong ô văn bản (ngăn cách bằng dấu phẩy).
const escapeRe = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRegex = (phrase) => new RegExp(`(^|[,;.\\n]\\s*)${escapeRe(phrase)}(?=\\s*[,;.\\n]|$)`, 'i');
const hasPhrase = (text, phrase) => phraseRegex(phrase).test(String(text || '').trim());
const togglePhrase = (text, phrase) => {
  const cur = String(text || '').trim();
  if (hasPhrase(cur, phrase)) {
    const removed = cur
      .replace(new RegExp(`(^|[,;.\\n]\\s*)${escapeRe(phrase)}(?=\\s*[,;.\\n]|$)`, 'gi'), '$1')
      .replace(/^[,;.\s]+|[,;\s]+$/g, '')
      .replace(/\s*([,;])\s*(?=[,;])/g, '$1')
      .replace(/\s*,\s*/g, ', ')
      .trim();
    if (removed !== cur) return removed;
  }
  if (!cur) return phrase;
  return `${cur.replace(/[,;.\s]+$/, '')}, ${phrase}`;
};

function StepHead({ no, title, hint, done, open, onPress, right }) {
  return (
    <Tap onPress={onPress} scaleTo={0.99} style={[st.stepHead, open && st.stepHeadOpen]}>
      <View style={[st.stepNo, done && st.stepNoDone]}>
        {done ? <AppIcon name="check" size={13} color="#fff" strokeWidth={3} /> : <Text style={st.stepNoText}>{no}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.stepTitle}>{title}</Text>
        {hint ? <Text style={st.stepHint} numberOfLines={1}>{hint}</Text> : null}
      </View>
      {right || null}
      <View style={[st.stepChevron, open && { transform: [{ rotate: '90deg' }] }]}>
        <AppIcon name="chevron-right" size={15} color={C.muted} strokeWidth={2.5} />
      </View>
    </Tap>
  );
}

function TogglePill({ label, on, onPress, onRemove, tone = 'primary' }) {
  const color = tone === 'amber' ? '#B45309' : C.primary;
  const soft = tone === 'amber' ? '#FFFBEB' : C.primarySoft;
  return (
    <Tap onPress={onPress} scaleTo={0.96} style={[st.pill, on && { backgroundColor: soft, borderColor: color }]}>
      <View style={[st.pillDot, on && { backgroundColor: color, borderColor: color }]}>
        {on ? <AppIcon name="check" size={10} color="#fff" strokeWidth={3.2} /> : null}
      </View>
      <Text style={[st.pillText, on && { color, fontWeight: '700' }]}>{label}</Text>
      {onRemove ? (
        <Tap onPress={onRemove} hitSlop={8} style={{ marginLeft: 2 }}>
          <AppIcon name="x" size={13} color={color} strokeWidth={2.6} />
        </Tap>
      ) : null}
    </Tap>
  );
}

function QuickPhrases({ items, value, onChange }) {
  if (!items.length) return null;
  return (
    <View style={st.quickWrap}>
      {items.map((p) => {
        const on = hasPhrase(value, p);
        return (
          <Tap key={p} onPress={() => onChange(togglePhrase(value, p))} scaleTo={0.96} style={[st.quick, on && st.quickOn]}>
            <AppIcon name={on ? 'check' : 'plus'} size={11} color={on ? C.green : C.muted} strokeWidth={2.8} />
            <Text style={[st.quickText, on && { color: C.green }]}>{p}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

export function SymptomSection({
  cats = [],
  draft,
  evidence = [],
  busySymptomPhotoId,
  onPickSymptomPhoto,
  onRemoveSymptomPhoto,
  onRemoveSymptomItem,
  onChangeSymptomAction,
}) {
  const {
    tags = [],
    setTags,
    symptomItems = [],
    setSymptomItems,
    diagnosis,
    setDiagnosis,
    recommendation,
    setRecommendation,
  } = draft;
  const [symptomInput, setSymptomInput] = useState('');
  const [expandedIds, setExpandedIds] = useState({});
  const [cardOpen, setCardOpen] = useState(false);
  const [openStep, setOpenStep] = useState(1);

  const resolvedCats = [...new Set(cats.flatMap((c) => [c, categorySlugOf(c)]).filter(Boolean))];
  const deviceTags = [...new Set(resolvedCats.flatMap((c) => DIAG_TAGS[c] || []))];
  const customTags = tags.filter((t) => !deviceTags.includes(t));
  const findings = [...new Set([...resolvedCats.flatMap((c) => DIAG_FINDINGS[c] || []), ...(DIAG_FINDINGS.all || [])])];
  const actions = [...new Set([...resolvedCats.flatMap((c) => DIAG_ACTIONS[c] || []), ...(DIAG_ACTIONS.all || [])])];
  const photos = evidence.filter((e) => e.stage === 'diagnosis');

  const toggleTag = (t) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const confirmSymptom = () => {
    const clean = symptomInput.trim().replace(/,/g, ' -').replace(/\s+/g, ' ');
    if (!clean) return;
    const existing = symptomItems.find((it) => String(it.title || '').trim().toLowerCase() === clean.toLowerCase());
    if (existing) {
      setExpandedIds((p) => ({ ...p, [existing.id]: true }));
      setSymptomInput('');
      return;
    }
    const newItem = {
      id: `sym_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: clean,
      action: '',
      localPhotoUri: null,
    };
    setSymptomItems?.((p) => [...(p || []), newItem]);
    setExpandedIds((p) => ({ ...p, [newItem.id]: true }));
    setSymptomInput('');
  };

  const toggleCollapse = (id) => {
    setExpandedIds((p) => ({ ...p, [id]: !p[id] }));
  };

  const setItemAction = (id, action) => {
    const target = symptomItems.find((x) => x.id === id);
    setSymptomItems?.((p) => (p || []).map((x) => (x.id === id ? { ...x, action } : x)));
    if (target && target.action !== action) {
      onChangeSymptomAction?.(target, action);
    }
  };

  const totalSelectedSymptoms = tags.length + symptomItems.length;
  const hasAnyReco = recommendation.trim().length > 0 || symptomItems.some((it) => Boolean(it.action));
  const step1Done = totalSelectedSymptoms > 0;
  const step2Done = diagnosis.trim().length > 0;
  const step3Done = hasAnyReco;
  const doneCount = [step1Done, step2Done, step3Done].filter(Boolean).length;

  const selectedSymptomTitles = [...tags, ...symptomItems.map((it) => it.title)].filter(Boolean);
  const step1Preview = selectedSymptomTitles.length
    ? `${selectedSymptomTitles.slice(0, 3).join(', ')}${selectedSymptomTitles.length > 3 ? ` (+${selectedSymptomTitles.length - 3})` : ''}`
    : 'Chưa chọn triệu chứng';
  const step2Preview = diagnosis.trim() || 'Chưa ghi kết luận';
  const step3Preview = recommendation.trim() || (hasAnyReco ? 'Đã chọn hướng xử lý theo triệu chứng' : 'Chưa ghi đề xuất');
  const collapsedSummary = doneCount === 0
    ? 'Chạm để chọn triệu chứng, kết luận & đề xuất'
    : [
        step1Done ? `TC: ${step1Preview}` : null,
        step2Done ? `KL: ${step2Preview}` : null,
        step3Done ? `ĐX: ${step3Preview}` : null,
      ].filter(Boolean).join(' · ');

  const toggleCard = () => {
    setCardOpen((prev) => {
      const next = !prev;
      if (next) {
        setOpenStep(!step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : 1);
      }
      return next;
    });
  };
  const toggleStep = (stepNo) => setOpenStep((s) => (s === stepNo ? null : stepNo));

  return (
    <Card style={{ marginTop: 12 }}>
      {/* Tiêu đề thu gọn / mở chi tiết */}
      <Tap onPress={toggleCard} scaleTo={0.99} style={st.head}>
        <View style={[st.headIcon, doneCount === 3 && { backgroundColor: C.greenSoft }]}>
          <AppIcon
            name={doneCount === 3 ? 'check-circle-2' : 'search'}
            size={18}
            color={doneCount === 3 ? C.green : C.primary}
            strokeWidth={2.4}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.headTitle}>Triệu chứng & chẩn đoán</Text>
          <Text style={st.headSub} numberOfLines={1}>{collapsedSummary}</Text>
        </View>
        <View style={[st.progress, doneCount === 3 && { backgroundColor: C.greenSoft }]}>
          <Text style={[st.progressText, doneCount === 3 && { color: C.green }]}>{doneCount}/3</Text>
        </View>
        <View style={st.headToggle}>
          <Text style={st.headToggleText}>{cardOpen ? 'Thu gọn' : 'Chi tiết'}</Text>
          <View style={cardOpen ? { transform: [{ rotate: '90deg' }] } : null}>
            <AppIcon name="chevron-right" size={14} color={C.primary} strokeWidth={2.6} />
          </View>
        </View>
      </Tap>

      {/* Thanh tiến độ 3 bước gọn */}
      <View style={st.segRow}>
        {[step1Done, step2Done, step3Done].map((done, idx) => (
          <View key={idx} style={[st.segBar, done && { backgroundColor: C.green }]} />
        ))}
      </View>

      {cardOpen ? (
        <View style={{ marginTop: 4 }}>
          {/* 1. Triệu chứng */}
          <StepHead
            no={1}
            title="Triệu chứng thiết bị"
            hint={openStep === 1 ? (deviceTags.length ? 'Chọn gợi ý hoặc nhập triệu chứng' : 'Nhập triệu chứng để gắn ảnh & xử lý') : step1Preview}
            done={step1Done}
            open={openStep === 1}
            onPress={() => toggleStep(1)}
            right={totalSelectedSymptoms ? <Text style={st.counter}>{totalSelectedSymptoms}</Text> : null}
          />
          {openStep === 1 ? (
            <View style={st.stepBody}>
              {deviceTags.length ? (
                <>
                  <Text style={st.groupLabel}>Theo thiết bị</Text>
                  <View style={st.pillWrap}>
                    {deviceTags.map((t) => <TogglePill key={t} label={t} on={tags.includes(t)} onPress={() => toggleTag(t)} />)}
                  </View>
                </>
              ) : null}
              {customTags.length ? (
                <View style={st.pillWrap}>
                  {customTags.map((t) => (
                    <TogglePill key={t} label={t} on tone="amber" onPress={() => toggleTag(t)} onRemove={() => toggleTag(t)} />
                  ))}
                </View>
              ) : null}

              {/* Ô nhập triệu chứng + nút Xác nhận -> tạo Collapsible */}
              <Text style={st.groupLabel}>Nhập triệu chứng chi tiết</Text>
              <View style={st.otherRow}>
                <TextInput
                  value={symptomInput}
                  onChangeText={setSymptomInput}
                  onSubmitEditing={confirmSymptom}
                  returnKeyType="done"
                  placeholder="Nhập triệu chứng (VD: Chảy nước dàn lạnh, Hỏng tụ…)"
                  placeholderTextColor={C.faint}
                  style={[st.otherInput, !symptomInput.trim() && { borderColor: C.line }]}
                />
                <Tap
                  onPress={confirmSymptom}
                  style={[st.otherBtn, !symptomInput.trim() && { opacity: 0.5 }]}
                  disabled={!symptomInput.trim()}
                >
                  <AppIcon name="check" size={14} color="#fff" strokeWidth={2.8} />
                  <Text style={st.otherBtnText}>Xác nhận</Text>
                </Tap>
              </View>

              {/* Danh sách triệu chứng đã xác nhận dạng Collapsible */}
              {symptomItems.length ? (
                <View style={st.symList}>
                  {symptomItems.map((item) => {
                    const titleKey = String(item.title || '').trim().toLowerCase();
                    const matched = photos.filter((e) => (parseSymptomPhotoTitle(e.note) || '').toLowerCase() === titleKey);
                    const photoUri = matched[matched.length - 1]?.uri || item.localPhotoUri || null;
                    const isOpen = Boolean(expandedIds[item.id]);
                    const isBusy = busySymptomPhotoId === item.id;
                    const actionLabel = item.action === 'replace' ? 'Thay thế' : item.action === 'repair' ? 'Sửa chữa' : 'Chọn xử lý';
                    const actionStyle =
                      item.action === 'replace'
                        ? { bg: C.goldSoft, fg: C.goldInk, bd: C.goldBorder }
                        : item.action === 'repair'
                          ? { bg: C.primarySoft, fg: C.primary, bd: C.primaryBorder }
                          : { bg: C.surface, fg: C.muted, bd: C.line };

                    return (
                      <View key={item.id} style={st.symCard}>
                        <Tap onPress={() => toggleCollapse(item.id)} style={st.symHead} scaleTo={0.99}>
                          <View style={[st.symChevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>
                            <AppIcon name="chevron-right" size={16} color={C.ink2} strokeWidth={2.6} />
                          </View>
                          <Text style={st.symTitle} numberOfLines={2}>{item.title}</Text>
                          <View style={st.symHeadRight}>
                            {photoUri ? (
                              <View style={st.symPhotoDot}>
                                <AppIcon name="camera" size={12} color={C.green} strokeWidth={2.4} />
                              </View>
                            ) : null}
                            <View style={[st.symBadge, { backgroundColor: actionStyle.bg, borderColor: actionStyle.bd }]}>
                              <Text style={[st.symBadgeText, { color: actionStyle.fg }]}>{actionLabel}</Text>
                            </View>
                            <Tap
                              onPress={() => {
                                setExpandedIds((p) => {
                                  const next = { ...p };
                                  delete next[item.id];
                                  return next;
                                });
                                onRemoveSymptomItem?.(item);
                              }}
                              hitSlop={8}
                              style={st.symRemoveBtn}
                            >
                              <AppIcon name="x" size={14} color={C.muted} strokeWidth={2.5} />
                            </Tap>
                          </View>
                        </Tap>

                        {isOpen ? (
                          <View style={st.symBody}>
                            {/* Hình ảnh (chụp hoặc cập nhật) */}
                            <Text style={st.symSubLabel}>Hình ảnh tình trạng (chụp hoặc cập nhật)</Text>
                            {photoUri ? (
                              <View style={st.symPhotoRow}>
                                <View style={st.photo}>
                                  <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} />
                                  <Tap
                                    style={st.photoX}
                                    disabled={isBusy}
                                    onPress={() => onRemoveSymptomPhoto?.(item)}
                                    hitSlop={6}
                                  >
                                    <AppIcon name="x" size={11} color="#fff" strokeWidth={3} />
                                  </Tap>
                                </View>
                                <View style={st.symPhotoActions}>
                                  <Tap
                                    style={[st.symActionBtn, isBusy && { opacity: 0.5 }]}
                                    disabled={isBusy}
                                    onPress={() => onPickSymptomPhoto?.(item, 'camera')}
                                    scaleTo={0.97}
                                  >
                                    <AppIcon name="camera" size={14} color={C.primary} strokeWidth={2.3} />
                                    <Text style={st.symActionBtnText}>Chụp mới</Text>
                                  </Tap>
                                  <Tap
                                    style={[st.symActionBtn, isBusy && { opacity: 0.5 }]}
                                    disabled={isBusy}
                                    onPress={() => onPickSymptomPhoto?.(item, 'library')}
                                    scaleTo={0.97}
                                  >
                                    <AppIcon name="refresh-cw" size={14} color={C.primary} strokeWidth={2.3} />
                                    <Text style={st.symActionBtnText}>Cập nhật ảnh</Text>
                                  </Tap>
                                </View>
                              </View>
                            ) : (
                              <View style={st.symBtnRow}>
                                <Tap
                                  style={[st.symActionBtn, { flex: 1 }, isBusy && { opacity: 0.5 }]}
                                  disabled={isBusy}
                                  onPress={() => onPickSymptomPhoto?.(item, 'camera')}
                                  scaleTo={0.97}
                                >
                                  <AppIcon name="camera" size={15} color={C.primary} strokeWidth={2.3} />
                                  <Text style={st.symActionBtnText}>Chụp ảnh</Text>
                                </Tap>
                                <Tap
                                  style={[st.symActionBtn, { flex: 1 }, isBusy && { opacity: 0.5 }]}
                                  disabled={isBusy}
                                  onPress={() => onPickSymptomPhoto?.(item, 'library')}
                                  scaleTo={0.97}
                                >
                                  <AppIcon name="image" size={15} color={C.primary} strokeWidth={2.3} />
                                  <Text style={st.symActionBtnText}>Cập nhật ảnh</Text>
                                </Tap>
                              </View>
                            )}
                            {isBusy ? (
                              <Text style={{ fontSize: 11.5, color: C.primary, fontWeight: '600', marginTop: 6 }}>
                                Đang xử lý ảnh…
                              </Text>
                            ) : null}

                            {/* Hướng giải quyết (Thay thế hoặc Sửa chữa) */}
                            <Text style={[st.symSubLabel, { marginTop: 12 }]}>Hướng giải quyết</Text>
                            <View style={st.symBtnRow}>
                              <Tap
                                style={[
                                  st.symResolveBtn,
                                  item.action === 'replace' && st.symResolveReplaceOn,
                                ]}
                                onPress={() => setItemAction(item.id, 'replace')}
                                scaleTo={0.97}
                              >
                                <AppIcon
                                  name="refresh-cw"
                                  size={14}
                                  color={item.action === 'replace' ? C.goldInk : C.ink2}
                                  strokeWidth={2.4}
                                />
                                <Text style={[st.symResolveText, item.action === 'replace' && { color: C.goldInk, fontWeight: '800' }]}>
                                  Thay thế
                                </Text>
                              </Tap>
                              <Tap
                                style={[
                                  st.symResolveBtn,
                                  item.action === 'repair' && st.symResolveRepairOn,
                                ]}
                                onPress={() => setItemAction(item.id, 'repair')}
                                scaleTo={0.97}
                              >
                                <AppIcon
                                  name="hammer"
                                  size={14}
                                  color={item.action === 'repair' ? C.primary : C.ink2}
                                  strokeWidth={2.4}
                                />
                                <Text style={[st.symResolveText, item.action === 'repair' && { color: C.primary, fontWeight: '800' }]}>
                                  Sửa chữa
                                </Text>
                              </Tap>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={st.divider} />

          {/* 2. Kết luận chẩn đoán */}
          <StepHead
            no={2}
            title="Kết luận chẩn đoán"
            hint={openStep === 2 ? 'Nguyên nhân / tình trạng thực tế' : step2Preview}
            done={step2Done}
            open={openStep === 2}
            onPress={() => toggleStep(2)}
          />
          {openStep === 2 ? (
            <View style={st.stepBody}>
              <QuickPhrases items={findings} value={diagnosis} onChange={setDiagnosis} />
              <Field multiline value={diagnosis} onChangeText={setDiagnosis} placeholder="Chạm gợi ý ở trên hoặc ghi thêm…" inputStyle={st.textArea} />
            </View>
          ) : null}

          <View style={st.divider} />

          {/* 3. Đề xuất xử lý */}
          <StepHead
            no={3}
            title="Đề xuất xử lý"
            hint={openStep === 3 ? 'Phương án sẽ làm cho khách' : step3Preview}
            done={step3Done}
            open={openStep === 3}
            onPress={() => toggleStep(3)}
          />
          {openStep === 3 ? (
            <View style={st.stepBody}>
              <QuickPhrases items={actions} value={recommendation} onChange={setRecommendation} />
              <Field multiline value={recommendation} onChangeText={setRecommendation} placeholder="VD: Vệ sinh dàn lạnh + kiểm tra gas…" inputStyle={st.textArea} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 15, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  headSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  headToggle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headToggleText: { fontSize: 12.5, fontWeight: '700', color: C.primary },
  progress: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: C.surface },
  progressText: { fontSize: 11.5, fontWeight: '800', color: C.ink2 },
  segRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segBar: { flex: 1, height: 4, borderRadius: 4, backgroundColor: C.line },

  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  stepHeadOpen: { paddingBottom: 8 },
  stepBody: { paddingBottom: 6 },
  stepChevron: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  stepNo: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  stepNoDone: { backgroundColor: C.green, borderColor: C.green },
  stepNoText: { fontSize: 12, fontWeight: '800', color: C.ink2 },
  stepTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  stepHint: { fontSize: 12, color: C.muted, marginTop: 1 },
  counter: { fontSize: 12, fontWeight: '700', color: C.primary },

  groupLabel: { fontSize: 11.5, fontWeight: '800', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4, marginBottom: 6 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  pillDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 13.5, color: C.ink2, fontWeight: '600' },

  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 8 },
  otherInput: { flex: 1, height: 42, borderRadius: R.sm, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 12, fontSize: 13.5, color: C.ink, backgroundColor: C.card },
  otherBtn: { height: 42, paddingHorizontal: 14, borderRadius: R.sm, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  otherBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  symList: { gap: 8, marginTop: 2, marginBottom: 4 },
  symCard: { borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, overflow: 'hidden' },
  symHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, backgroundColor: C.card },
  symChevron: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  symTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: C.ink },
  symHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  symPhotoDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  symBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  symBadgeText: { fontSize: 11, fontWeight: '800' },
  symRemoveBtn: { padding: 4 },
  symBody: { padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  symSubLabel: { fontSize: 12, fontWeight: '800', color: C.ink2, marginBottom: 8 },
  symPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  symPhotoActions: { flex: 1, gap: 8 },
  symBtnRow: { flexDirection: 'row', gap: 8 },
  symActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderRadius: R.sm, borderWidth: 1.2, borderColor: C.primaryBorder, backgroundColor: C.card },
  symActionBtnText: { fontSize: 12.5, fontWeight: '700', color: C.primary },
  symResolveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 10, borderRadius: R.sm, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  symResolveReplaceOn: { borderColor: C.gold, backgroundColor: C.goldSoft },
  symResolveRepairOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  symResolveText: { fontSize: 13, fontWeight: '700', color: C.ink2 },

  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.surface },
  quickOn: { backgroundColor: C.greenSoft },
  quickText: { fontSize: 12.5, color: C.ink2, fontWeight: '600' },
  textArea: { minHeight: 76 },

  divider: { height: 1, backgroundColor: C.line, marginVertical: 2 },

  photo: { width: 84, height: 84, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  photoX: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'center' },
});
