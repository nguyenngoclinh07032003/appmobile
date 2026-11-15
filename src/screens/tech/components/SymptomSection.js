// Khối "Triệu chứng & chẩn đoán" của thợ: 4 bước rõ ràng, chạm là chọn, hạn chế phải gõ phím.
// 1. Triệu chứng: gợi ý theo loại thiết bị + triệu chứng chung, chọn nhiều; thêm được triệu chứng khác.
// 2. Kết luận chẩn đoán / 3. Đề xuất xử lý: ô nhập + cụm từ gợi ý chạm để chèn (chạm lại để bỏ).
// 4. Ảnh minh chứng chẩn đoán.
// Chỉ đổi giao diện: dữ liệu vẫn là tags / diagnosis / recommendation của useQuoteDraft, ảnh qua addEvidence.
import React, { useState } from 'react';
import { View, Text, Image, TextInput, StyleSheet } from 'react-native';
import { C, R } from '../../../theme';
import { DIAG_TAGS, DIAG_FINDINGS, DIAG_ACTIONS } from '../../../constants/data';
import { Tap, Card, Field, AppIcon } from '../../../components';

// Chèn / bỏ một cụm từ gợi ý trong ô văn bản (ngăn cách bằng dấu phẩy).
const hasPhrase = (text, phrase) => String(text || '').toLowerCase().includes(phrase.toLowerCase());
const togglePhrase = (text, phrase) => {
  const cur = String(text || '').trim();
  if (hasPhrase(cur, phrase)) {
    return cur
      .split(/\s*[,;]\s*/)
      .filter((p) => p && p.toLowerCase() !== phrase.toLowerCase())
      .join(', ');
  }
  if (!cur) return phrase;
  return `${cur.replace(/[,;.\s]+$/, '')}, ${phrase}`;
};

