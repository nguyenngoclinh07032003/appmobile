// Form chẩn đoán & báo giá của thợ (dùng cho báo giá trước khi xuất phát và báo giá tại nhà).
// State bản nháp nằm ở useQuoteDraft (màn cha giữ để thanh hành động dưới cùng gửi được).
import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { C, R } from '../../../theme';
import { formatVND, formatNumberInput, DIAG_TAGS } from '../../../constants/data';
import { useApp, bookedValue } from '../../../context';
import { Tap, Btn, Card, Chip, Badge, Field, Stepper, ui, AppIcon } from '../../../components';
import { pickImage, pickCamera } from '../../../utils/media';
import { tx } from './techStyles';

export function QuoteEditor({ o, draft, cats, matsCount, onOpenMaterials, evidence }) {
  const { a, ui: u } = useApp();
  const [showCustomFee, setShowCustomFee] = useState(false);
  const [customFeeName, setCustomFeeName] = useState('');
  const [customFeePrice, setCustomFeePrice] = useState('');
  const [customFeeType, setCustomFeeType] = useState('labor'); // 'labor' | 'part'
  const [addingPhoto, setAddingPhoto] = useState(false);

  const { tags, setTags, diagnosis, setDiagnosis, recommendation, setRecommendation, lines, setLines } = draft;
  const booked = bookedValue(o);
  // Phân loại: Dịch vụ gốc ban đầu vs Vật tư vs Phí phát sinh
  const originalLines = lines.filter((l) => l.isOriginal);
  const partLines = lines.filter((l) => (l.type === 'part' || Boolean(l.matId)) && !l.isOriginal);
  const customLines = lines.filter((l) => !l.isOriginal && l.type !== 'part' && !l.matId);

  // Phát sinh thực tế: tất cả các dòng không thuộc dịch vụ gốc đã đặt ban đầu
  const extraItems = lines.filter((l) => !l.isOriginal);
  const extraTotal = extraItems.reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 1), 0);
  const diff = extraTotal;
  const qTotal = draft.total;

  const handleAddCustomFee = () => {
    const name = customFeeName.trim();
    const priceNum = parseInt(String(customFeePrice).replace(/[^0-9]/g, ''), 10);
    if (!name) {
      u.alert('Thiếu nội dung', 'Vui lòng nhập tên hoặc nội dung chi phí phát sinh.', 'alert-triangle');
      return;
    }
    if (!priceNum || priceNum <= 0) {
      u.alert('Giá không hợp lệ', 'Vui lòng nhập số tiền phát sinh lớn hơn 0đ.', 'alert-triangle');
      return;
    }
    const newFeeLine = {
      key: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: customFeeType,
      name,
      price: priceNum,
      qty: 1,
      unit: customFeeType === 'labor' ? 'lần' : 'cái',
      isCustom: true,
    };
    setLines((prev) => [...prev, newFeeLine]);
    setCustomFeeName('');
    setCustomFeePrice('');
    setShowCustomFee(false);
    u.toast(`Đã thêm phát sinh: ${name} (+${formatVND(priceNum)})`, 'check-circle-2');
  };

  const addDiagnosisPhoto = async () => {
    if (addingPhoto) return;
    setAddingPhoto(true);
    try {
      let uri = await pickCamera();
      if (uri === null) uri = await pickImage();
      if (uri == null) {
        if (uri === null) u.alert('Chưa hỗ trợ camera', 'Trên web/mobile browser hãy cho phép camera hoặc chọn ảnh thư viện.', 'camera');
        return;
      }
      await Promise.resolve(a.addEvidence(o.code, { uri, stage: 'diagnosis', note: 'Minh chứng chẩn đoán' }));
    } catch (e) {
      u.alert('Không thêm được ảnh', (e && e.message) || 'Vui lòng thử lại.', 'camera');
    } finally {
      setAddingPhoto(false);
    }
  };

  return (
    <>
      {o.kind === 'warranty' ? (
        <Card style={{ marginTop: 12, backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
          <Text style={[tx.h, { color: '#B91C1C', marginBottom: 4 }]}>🛡️ Thẩm định bảo hành tại chỗ</Text>
          <Text style={{ color: '#7F1D1D', fontSize: 13, lineHeight: 19 }}>
            Nếu thiết bị bị rơi vỡ, chập cháy nguồn điện ngoài hoặc tác động của bên thứ 3, KTV bấm từ chối bảo hành để chuyển sang Báo giá sửa có phí.
          </Text>
          <View style={{ marginTop: 10 }}>
            <Btn
              title="Từ chối bảo hành (Do lỗi người dùng) → Báo giá có phí"
              variant="dangerSoft"
              onPress={() => {
                u.dialog({
                  icon: 'alert-triangle',
                  title: 'Xác nhận ngoài bảo hành?',
                  message: 'Thiết bị hư hỏng do tác động bên ngoài hoặc lỗi người dùng. Đơn sẽ chuyển sang luồng Sửa chữa có phí.',
                  actions: [
                    { label: 'Huỷ', variant: 'ghost' },
                    {
                      label: 'Xác nhận chuyển',
                      variant: 'danger',
                      onPress: () => a.rejectWarrantyAsOutOfWarranty(o.code, 'Thiết bị rơi vỡ/hư hỏng do ngoại lực bên ngoài'),
                    },
                  ],
                });
              }}
            />
          </View>
        </Card>
      ) : null}
      {o.quote?.revisionRequested ? (
        <Card style={{ marginTop: 12, backgroundColor: '#FFFBEB', borderColor: '#F5D77A' }}>
          <Text style={[tx.h, { color: C.goldInk, marginBottom: 4 }]}>🔄 Khách yêu cầu điều chỉnh báo giá</Text>
          <Text style={{ color: C.goldInk, lineHeight: 20 }}>
            Lý do: <Text style={{ fontWeight: '800' }}>{o.quote.rejectReason || 'Cần trao đổi lại phương án / chi phí'}</Text>
          </Text>
          <Text style={[ui.meta, { color: C.goldInk, marginTop: 4 }]}>
            Hãy điều chỉnh lại vật tư / phương án bên dưới và gửi lại báo giá mới cho khách.
          </Text>
        </Card>
      ) : null}
      {draft.dirty && o.quote ? (
        <View style={[tx.note, { backgroundColor: C.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Text style={{ flex: 1, color: C.primaryDark, fontSize: 12.5, lineHeight: 18 }}>
            Bạn đang sửa bản nháp. Báo giá trên hệ thống có thể đã được cập nhật.
          </Text>
          <Tap onPress={draft.resetFromServer} hitSlop={8}><Text style={ui.link}>Lấy lại bản hệ thống</Text></Tap>
        </View>
      ) : null}
      <Card style={{ marginTop: 12 }}>
        <Text style={tx.h}>🔍 Triệu chứng thiết bị</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[...new Set([...cats.flatMap((c) => DIAG_TAGS[c] || []), ...(DIAG_TAGS.all || [])])].map((t) => (
            <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))} />
          ))}
        </View>
        <Field label="Kết luận chẩn đoán" multiline value={diagnosis} onChangeText={setDiagnosis} placeholder="Nguyên nhân / tình trạng thực tế…" />
        <Field label="Đề xuất xử lý" multiline value={recommendation} onChangeText={setRecommendation} placeholder="VD: Vệ sinh dàn lạnh + kiểm tra gas…" />
        <Text style={[tx.fl, { marginTop: 8 }]}>Ảnh minh chứng chẩn đoán</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {evidence.filter((e) => e.stage === 'diagnosis').map((e) => (
            <View key={e.id} style={tx.thumb}>
              {e.uri ? <Image source={{ uri: e.uri }} style={{ width: '100%', height: '100%' }} /> : <AppIcon name="image" size={26} color={C.muted} />}
              <Tap style={tx.thumbX} onPress={() => a.removeEvidence(o.code, e.id)}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text></Tap>
            </View>
          ))}
          <Tap style={[tx.thumb, tx.thumbAdd]} disabled={addingPhoto} onPress={addDiagnosisPhoto}>
            <AppIcon name="plus" size={22} color={C.primary} />
            <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700' }}>{addingPhoto ? 'Đang tải…' : 'Thêm ảnh'}</Text>
          </Tap>
        </View>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={tx.h}>🧾 Báo giá chi tiết</Text>
          <Badge
            text={diff > 0 ? `+${formatVND(diff)} phát sinh` : 'Đúng giá gốc (0đ)'}
            fg={diff > 0 ? C.orange : C.green}
            bg={diff > 0 ? C.orangeSoft : C.greenSoft}
          />
        </View>

        {/* 1. Dịch vụ gốc đã đặt */}
        <Text style={[ui.meta, { fontWeight: '700', color: C.ink, marginTop: 8, marginBottom: 4 }]}>
          🛠️ Dịch vụ ban đầu ({originalLines.length})
        </Text>
        {originalLines.map((l) => (
          <View key={l.key} style={tx.lineRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={2}>{l.name}</Text>
              <Text style={ui.meta}>{formatVND(l.price)} x{l.qty} {l.unit || 'lần'} = <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text></Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Stepper value={l.qty} onChange={(q) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
            </View>
          </View>
        ))}

        {/* 2. Vật tư thay thế (nếu có) */}
        {partLines.length ? (
          <>
            <Text style={[ui.meta, { fontWeight: '700', color: C.ink, marginTop: 12, marginBottom: 4 }]}>
              🔩 Vật tư / Linh kiện kho ({partLines.length})
            </Text>
            {partLines.map((l) => (
              <View key={l.key} style={tx.lineRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={2}>{l.name}</Text>
                  <Text style={ui.meta}>{formatVND(l.price)} x{l.qty} {l.unit || 'cái'} = <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text></Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Stepper value={l.qty} onChange={(q) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
                  <Tap onPress={() => setLines((p) => p.filter((x) => x.key !== l.key))} hitSlop={8} style={{ padding: 4 }}>
                    <Text style={{ color: C.red, fontSize: 13, fontWeight: '700' }}>✕</Text>
                  </Tap>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {/* 3. Chi phí phát sinh tại chỗ (nếu có) */}
        {customLines.length ? (
          <>
            <Text style={[ui.meta, { fontWeight: '700', color: C.orange, marginTop: 12, marginBottom: 4 }]}>
              📝 Chi phí phát sinh tại hiện trường ({customLines.length})
            </Text>
            {customLines.map((l) => (
              <View key={l.key} style={tx.lineRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={2}>{l.name}</Text>
                    <Badge text={l.type === 'labor' ? 'Công thêm' : 'Vật tư ngoài'} fg={C.orange} bg={C.orangeSoft} />
                  </View>
                  <Text style={ui.meta}>{formatVND(l.price)} x{l.qty} = <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text></Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Stepper value={l.qty} onChange={(q) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
                  <Tap onPress={() => setLines((p) => p.filter((x) => x.key !== l.key))} hitSlop={8} style={{ padding: 4 }}>
                    <Text style={{ color: C.red, fontSize: 13, fontWeight: '700' }}>✕</Text>
                  </Tap>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Tap style={[tx.addLine, { flex: 1, marginTop: 0, flexDirection: 'row', gap: 5 }]} onPress={onOpenMaterials}>
            <AppIcon name="plus" size={14} color={C.primary} strokeWidth={2.5} />
            <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Vật tư kho ({matsCount})</Text>
          </Tap>
          <Tap
            style={[
              tx.addLine,
              { flex: 1, marginTop: 0, flexDirection: 'row', gap: 5, borderColor: '#F59E0B', backgroundColor: showCustomFee ? '#FEF3C7' : '#FFFBEB' },
            ]}
            onPress={() => setShowCustomFee((v) => !v)}
          >
            <AppIcon name="plus" size={14} color="#D97706" strokeWidth={2.5} />
            <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 13 }}>Phí phát sinh</Text>
          </Tap>
        </View>

        {showCustomFee ? (
          <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5 }}>📝 Nhập chi phí phát sinh thực tế</Text>
              <Tap onPress={() => setShowCustomFee(false)} hitSlop={8}><Text style={{ color: C.muted, fontWeight: '700' }}>Đóng</Text></Tap>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {[
                { id: 'labor', label: 'Công phát sinh', icon: 'hammer' },
                { id: 'part', label: 'Vật tư ngoài', icon: 'settings' },
              ].map((t) => {
                const on = customFeeType === t.id;
                return (
                  <Tap
                    key={t.id}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      borderRadius: R.sm,
                      borderWidth: 1,
                      borderColor: on ? C.primary : '#E2E8F0',
                      backgroundColor: on ? C.primarySoft : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 5,
                    }}
                    onPress={() => setCustomFeeType(t.id)}
                  >
                    <AppIcon name={t.icon} size={13} color={on ? C.primary : C.muted} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: on ? C.primary : C.muted }}>{t.label}</Text>
                  </Tap>
                );
              })}
            </View>

            <Field
              label="Nội dung / Tên chi phí phát sinh"
              placeholder={customFeeType === 'labor' ? 'Ví dụ: Hàn vá ống đồng lổ mọt, Gia cố bas treo...' : 'Ví dụ: Dây đồng Thái Lan 2m, Cầu dao phụ Panasonic...'}
              value={customFeeName}
              onChangeText={setCustomFeeName}
            />

            <View style={{ marginTop: 8 }}>
              <Field
                label="Số tiền phát sinh (VNĐ)"
                placeholder="Ví dụ: 150.000"
                value={customFeePrice}
                onChangeText={(t) => setCustomFeePrice(formatNumberInput(t))}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn title="Hủy" variant="ghost" small style={{ flex: 1 }} onPress={() => { setShowCustomFee(false); setCustomFeeName(''); setCustomFeePrice(''); }} />
              <Btn title="Thêm vào báo giá" small style={{ flex: 1.6 }} onPress={handleAddCustomFee} />
            </View>
          </View>
        ) : null}

        <View style={tx.totalRow}><Text style={{ color: C.muted }}>Giá khách đã đặt</Text><Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(booked)}</Text></View>
        <View style={tx.totalRow}>
          <Text style={{ color: diff > 0 ? C.orange : C.muted }}>Chi phí phát sinh thêm</Text>
          <Text style={{ fontWeight: '700', color: diff > 0 ? C.orange : C.green }}>{diff > 0 ? `+${formatVND(diff)}` : '0 đ'}</Text>
        </View>
        <View style={tx.totalRow}><Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>Tổng báo giá</Text><Text style={[ui.price, { fontSize: 20 }]}>{formatVND(qTotal)}</Text></View>
        <View style={[tx.note, { backgroundColor: diff > 0 ? C.goldSoft : C.greenSoft }]}>
          <Text style={{ color: diff > 0 ? C.goldInk : C.green, fontWeight: '700', lineHeight: 19 }}>
            {diff > 0 ? `Phát sinh ${formatVND(diff)} → khách cần duyệt báo giá trên app trước khi làm.` : 'Không phát sinh thêm chi phí → đúng theo giá dịch vụ khách đã đặt ban đầu.'}
          </Text>
        </View>
      </Card>
    </>
  );
}
