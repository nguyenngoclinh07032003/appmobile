// Form chẩn đoán & báo giá của thợ (dùng cho báo giá trước khi xuất phát và báo giá tại nhà).
// State bản nháp nằm ở useQuoteDraft (màn cha giữ để thanh hành động dưới cùng gửi được).
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { C, R } from '../../../theme';
import { formatVND, formatNumberInput } from '../../../constants/data';
import { useApp, bookedValue } from '../../../context';
import { Tap, Btn, Card, Badge, Field, Stepper, ui, AppIcon } from '../../../components';
import { pickImage, pickCamera } from '../../../utils/media';
import { computeQuoteRangeTotals, formatRangeVND } from '../../../utils/externalPartsPricing';
import { tx } from './techStyles';
import { isOnSiteQuote, formatSymptomPhotoNote, parseSymptomPhotoTitle } from './useQuoteDraft';
import { SymptomSection } from './SymptomSection';

export function QuoteEditor({ o, draft, cats, matsCount, onOpenMaterials, evidence }) {
  const { a, ui: u } = useApp();
  const [showCustomFee, setShowCustomFee] = useState(false);
  const [customFeeName, setCustomFeeName] = useState('');
  const [customMinPrice, setCustomMinPrice] = useState('');
  const [customMaxPrice, setCustomMaxPrice] = useState('');
  const [busySymptomPhotoId, setBusySymptomPhotoId] = useState(null);

  const { lines, setLines } = draft;
  const booked = bookedValue(o);
  // Phân loại: Dịch vụ gốc ban đầu vs Vật tư vs Vật tư mua ngoài
  const originalLines = lines.filter((l) => l.isOriginal);
  // Vật tư kho (chọn từ danh sách) tách riêng; phần còn lại là vật tư mua ngoài (isCustom) và giữ tương thích hiển thị cho các dòng cũ nếu có.
  const partLines = lines.filter((l) => (l.type === 'part' || Boolean(l.matId)) && !l.isOriginal && !l.isCustom);
  const customLines = lines.filter((l) => !l.isOriginal && (l.isCustom || (l.type !== 'part' && !l.matId)));

  // Phát sinh thực tế: tất cả các dòng không thuộc dịch vụ gốc đã đặt ban đầu (có hỗ trợ khoảng giá dao động)
  const onSite = isOnSiteQuote(o);
  const prodDisc = Number(o.productDiscount) || 0;
  const comboDisc = Number(o.comboDiscount) || 0;
  const priorApprovedExtra = Number(o.quote?.priorApprovedExtra) || 0;
  const rangeTotals = computeQuoteRangeTotals(lines, {
    bookedBase: booked,
    priorApprovedExtra,
    prodDisc,
    comboDisc,
    isOnSite: onSite,
  });
  const hasRange = rangeTotals.hasEstimatedRange;
  const diffMin = onSite ? rangeTotals.extraMin : Math.max(0, rangeTotals.totalMin - booked);
  const diffMax = onSite ? rangeTotals.extraMax : Math.max(diffMin, rangeTotals.totalMax - booked);
  const paysMin = rangeTotals.totalMin;
  const paysMax = rangeTotals.totalMax;

  const handleAddCustomFee = () => {
    const name = customFeeName.trim();
    const minNum = parseInt(String(customMinPrice).replace(/[^0-9]/g, ''), 10);
    const maxNum = parseInt(String(customMaxPrice).replace(/[^0-9]/g, ''), 10);
    if (!name) {
      u.alert('Thiếu tên vật tư', 'Vui lòng nhập tên vật tư mua ngoài.', 'alert-triangle');
      return;
    }
    if (!minNum || minNum <= 0 || !maxNum || maxNum <= 0) {
      u.alert('Giá không hợp lệ', 'Vui lòng nhập đầy đủ khoảng giá dao động (từ – đến) lớn hơn 0đ.', 'alert-triangle');
      return;
    }
    if (minNum > maxNum) {
      u.alert('Khoảng giá chưa hợp lệ', 'Giá tối đa (Đến) phải lớn hơn hoặc bằng giá tối thiểu (Từ).', 'alert-triangle');
      return;
    }
    const newFeeLine = {
      key: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'part',
      name,
      minPrice: minNum,
      maxPrice: maxNum,
      price: 0,
      qty: 1,
      unit: 'cái',
      isCustom: true,
      isEstimatedRange: true,
    };
    setLines((prev) => [...prev, newFeeLine]);
    setCustomFeeName('');
    setCustomMinPrice('');
    setCustomMaxPrice('');
    setShowCustomFee(false);
    u.toast(`Đã thêm VT ngoài (giá dao động): ${name} (${formatRangeVND(minNum, maxNum)})`, 'check-circle-2');
  };

  const findSymptomDiagnosisPhotos = (title) => {
    const key = String(title || '').trim().toLowerCase();
    return (evidence || []).filter(
      (e) => e.stage === 'diagnosis' && (parseSymptomPhotoTitle(e.note) || '').toLowerCase() === key,
    );
  };

  const handlePickSymptomPhoto = async (item, source = 'camera') => {
    if (!item || busySymptomPhotoId) return;
    const prevLocal = item.localPhotoUri || null;
    setBusySymptomPhotoId(item.id);
    try {
      let uri = source === 'camera' ? await pickCamera() : await pickImage();
      if (source === 'camera' && uri === null) uri = await pickImage();
      if (uri == null) {
        if (uri === null) {
          u.alert('Chưa hỗ trợ camera', 'Trên web/mobile browser hãy cho phép camera hoặc chọn ảnh thư viện.', 'camera');
        }
        return;
      }
      const existing = findSymptomDiagnosisPhotos(item.title);
      draft.setSymptomItems?.((prev) =>
        (prev || []).map((x) => (x.id === item.id ? { ...x, localPhotoUri: uri } : x)),
      );
      if (o?.dbAssignmentId) {
        const ok = await Promise.resolve(
          a.addEvidence(o.code, { uri, stage: 'diagnosis', note: formatSymptomPhotoNote(item.title, item.action) }),
        );
        if (ok) {
          for (const old of existing) {
            await Promise.resolve(a.removeEvidence(o.code, old.id));
          }
        } else {
          draft.setSymptomItems?.((prev) =>
            (prev || []).map((x) => (x.id === item.id ? { ...x, localPhotoUri: prevLocal } : x)),
          );
        }
      }
    } catch (e) {
      draft.setSymptomItems?.((prev) =>
        (prev || []).map((x) => (x.id === item.id ? { ...x, localPhotoUri: prevLocal } : x)),
      );
      u.alert('Không thêm được ảnh', (e && e.message) || 'Vui lòng thử lại.', 'camera');
    } finally {
      setBusySymptomPhotoId(null);
    }
  };

  const handleRemoveSymptomPhoto = async (item) => {
    if (!item || busySymptomPhotoId) return;
    draft.setSymptomItems?.((prev) =>
      (prev || []).map((x) => (x.id === item.id ? { ...x, localPhotoUri: null } : x)),
    );
    const existing = findSymptomDiagnosisPhotos(item.title);
    if (!existing.length) return;
    setBusySymptomPhotoId(item.id);
    try {
      for (const old of existing) {
        await Promise.resolve(a.removeEvidence(o.code, old.id));
      }
    } finally {
      setBusySymptomPhotoId(null);
    }
  };

  const handleRemoveSymptomItem = async (item) => {
    if (!item) return;
    draft.setSymptomItems?.((prev) => (prev || []).filter((x) => x.id !== item.id));
    const existing = findSymptomDiagnosisPhotos(item.title);
    for (const old of existing) {
      await Promise.resolve(a.removeEvidence(o.code, old.id));
    }
  };

  const handleChangeSymptomAction = (item, nextAction) => {
    if (!item || !o?.dbAssignmentId) return;
    const existing = findSymptomDiagnosisPhotos(item.title);
    const nextNote = formatSymptomPhotoNote(item.title, nextAction);
    existing.forEach((old) => {
      if (old?.dbAttachmentId && old.note !== nextNote) {
        Promise.resolve(a.updateEvidenceNote?.(o.code, old.id, nextNote)).catch(() => null);
      }
    });
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
      <SymptomSection
        cats={cats}
        draft={draft}
        evidence={evidence}
        busySymptomPhotoId={busySymptomPhotoId}
        onPickSymptomPhoto={handlePickSymptomPhoto}
        onRemoveSymptomPhoto={handleRemoveSymptomPhoto}
        onRemoveSymptomItem={handleRemoveSymptomItem}
        onChangeSymptomAction={handleChangeSymptomAction}
      />
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={tx.h}>🧾 Báo giá chi tiết</Text>
          <Badge
            text={
              diffMax > 0
                ? `${hasRange ? 'Dự kiến ' : ''}${formatRangeVND(diffMin, diffMax, { prefix: '+' })}`
                : 'Đúng giá gốc (0đ)'
            }
            fg={diffMax > 0 ? C.orange : C.green}
            bg={diffMax > 0 ? C.orangeSoft : C.greenSoft}
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
              {!onSite ? (
                <Stepper value={l.qty} onChange={(q) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
              ) : (
                <Badge text={`x${l.qty} ${l.unit || 'lần'}`} fg={C.ink2} bg="#F1F5F9" />
              )}
            </View>
          </View>
        ))}
        {o.productDiscount ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingHorizontal: 4 }}>
            <Text style={[ui.meta, { fontSize: 13, color: C.green, flex: 1, paddingRight: 6 }]}>Giảm giá dịch vụ</Text>
            <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.green }]}>-{formatVND(o.productDiscount)}</Text>
          </View>
        ) : null}
        {o.comboDiscount ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingHorizontal: 4 }}>
            <Text style={[ui.meta, { fontSize: 13, color: C.green, flex: 1, paddingRight: 6 }]}>Ưu đãi {o.comboLabel || 'Combo nhiều máy (-5%)'}</Text>
            <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.green }]}>-{formatVND(o.comboDiscount)}</Text>
          </View>
        ) : null}

        {/* 2. Vật tư thay thế (nếu có) */}
        {partLines.length ? (
          <>
            <Text style={[ui.meta, { fontWeight: '700', color: C.ink, marginTop: 12, marginBottom: 4 }]}>
              🔩 Vật tư / Linh kiện kho ({partLines.length})
            </Text>
            {partLines.map((l) => {
              const showPriceInput = Boolean(l.needsPriceInput || !(Number(l.price) > 0));
              return (
                <View key={l.key} style={[tx.lineRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={2}>{l.name}</Text>
                      {Number(l.price) > 0 ? (
                        <Text style={ui.meta}>
                          {formatVND(l.price)} x{l.qty} {l.unit || 'cái'} = <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text>
                        </Text>
                      ) : (
                        <Text style={[ui.meta, { color: C.orange, fontWeight: '700' }]}>
                          Chưa có đơn giá niêm yết · Vui lòng nhập giá bên dưới
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Stepper value={l.qty} onChange={(q) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
                      <Tap onPress={() => setLines((p) => p.filter((x) => x.key !== l.key))} hitSlop={8} style={{ padding: 4 }}>
                        <Text style={{ color: C.red, fontSize: 13, fontWeight: '700' }}>✕</Text>
                      </Tap>
                    </View>
                  </View>
                  {showPriceInput ? (
                    <Field
                      label={`Đơn giá vật tư (${l.unit || 'cái'}) *`}
                      placeholder="Nhập đơn giá (VD: 50.000)"
                      value={Number(l.price) > 0 ? formatNumberInput(String(l.price)) : ''}
                      onChangeText={(t) => {
                        const pNum = parseInt(String(t).replace(/[^0-9]/g, ''), 10) || 0;
                        setLines((p) => p.map((x) => (x.key === l.key ? { ...x, price: pNum, needsPriceInput: true } : x)));
                      }}
                      keyboardType="numeric"
                      style={{ marginTop: 0 }}
                    />
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}

        {/* 3. Vật tư mua ngoài (nếu có) */}
        {customLines.length ? (
          <>
            <Text style={[ui.meta, { fontWeight: '700', color: C.orange, marginTop: 12, marginBottom: 4 }]}>
              📝 Vật tư mua ngoài ({customLines.length})
            </Text>
            {customLines.map((l) => (
              <View key={l.key} style={tx.lineRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={2}>{l.name}</Text>
                    <Badge
                      text={l.isEstimatedRange ? 'Giá dao động' : 'Vật tư ngoài'}
                      fg={C.orange}
                      bg={C.orangeSoft}
                    />
                  </View>
                  {l.isEstimatedRange ? (
                    <Text style={ui.meta}>
                      {formatRangeVND(l.minPrice, l.maxPrice)} x{l.qty} = <Text style={{ fontWeight: '700', color: C.orange }}>{formatRangeVND(l.minPrice * l.qty, l.maxPrice * l.qty)}</Text>
                    </Text>
                  ) : (
                    <Text style={ui.meta}>{formatVND(l.price)} x{l.qty} = <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text></Text>
                  )}
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
            <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 13 }}>Vật tư mua ngoài</Text>
          </Tap>
        </View>

        {showCustomFee ? (
          <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5 }}>
                🔩 Nhập vật tư mua ngoài (Giá dao động)
              </Text>
              <Tap onPress={() => setShowCustomFee(false)} hitSlop={8}><Text style={{ color: C.muted, fontWeight: '700' }}>Đóng</Text></Tap>
            </View>

            <Text style={[ui.meta, { marginTop: -2, marginBottom: 10, lineHeight: 17 }]}>
              Báo khoảng giá dự kiến trên thị trường. Khi hoàn thành sửa chữa, bạn sẽ nhập lại giá mua thực tế kèm hoá đơn để khách nghiệm thu.
            </Text>

            <Field
              label="Tên vật tư"
              placeholder="Ví dụ: Dây đồng Thái Lan 2m, Cầu dao phụ Panasonic..."
              value={customFeeName}
              onChangeText={setCustomFeeName}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Field
                label="Giá dao động từ (VNĐ)"
                placeholder="VD: 120.000"
                value={customMinPrice}
                onChangeText={(t) => setCustomMinPrice(formatNumberInput(t))}
                keyboardType="numeric"
                style={{ flex: 1, marginTop: 0 }}
              />
              <Field
                label="Đến (VNĐ)"
                placeholder="VD: 180.000"
                value={customMaxPrice}
                onChangeText={(t) => setCustomMaxPrice(formatNumberInput(t))}
                keyboardType="numeric"
                style={{ flex: 1, marginTop: 0 }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn
                title="Hủy"
                variant="ghost"
                small
                style={{ flex: 1 }}
                onPress={() => {
                  setShowCustomFee(false);
                  setCustomFeeName('');
                  setCustomMinPrice('');
                  setCustomMaxPrice('');
                }}
              />
              <Btn title="Thêm vào báo giá" small style={{ flex: 1.6 }} onPress={handleAddCustomFee} />
            </View>
          </View>
        ) : null}

        {(o.productDiscount || o.comboDiscount) ? (
          <View style={tx.totalRow}>
            <Text style={{ color: C.muted }}>Tổng tiền dịch vụ</Text>
            <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(o.goods || (booked + (o.productDiscount || 0) + (o.comboDiscount || 0)))}</Text>
          </View>
        ) : null}
        {o.productDiscount ? (
          <View style={tx.totalRow}>
            <Text style={{ color: C.green }}>Giảm giá dịch vụ</Text>
            <Text style={{ fontWeight: '700', color: C.green }}>-{formatVND(o.productDiscount)}</Text>
          </View>
        ) : null}
        {o.comboDiscount ? (
          <View style={tx.totalRow}>
            <Text style={{ color: C.green }}>Ưu đãi {o.comboLabel || 'Combo nhiều máy (-5%)'}</Text>
            <Text style={{ fontWeight: '700', color: C.green }}>-{formatVND(o.comboDiscount)}</Text>
          </View>
        ) : null}
        <View style={tx.totalRow}><Text style={{ color: C.muted }}>Giá khách đã đặt</Text><Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(booked)}</Text></View>
        {priorApprovedExtra > 0 ? (
          <View style={tx.totalRow}>
            <Text style={{ color: C.muted }}>Phát sinh đã duyệt đợt trước</Text>
            <Text style={{ fontWeight: '700', color: C.ink }}>+{formatVND(priorApprovedExtra)}</Text>
          </View>
        ) : null}
        {partLines.length > 0 ? (
          <View style={tx.totalRow}>
            <Text style={{ color: C.muted }}>Sản phẩm vật tư kho ({partLines.length})</Text>
            <Text style={{ fontWeight: '700', color: rangeTotals.warehouseExtra > 0 ? C.ink : C.orange }}>
              +{formatVND(rangeTotals.warehouseExtra)}
            </Text>
          </View>
        ) : null}
        {customLines.length > 0 ? (
          <View style={tx.totalRow}>
            <Text style={{ color: C.orange }}>Vật tư mua ngoài ({customLines.length})</Text>
            <Text style={{ fontWeight: '700', color: C.orange }}>
              {formatRangeVND(rangeTotals.customExtraMin, rangeTotals.customExtraMax, { prefix: '+' })}
            </Text>
          </View>
        ) : null}
        <View style={tx.totalRow}>
          <Text style={{ color: diffMax > 0 ? C.orange : C.muted }}>
            {hasRange ? 'Tổng phát sinh thêm (dự kiến)' : 'Tổng phát sinh thêm'}
          </Text>
          <Text style={{ fontWeight: '700', color: diffMax > 0 ? C.orange : C.green }}>
            {diffMax > 0 ? formatRangeVND(diffMin, diffMax, { prefix: '+' }) : '0 đ'}
          </Text>
        </View>
        <View style={tx.totalRow}>
          <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>
            {hasRange ? 'Tổng cộng khách phải trả (dự kiến)' : (onSite ? 'Tổng cộng khách phải trả' : 'Tổng báo giá')}
          </Text>
          <Text style={[ui.price, { fontSize: hasRange && paysMin !== paysMax ? 17 : 20 }]}>
            {formatRangeVND(paysMin, paysMax)}
          </Text>
        </View>
        <View style={[tx.note, { backgroundColor: diffMax > 0 ? C.goldSoft : C.greenSoft }]}>
          <Text style={{ color: diffMax > 0 ? C.goldInk : C.green, fontWeight: '700', lineHeight: 19 }}>
            {hasRange
              ? `Vật tư mua ngoài đang báo theo giá dao động (${formatRangeVND(diffMin, diffMax)}). Khách duyệt khoảng giá này để làm; khi hoàn thành sửa chữa bạn sẽ nhập lại giá mua thực tế + hoá đơn để khách nghiệm thu.`
              : diffMax > 0
                ? `Phát sinh ${formatVND(diffMax)} → khách cần duyệt báo giá trên app trước khi làm.`
                : onSite
                  ? 'Không có phát sinh → bấm "Xác nhận & bắt đầu" để sửa theo đúng dịch vụ khách đã đặt (không cần báo giá).'
                  : 'Không phát sinh thêm chi phí → đúng theo giá dịch vụ khách đã đặt ban đầu.'}
          </Text>
        </View>
      </Card>
    </>
  );
}