function StepHead({ no, title, hint, done, right }) {
  return (
    <View style={st.stepHead}>
      <View style={[st.stepNo, done && st.stepNoDone]}>
        {done ? <AppIcon name="check" size={13} color="#fff" strokeWidth={3} /> : <Text style={st.stepNoText}>{no}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.stepTitle}>{title}</Text>
        {hint ? <Text style={st.stepHint}>{hint}</Text> : null}
      </View>
      {right || null}
    </View>
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

export function SymptomSection({ cats = [], draft, evidence = [], addingPhoto, onAddPhoto, onRemovePhoto }) {
  const { tags, setTags, diagnosis, setDiagnosis, recommendation, setRecommendation } = draft;
  const [showOther, setShowOther] = useState(false);
  const [other, setOther] = useState('');

  const deviceTags = [...new Set(cats.flatMap((c) => DIAG_TAGS[c] || []))];
  const commonTags = (DIAG_TAGS.all || []).filter((t) => !deviceTags.includes(t));
  const suggested = new Set([...deviceTags, ...commonTags]);
  const customTags = tags.filter((t) => !suggested.has(t));
  const findings = [...new Set([...cats.flatMap((c) => DIAG_FINDINGS[c] || []), ...(DIAG_FINDINGS.all || [])])];
  const actions = [...new Set([...cats.flatMap((c) => DIAG_ACTIONS[c] || []), ...(DIAG_ACTIONS.all || [])])];
  const photos = evidence.filter((e) => e.stage === 'diagnosis');

  const toggleTag = (t) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const addOther = () => {
    const t = other.trim().replace(/,/g, ' ');
    if (!t) return;
    setTags((p) => (p.some((x) => x.toLowerCase() === t.toLowerCase()) ? p : [...p, t]));
    setOther('');
    setShowOther(false);
  };

  const doneCount = [tags.length > 0, diagnosis.trim().length > 0, recommendation.trim().length > 0, photos.length > 0].filter(Boolean).length;

  return (
    <Card style={{ marginTop: 12 }}>
      {/* Tiêu đề + tiến độ */}
      <View style={st.head}>
        <View style={st.headIcon}><AppIcon name="search" size={20} color={C.primary} strokeWidth={2.4} /></View>
        <View style={{ flex: 1 }}>
          <Text style={st.headTitle}>Triệu chứng & chẩn đoán</Text>
          <Text style={st.headSub}>Chạm để chọn nhanh, không cần gõ nhiều</Text>
        </View>
        <View style={[st.progress, doneCount === 4 && { backgroundColor: C.greenSoft }]}>
          <Text style={[st.progressText, doneCount === 4 && { color: C.green }]}>{doneCount}/4</Text>
        </View>
      </View>
      <View style={st.progressBar}><View style={[st.progressFill, { width: `${(doneCount / 4) * 100}%` }]} /></View>

      {/* 1. Triệu chứng */}
      <StepHead
        no={1}
        title="Triệu chứng thiết bị"
        hint="Chọn một hoặc nhiều"
        done={tags.length > 0}
        right={tags.length ? <Text style={st.counter}>Đã chọn {tags.length}</Text> : null}
      />
      {deviceTags.length ? (
        <>
          <Text style={st.groupLabel}>Theo thiết bị</Text>
          <View style={st.pillWrap}>
            {deviceTags.map((t) => <TogglePill key={t} label={t} on={tags.includes(t)} onPress={() => toggleTag(t)} />)}
          </View>
        </>
      ) : null}
      <Text style={st.groupLabel}>Tình trạng chung</Text>
      <View style={st.pillWrap}>
        {commonTags.map((t) => <TogglePill key={t} label={t} on={tags.includes(t)} onPress={() => toggleTag(t)} />)}
        {customTags.map((t) => (
          <TogglePill key={t} label={t} on tone="amber" onPress={() => toggleTag(t)} onRemove={() => toggleTag(t)} />
        ))}
        {!showOther ? (
          <Tap onPress={() => setShowOther(true)} scaleTo={0.96} style={st.pillAdd}>
            <AppIcon name="plus" size={13} color={C.primary} strokeWidth={2.6} />
            <Text style={st.pillAddText}>Triệu chứng khác</Text>
          </Tap>
        ) : null}
      </View>
      {showOther ? (
        <View style={st.otherRow}>
          <TextInput
            autoFocus
            value={other}
            onChangeText={setOther}
            onSubmitEditing={addOther}
            returnKeyType="done"
            placeholder="VD: Chảy nước dàn lạnh"
            placeholderTextColor={C.faint}
            style={st.otherInput}
          />
          <Tap onPress={addOther} style={[st.otherBtn, !other.trim() && { opacity: 0.5 }]} disabled={!other.trim()}>
            <Text style={st.otherBtnText}>Thêm</Text>
          </Tap>
          <Tap onPress={() => { setShowOther(false); setOther(''); }} hitSlop={8} style={{ padding: 6 }}>
            <AppIcon name="x" size={16} color={C.muted} strokeWidth={2.4} />
          </Tap>
        </View>
      ) : null}

      <View style={st.divider} />

      {/* 2. Kết luận chẩn đoán */}
      <StepHead no={2} title="Kết luận chẩn đoán" hint="Nguyên nhân / tình trạng thực tế" done={diagnosis.trim().length > 0} />
      <QuickPhrases items={findings} value={diagnosis} onChange={setDiagnosis} />
      <Field multiline value={diagnosis} onChangeText={setDiagnosis} placeholder="Chạm gợi ý ở trên hoặc ghi thêm…" inputStyle={st.textArea} />

      <View style={st.divider} />

      {/* 3. Đề xuất xử lý */}
      <StepHead no={3} title="Đề xuất xử lý" hint="Phương án sẽ làm cho khách" done={recommendation.trim().length > 0} />
      <QuickPhrases items={actions} value={recommendation} onChange={setRecommendation} />
      <Field multiline value={recommendation} onChangeText={setRecommendation} placeholder="VD: Vệ sinh dàn lạnh + kiểm tra gas…" inputStyle={st.textArea} />

      <View style={st.divider} />

      {/* 4. Ảnh minh chứng */}
      <StepHead
        no={4}
        title="Ảnh minh chứng"
        hint="Chụp tình trạng trước khi sửa để khách yên tâm"
        done={photos.length > 0}
        right={photos.length ? <Text style={st.counter}>{photos.length} ảnh</Text> : null}
      />
      <View style={st.photoWrap}>
        <Tap style={st.photoAdd} disabled={addingPhoto} onPress={onAddPhoto} scaleTo={0.97}>
          <View style={st.photoAddIcon}><AppIcon name="camera" size={20} color={C.primary} strokeWidth={2.3} /></View>
          <Text style={st.photoAddText}>{addingPhoto ? 'Đang tải…' : 'Chụp ảnh'}</Text>
        </Tap>
        {photos.map((e) => (
          <View key={e.id} style={st.photo}>
            {e.uri ? <Image source={{ uri: e.uri }} style={{ width: '100%', height: '100%' }} /> : <AppIcon name="image" size={24} color={C.muted} />}
            <Tap style={st.photoX} onPress={() => onRemovePhoto(e.id)} hitSlop={6}>
              <AppIcon name="x" size={11} color="#fff" strokeWidth={3} />
            </Tap>
          </View>
        ))}
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 16, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  headSub: { fontSize: 12.5, color: C.muted, marginTop: 2 },
  progress: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#F1F5F9' },
  progressText: { fontSize: 12.5, fontWeight: '800', color: C.ink2 },
  progressBar: { height: 4, borderRadius: 4, backgroundColor: '#EEF2F7', marginTop: 12, marginBottom: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: C.green },

  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 8 },
  stepNo: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepNoDone: { backgroundColor: C.green, borderColor: C.green },
  stepNoText: { fontSize: 12, fontWeight: '800', color: C.ink2 },
  stepTitle: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  stepHint: { fontSize: 12, color: C.muted, marginTop: 1 },
  counter: { fontSize: 12, fontWeight: '700', color: C.primary },

  groupLabel: { fontSize: 11.5, fontWeight: '800', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4, marginBottom: 6 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff' },
  pillDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 13.5, color: C.ink2, fontWeight: '600' },
  pillAdd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: '#F8FBFF' },
  pillAddText: { fontSize: 13.5, color: C.primary, fontWeight: '700' },

  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  otherInput: { flex: 1, height: 42, borderRadius: R.sm, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 12, fontSize: 14, color: C.ink, backgroundColor: '#fff' },
  otherBtn: { height: 42, paddingHorizontal: 16, borderRadius: R.sm, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  otherBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },

  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F1F5F9' },
  quickOn: { backgroundColor: C.greenSoft },
  quickText: { fontSize: 12.5, color: C.ink2, fontWeight: '600' },
  textArea: { minHeight: 76 },

  divider: { height: 1, backgroundColor: '#EEF2F7', marginTop: 14 },

  photoWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoAdd: { width: 84, height: 84, borderRadius: R.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: '#F8FBFF', alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoAddIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  photoAddText: { fontSize: 12, fontWeight: '700', color: C.primary },
  photo: { width: 84, height: 84, borderRadius: R.md, overflow: 'hidden', backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  photoX: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'center' },
});
