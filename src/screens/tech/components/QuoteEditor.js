// Form chẩn đoán & báo giá của thợ (dùng cho báo giá trước khi xuất phát và báo giá tại nhà).
// State bản nháp nằm ở useQuoteDraft (màn cha giữ để thanh hành động dưới cùng gửi được).
import React, { useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { C, R } from '../../../theme';
import { formatVND, formatNumberInput } from '../../../constants/data';
import { useApp, bookedValue, tierPartDiscountAmount, lateDiscountAmount, getPendingExternalEstimates, validateQuoteItemWarrantyFields } from '../../../context';
import { Tap, Btn, Card, Badge, Field, Stepper, ui, AppIcon, Radio } from '../../../components';
import { pickImage, pickCamera } from '../../../utils/media';
import { computeQuoteRangeTotals, formatRangeVND } from '../../../utils/externalPartsPricing';
import { toVietnamese } from '../../../utils/viText';
import { tx } from './techStyles';
import { isOnSiteQuote, formatSymptomPhotoNote, parseSymptomPhotoTitle } from './useQuoteDraft';
import { SymptomSection } from './SymptomSection';

function SummaryRow({ label, value, tone = 'default', bold = false }) {
  const toneColor = tone === 'green' ? C.green : tone === 'orange' ? C.orange : C.muted;
  const valColor = tone === 'green' ? C.green : tone === 'orange' ? C.orange : C.ink;
  return (
    <View style={qe.sumRow}>
      <Text style={[qe.sumLabel, { color: bold ? valColor : toneColor, fontWeight: bold ? '700' : '500' }]}>
        {label}
      </Text>
      <Text style={[qe.sumVal, { color: valColor, fontWeight: bold ? '800' : '700' }]}>
        {value}
      </Text>
    </View>
  );
}

const OOW_REASONS = [
  'Thiết bị rơi vỡ / hư hỏng do ngoại lực bên ngoài',
  'Chập cháy do nguồn điện hoặc môi trường ẩm ướt',
  'Đã có đơn vị / bên thứ 3 tháo mở hoặc sửa chữa trước đó',
  'Lý do khác',
];

export function QuoteEditor({ o, draft, cats, matsCount, onOpenMaterials, onCancelEdit, evidence }) {
  const { a, ui: u } = useApp();
  const [showCustomFee, setShowCustomFee] = useState(false);
  const [customPriceMode, setCustomPriceMode] = useState('fixed'); // 'fixed' | 'range'
  const [customFeeName, setCustomFeeName] = useState('');
  const [customFixedPrice, setCustomFixedPrice] = useState('');
  const [customMinPrice, setCustomMinPrice] = useState('');
  const [customMaxPrice, setCustomMaxPrice] = useState('');
  const [showCustomWarranty, setShowCustomWarranty] = useState(false);
  const [customWarrantyDays, setCustomWarrantyDays] = useState('');
  const [customWarrantyCode, setCustomWarrantyCode] = useState('');
  const [customSerialNumber, setCustomSerialNumber] = useState('');
  const [openSerialKeys, setOpenSerialKeys] = useState(() => ({}));
  const [busySymptomPhotoId, setBusySymptomPhotoId] = useState(null);
  const [showOowPicker, setShowOowPicker] = useState(false);
  const [oowPreset, setOowPreset] = useState(OOW_REASONS[0]);
  const [oowCustomReason, setOowCustomReason] = useState('');
  const [oowPhotos, setOowPhotos] = useState([]);
  const [oowBusy, setOowBusy] = useState(false);

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
  const partDisc = tierPartDiscountAmount(o);
  const voucherDisc = Number(o.voucherDiscount) || 0;
  const lateDisc = lateDiscountAmount(o);
  const priorApprovedExtra = o.quote?.approvedTotal != null
    ? (Number(o.quote.approvedTotal) - booked)
    : (Number(o.quote?.priorApprovedExtra) || 0);
  const origSumNet = originalLines.length > 0
    ? Math.max(0, originalLines.reduce((s, l) => s + (Number(l.price) || 0) * Math.max(1, Number(l.qty) || 1), 0) - prodDisc - comboDisc)
    : 0;
  const initServiceDelta = !onSite && originalLines.length > 0 ? (origSumNet - booked) : 0;
  const rangeTotals = computeQuoteRangeTotals(lines, {
    bookedBase: booked,
    priorApprovedExtra,
    prodDisc,
    comboDisc,
    partDisc,
    voucherDisc,
    lateDisc,
    isOnSite: onSite,
  });
  const priorPendingEst = getPendingExternalEstimates(o).filter(
    (est) => !lines.some((l) => l.isEstimatedRange && String(l.name || '').trim().toLowerCase() === String(est.name || '').trim().toLowerCase()),
  );
  const priorEstMin = priorPendingEst.reduce(
    (s, e) => s + Math.max(0, (Number(e.minPrice) || 0) - (Number(e.alreadyBilledUnitPrice) || 0)) * Math.max(1, Number(e.qty) || 1),
    0,
  );
  const priorEstMax = priorPendingEst.reduce(
    (s, e) => s + Math.max(0, (Number(e.maxPrice) || 0) - (Number(e.alreadyBilledUnitPrice) || 0)) * Math.max(1, Number(e.qty) || 1),
    0,
  );
  const hasRange = rangeTotals.hasEstimatedRange || priorEstMax > 0;
  const deductTotal = partDisc + voucherDisc + lateDisc;
  const grossWithPriorMin = rangeTotals.grossTotalMin + priorEstMin;
  const grossWithPriorMax = rangeTotals.grossTotalMax + priorEstMax;
  const diffMin = Math.max(0, grossWithPriorMin - booked);
  const diffMax = Math.max(diffMin, grossWithPriorMax - booked);
  const netReductionMin = diffMax === 0 && grossWithPriorMax < booked ? Math.max(0, booked - grossWithPriorMax) : 0;
  const netReductionMax = diffMax === 0 && grossWithPriorMin < booked ? Math.max(netReductionMin, booked - grossWithPriorMin) : 0;
  const paysMin = Math.max(0, grossWithPriorMin - deductTotal);
  const paysMax = Math.max(paysMin, grossWithPriorMax - deductTotal);

  const handleAddCustomFee = () => {
    const name = customFeeName.trim();
    if (!name) {
      u.alert('Thiếu tên vật tư', 'Vui lòng nhập tên vật tư mua ngoài.', 'alert-triangle');
      return;
    }
    if (customPriceMode === 'fixed') {
      const fixedNum = parseInt(String(customFixedPrice).replace(/[^0-9]/g, ''), 10);
      if (!fixedNum || fixedNum <= 0) {
        u.alert('Giá không hợp lệ', 'Vui lòng nhập đơn giá cố định lớn hơn 0đ.', 'alert-triangle');
        return;
      }
      const wCheck = validateQuoteItemWarrantyFields({
        isExternalPurchase: true,
        warrantyDays: customWarrantyDays,
        externalWarrantyCode: customWarrantyCode,
        serialNumber: customSerialNumber,
      });
      if (!wCheck.ok) {
        u.alert('Bảo hành linh kiện chưa hợp lệ', wCheck.error, 'alert-triangle');
        return;
      }
      const wDaysNum = customWarrantyDays.trim() ? Number(customWarrantyDays.trim()) : null;
      const newFeeLine = {
        key: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'part',
        name,
        price: fixedNum,
        minPrice: null,
        maxPrice: null,
        qty: 1,
        unit: 'cái',
        isCustom: true,
        isEstimatedRange: false,
        ...(wDaysNum ? { warrantyDays: wDaysNum } : {}),
        ...(wDaysNum && customWarrantyCode.trim() ? { externalWarrantyCode: customWarrantyCode.trim() } : {}),
        ...(customSerialNumber.trim() ? { serialNumber: customSerialNumber.trim() } : {}),
      };
      setLines((prev) => [...prev, newFeeLine]);
      setCustomFeeName('');
      setCustomFixedPrice('');
      setCustomMinPrice('');
      setCustomMaxPrice('');
      setCustomWarrantyDays('');
      setCustomWarrantyCode('');
      setCustomSerialNumber('');
      setShowCustomWarranty(false);
      setCustomPriceMode('fixed');
      setShowCustomFee(false);
      u.toast(`Đã thêm VT ngoài: ${name} (${formatVND(fixedNum)})`, 'check-circle-2');
      return;
    }
    const minNum = parseInt(String(customMinPrice).replace(/[^0-9]/g, ''), 10);
    const maxNum = parseInt(String(customMaxPrice).replace(/[^0-9]/g, ''), 10);
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
    setCustomFixedPrice('');
    setCustomMinPrice('');
    setCustomMaxPrice('');
    setCustomPriceMode('fixed');
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
          u.alert('Chưa hỗ trợ máy ảnh', 'Trên trình duyệt hãy cho phép máy ảnh hoặc chọn ảnh từ thư viện.', 'camera');
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
      u.alert('Không thêm được ảnh', toVietnamese(e?.message, 'Vui lòng thử lại.') || 'Vui lòng thử lại.', 'camera');
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

  const handlePickOowPhoto = async (source = 'camera') => {
    if (oowBusy || oowPhotos.length >= 4) return;
    let uri = source === 'camera' ? await pickCamera() : await pickImage();
    if (source === 'camera' && uri === null) uri = await pickImage();
    if (uri === null) {
      u.alert('Chưa hỗ trợ máy ảnh', 'Trên trình duyệt hãy cho phép máy ảnh hoặc chọn ảnh từ thư viện.', 'camera');
      return;
    }
    if (!uri) return;
    setOowPhotos((prev) => [
      ...prev,
      { id: `oow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, uri },
    ].slice(0, 4));
  };

  const handleRemoveOowPhoto = (photoId) => {
    if (oowBusy) return;
    setOowPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  return (
    <>
      {o.kind === 'warranty' && o.status === 'diagnosing' ? (
        <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.red }}>
          <Text style={[tx.h, { color: C.redInk, marginBottom: 4 }]}>Thẩm định bảo hành tại chỗ</Text>
          <Text style={{ color: C.ink2, fontSize: 13, lineHeight: 19 }}>
            Nếu thiết bị bị rơi vỡ, chập cháy nguồn điện ngoài hoặc tác động của bên thứ 3, KTV chọn lý do từ chối bảo hành để chuyển sang Báo giá sửa có phí.
          </Text>
          {showOowPicker ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              {OOW_REASONS.map((r) => {
                const picked = oowPreset === r;
                return (
                  <Tap
                    key={r}
                    onPress={() => setOowPreset(r)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      padding: 10,
                      borderRadius: R.md,
                      borderWidth: 1,
                      borderColor: picked ? C.red : C.line,
                      backgroundColor: picked ? C.redSoft : C.bg,
                    }}
                  >
                    <Radio on={picked} />
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: picked ? '700' : '500', color: picked ? C.redInk : C.ink }}>{r}</Text>
                  </Tap>
                );
              })}
              {oowPreset === 'Lý do khác' ? (
                <Field
                  label="Nhập lý do ngoài bảo hành *"
                  placeholder="Mô tả nguyên nhân hư hỏng do ngoại lực / lỗi người dùng…"
                  value={oowCustomReason}
                  onChangeText={setOowCustomReason}
                  style={{ marginTop: 4 }}
                />
              ) : null}
              <View style={{ marginTop: 6, padding: 10, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.ink }}>
                  Ảnh minh chứng ngoài bảo hành ({oowPhotos.length}/4)
                </Text>
                <Text style={[ui.meta, { marginTop: 2, lineHeight: 17 }]}>
                  Chụp hoặc tải ảnh lỗi thực tế (rơi vỡ, chập cháy, dấu hiệu tháo mở…) để lưu hồ sơ & đối chiếu với khách.
                </Text>
                {oowPhotos.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {oowPhotos.map((ph) => (
                      <View
                        key={ph.id}
                        style={{ width: 72, height: 72, borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}
                      >
                        <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                        <Tap
                          onPress={() => handleRemoveOowPhoto(ph.id)}
                          hitSlop={6}
                          style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(15,23,42,0.75)', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <AppIcon name="x" size={12} color="#fff" strokeWidth={2.5} />
                        </Tap>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Btn
                    title="Chụp ảnh"
                    icon="camera"
                    variant="soft"
                    small
                    style={{ flex: 1 }}
                    disabled={oowBusy || oowPhotos.length >= 4}
                    onPress={() => handlePickOowPhoto('camera')}
                  />
                  <Btn
                    title="Tải ảnh lên"
                    icon="image"
                    variant="outline"
                    small
                    style={{ flex: 1 }}
                    disabled={oowBusy || oowPhotos.length >= 4}
                    onPress={() => handlePickOowPhoto('library')}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <Btn title="Huỷ" variant="ghost" small style={{ flex: 1 }} disabled={oowBusy} onPress={() => setShowOowPicker(false)} />
                <Btn
                  title={oowBusy ? 'Đang gửi…' : 'Xác nhận chuyển có phí'}
                  variant="danger"
                  small
                  style={{ flex: 1.6 }}
                  disabled={oowBusy}
                  onPress={async () => {
                    const finalReason = oowPreset === 'Lý do khác' ? oowCustomReason.trim() : oowPreset;
                    if (finalReason.length < 5) {
                      u.alert('Thiếu lý do', 'Vui lòng mô tả lý do ngoài bảo hành (tối thiểu 5 ký tự).', 'alert-triangle');
                      return;
                    }
                    setOowBusy(true);
                    try {
                      const ok = await a.rejectWarrantyAsOutOfWarranty(
                        o.code,
                        finalReason,
                        oowPhotos.map((p) => p.uri),
                      );
                      if (ok) {
                        setShowOowPicker(false);
                        setOowPhotos([]);
                        setOowCustomReason('');
                      }
                    } finally {
                      setOowBusy(false);
                    }
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Btn
                title="Từ chối bảo hành (Do lỗi người dùng) → Báo giá có phí"
                variant="dangerSoft"
                onPress={() => setShowOowPicker(true)}
              />
            </View>
          )}
        </Card>
      ) : null}
      {o.quote?.revisionRequested ? (
        <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
          <Text style={[tx.h, { color: C.goldInk, marginBottom: 4 }]}>Khách yêu cầu điều chỉnh báo giá</Text>
          <Text style={{ color: C.ink, lineHeight: 20 }}>
            Lý do: <Text style={{ fontWeight: '800' }}>{o.quote.rejectReason || 'Cần trao đổi lại phương án / chi phí'}</Text>
          </Text>
          <Text style={[ui.meta, { color: C.muted, marginTop: 4 }]}>
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
      {onSite ? (
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
      ) : (
        <Card style={{ marginTop: 12, backgroundColor: C.surface }}>
          <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 18 }}>
            Báo giá trước khi xuất phát dùng để thoả thuận danh mục vật tư / linh kiện dự kiến. Chẩn đoán kỹ thuật & ảnh triệu chứng chi tiết sẽ được ghi nhận sau khi thợ đến nơi.
          </Text>
        </Card>
      )}
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={tx.h}>Báo giá chi tiết</Text>
          <Badge
            text={
              diffMax > 0
                ? `${hasRange ? 'Dự kiến ' : ''}${formatRangeVND(diffMin, diffMax, { prefix: '+' })}`
                : 'Đúng giá gốc (0đ)'
            }
            fg={diffMax > 0 ? C.goldInk : C.greenInk}
            bg={diffMax > 0 ? C.goldSoft : C.greenSoft}
          />
        </View>

        {/* 1. Dịch vụ gốc đã đặt */}
        <Text style={[ui.meta, { fontWeight: '700', color: C.ink, marginTop: 8, marginBottom: 4 }]}>
          Dịch vụ ban đầu ({originalLines.length})
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
                <Badge text={`x${l.qty} ${l.unit || 'lần'}`} fg={C.ink2} bg={C.surface} />
              )}
            </View>
          </View>
        ))}

        {/* 2. Vật tư thay thế (nếu có) */}
        {partLines.length ? (
          <>
            <Text style={[ui.meta, { fontWeight: '700', color: C.ink, marginTop: 12, marginBottom: 4 }]}>
              Vật tư / Linh kiện kho ({partLines.length})
            </Text>
            {partLines.map((l) => {
              const showPriceInput = Boolean(l.needsPriceInput || !(Number(l.price) > 0));
              const serialOpen = Boolean(openSerialKeys[l.key] || l.serialNumber);
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
                      {!serialOpen ? (
                        <Tap
                          onPress={() => setOpenSerialKeys((prev) => ({ ...prev, [l.key]: true }))}
                          hitSlop={6}
                          style={{ marginTop: 4, alignSelf: 'flex-start' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>＋ Số sê-ri (tuỳ chọn)</Text>
                        </Tap>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Stepper value={l.qty} onChange={(q) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
                      <Tap onPress={() => setLines((p) => p.filter((x) => x.key !== l.key))} hitSlop={8} style={{ padding: 4 }}>
                        <Text style={{ color: C.red, fontSize: 13, fontWeight: '700' }}>✕</Text>
                      </Tap>
                    </View>
                  </View>
                  {serialOpen ? (
                    <Field
                      label="Số sê-ri linh kiện (tuỳ chọn)"
                      placeholder="VD: SN-2026-001 (tối đa 100 ký tự)"
                      value={l.serialNumber || ''}
                      maxLength={100}
                      onChangeText={(t) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, serialNumber: t } : x)))}
                      style={{ marginTop: 0 }}
                    />
                  ) : null}
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
            <Text style={[ui.meta, { fontWeight: '700', color: C.ink, marginTop: 12, marginBottom: 4 }]}>
              Vật tư mua ngoài ({customLines.length})
            </Text>
            {customLines.map((l) => (
              <View key={l.key} style={tx.lineRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={2}>{l.name}</Text>
                    <Badge
                      text={l.isEstimatedRange ? 'Giá dao động' : 'VT ngoài · Giá cố định'}
                      fg={l.isEstimatedRange ? C.goldInk : C.primary}
                      bg={l.isEstimatedRange ? C.goldSoft : C.primarySoft}
                    />
                  </View>
                  {l.isEstimatedRange ? (
                    <Text style={ui.meta}>
                      {formatRangeVND(l.minPrice, l.maxPrice)} x{l.qty} = <Text style={{ fontWeight: '700', color: C.goldInk }}>{formatRangeVND(l.minPrice * l.qty, l.maxPrice * l.qty)}</Text>
                    </Text>
                  ) : (
                    <>
                      <Text style={ui.meta}>{formatVND(l.price)} x{l.qty} = <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text></Text>
                      {(l.warrantyDays || l.externalWarrantyCode || l.serialNumber) ? (
                        <Text style={{ fontSize: 11.5, color: C.primary, fontWeight: '600', marginTop: 2 }}>
                          {[
                            l.warrantyDays ? `BH hãng ${l.warrantyDays} ngày` : null,
                            l.externalWarrantyCode ? `Mã BH: ${l.externalWarrantyCode}` : null,
                            l.serialNumber ? `SN: ${l.serialNumber}` : null,
                          ].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </>
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
              { flex: 1, marginTop: 0, flexDirection: 'row', gap: 5, borderColor: showCustomFee ? C.primary : C.line, backgroundColor: showCustomFee ? C.primarySoft : C.surface },
            ]}
            onPress={() => setShowCustomFee((v) => !v)}
          >
            <AppIcon name="plus" size={14} color={showCustomFee ? C.primary : C.ink2} strokeWidth={2.5} />
            <Text style={{ color: showCustomFee ? C.primary : C.ink2, fontWeight: '700', fontSize: 13 }}>Vật tư mua ngoài</Text>
          </Tap>
        </View>

        {showCustomFee ? (
          <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5 }}>
                Thêm vật tư mua ngoài
              </Text>
              <Tap onPress={() => setShowCustomFee(false)} hitSlop={8}><Text style={{ color: C.muted, fontWeight: '700' }}>Đóng</Text></Tap>
            </View>

            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, padding: 3, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
              <Tap
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  paddingHorizontal: 8,
                  borderRadius: R.sm,
                  alignItems: 'center',
                  backgroundColor: customPriceMode === 'fixed' ? C.card : 'transparent',
                }}
                onPress={() => setCustomPriceMode('fixed')}
              >
                <Text style={{ fontSize: 12.5, fontWeight: customPriceMode === 'fixed' ? '800' : '600', color: customPriceMode === 'fixed' ? C.primary : C.ink2 }}>
                  Giá cố định (1 lần duyệt)
                </Text>
              </Tap>
              <Tap
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  paddingHorizontal: 8,
                  borderRadius: R.sm,
                  alignItems: 'center',
                  backgroundColor: customPriceMode === 'range' ? C.card : 'transparent',
                }}
                onPress={() => setCustomPriceMode('range')}
              >
                <Text style={{ fontSize: 12.5, fontWeight: customPriceMode === 'range' ? '800' : '600', color: customPriceMode === 'range' ? C.goldInk : C.ink2 }}>
                  Giá dao động (chốt sau)
                </Text>
              </Tap>
            </View>

            <Text style={[ui.meta, { marginTop: 0, marginBottom: 10, lineHeight: 17 }]}>
              {customPriceMode === 'fixed'
                ? 'Nhập giá đã biết trước — khách duyệt 1 lần duy nhất (chụp kèm biên lai khi sửa).'
                : 'Chưa rõ giá chợ — báo khoảng giá dự kiến, sửa xong nhập giá thực tế + hoá đơn để khách chốt.'}
            </Text>

            <Field
              label="Tên vật tư"
              placeholder="Ví dụ: Dây đồng Thái Lan 2m, Cầu dao phụ Panasonic..."
              value={customFeeName}
              onChangeText={setCustomFeeName}
            />

            {customPriceMode === 'fixed' ? (
              <>
                <Field
                  label="Đơn giá cố định (VNĐ) *"
                  placeholder="VD: 150.000"
                  value={customFixedPrice}
                  onChangeText={(t) => setCustomFixedPrice(formatNumberInput(t))}
                  keyboardType="numeric"
                  style={{ marginTop: 8 }}
                />
                <Tap
                  onPress={() => setShowCustomWarranty((v) => !v)}
                  style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.primary }}>
                    {showCustomWarranty ? '▾ Ẩn thông tin bảo hành hãng & sê-ri' : '＋ Bảo hành hãng & Số sê-ri (tuỳ chọn)'}
                  </Text>
                </Tap>
                {showCustomWarranty ? (
                  <View style={{ marginTop: 6, gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Field
                        label="Số ngày BH (1–3650)"
                        placeholder="VD: 180"
                        value={customWarrantyDays}
                        onChangeText={(t) => setCustomWarrantyDays(t.replace(/[^0-9]/g, '').slice(0, 4))}
                        keyboardType="numeric"
                        style={{ flex: 1, marginTop: 0 }}
                      />
                      <Field
                        label="Mã phiếu BH hãng"
                        placeholder="VD: HANG-1"
                        value={customWarrantyCode}
                        maxLength={100}
                        onChangeText={setCustomWarrantyCode}
                        style={{ flex: 1.2, marginTop: 0 }}
                      />
                    </View>
                    <Field
                      label="Số sê-ri linh kiện"
                      placeholder="VD: SN-NEW (tối đa 100 ký tự)"
                      value={customSerialNumber}
                      maxLength={100}
                      onChangeText={setCustomSerialNumber}
                      style={{ marginTop: 0 }}
                    />
                  </View>
                ) : null}
              </>
            ) : (
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
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn
                title="Hủy"
                variant="ghost"
                small
                style={{ flex: 1 }}
                onPress={() => {
                  setShowCustomFee(false);
                  setCustomFeeName('');
                  setCustomFixedPrice('');
                  setCustomMinPrice('');
                  setCustomMaxPrice('');
                  setCustomWarrantyDays('');
                  setCustomWarrantyCode('');
                  setCustomSerialNumber('');
                  setShowCustomWarranty(false);
                  setCustomPriceMode('fixed');
                }}
              />
              <Btn title="Thêm vào báo giá" small style={{ flex: 1.6 }} onPress={handleAddCustomFee} />
            </View>
          </View>
        ) : null}

        {(() => {
          const extraSources =
            (priorApprovedExtra !== 0 ? 1 : 0) +
            (initServiceDelta !== 0 ? 1 : 0) +
            (partLines.length > 0 ? 1 : 0) +
            (customLines.length > 0 ? 1 : 0);
          const sameAsSingleExtra = extraSources === 1 && (
            (customLines.length > 0 && diffMin === rangeTotals.customExtraMin && diffMax === rangeTotals.customExtraMax) ||
            (partLines.length > 0 && diffMin === rangeTotals.warehouseExtra && diffMax === rangeTotals.warehouseExtra) ||
            (priorApprovedExtra > 0 && diffMin === priorApprovedExtra && diffMax === priorApprovedExtra) ||
            (priorApprovedExtra < 0 && diffMax === 0 && netReductionMin === Math.abs(priorApprovedExtra) && netReductionMax === Math.abs(priorApprovedExtra)) ||
            (initServiceDelta > 0 && diffMin === initServiceDelta && diffMax === initServiceDelta) ||
            (initServiceDelta < 0 && diffMax === 0 && netReductionMin === Math.abs(initServiceDelta) && netReductionMax === Math.abs(initServiceDelta))
          );
          const isRangeTotal = hasRange && paysMin !== paysMax;
          return (
            <View style={qe.summaryBox}>
              {(o.productDiscount || o.comboDiscount) ? (
                <SummaryRow
                  label="Tổng tiền dịch vụ"
                  value={formatVND(o.goods || (booked + (o.productDiscount || 0) + (o.comboDiscount || 0)))}
                />
              ) : null}
              {o.productDiscount ? (
                <SummaryRow label="Giảm giá dịch vụ" value={`-${formatVND(o.productDiscount)}`} tone="green" />
              ) : null}
              {o.comboDiscount ? (
                <SummaryRow label={`Ưu đãi ${o.comboLabel || 'gộp nhiều máy (-5%)'}`} value={`-${formatVND(o.comboDiscount)}`} tone="green" />
              ) : null}
              <SummaryRow label="Giá khách đã đặt" value={formatVND(booked)} />
              {priorApprovedExtra > 0 ? (
                <SummaryRow label="Phát sinh đã duyệt đợt trước" value={`+${formatVND(priorApprovedExtra)}`} />
              ) : priorApprovedExtra < 0 ? (
                <SummaryRow label="Điều chỉnh giảm đợt trước" value={`-${formatVND(Math.abs(priorApprovedExtra))}`} tone="green" />
              ) : null}
              {initServiceDelta > 0 ? (
                <SummaryRow label="Điều chỉnh tăng dịch vụ" value={`+${formatVND(initServiceDelta)}`} />
              ) : initServiceDelta < 0 ? (
                <SummaryRow label="Điều chỉnh giảm dịch vụ" value={`-${formatVND(Math.abs(initServiceDelta))}`} tone="green" />
              ) : null}
              {partLines.length > 0 ? (
                <SummaryRow
                  label={`Sản phẩm vật tư kho (${partLines.length})`}
                  value={`+${formatVND(rangeTotals.warehouseExtra)}`}
                  tone={rangeTotals.warehouseExtra > 0 ? 'default' : 'orange'}
                />
              ) : null}
              {customLines.length > 0 ? (
                <SummaryRow
                  label={`Vật tư mua ngoài (${customLines.length})`}
                  value={formatRangeVND(rangeTotals.customExtraMin, rangeTotals.customExtraMax, { prefix: '+' })}
                  tone="orange"
                />
              ) : null}
              {!sameAsSingleExtra ? (
                diffMax === 0 && netReductionMax > 0 ? (
                  <SummaryRow
                    label={hasRange ? 'Chênh lệch dự kiến so với giá đặt' : 'Chênh lệch so với giá đặt'}
                    value={formatRangeVND(netReductionMin, netReductionMax, { prefix: '-' })}
                    tone="green"
                    bold
                  />
                ) : (
                  <SummaryRow
                    label={hasRange ? 'Tổng phát sinh thêm (dự kiến)' : 'Tổng phát sinh thêm'}
                    value={diffMax > 0 ? formatRangeVND(diffMin, diffMax, { prefix: '+' }) : '0 đ'}
                    tone={diffMax > 0 ? 'orange' : 'green'}
                    bold
                  />
                )
              ) : null}
              {partDisc > 0 ? (
                <SummaryRow label={`Ưu đãi hạng thành viên (−${o.bill?.tierPartDiscountPercent || 0}% VT)`} value={`-${formatVND(partDisc)}`} tone="green" />
              ) : null}
              {voucherDisc > 0 ? (
                <SummaryRow label={`Mã giảm giá ${o.voucher?.code || ''}`} value={`-${formatVND(voucherDisc)}`} tone="green" />
              ) : null}
              {lateDisc > 0 ? (
                <SummaryRow label="Bồi thường đến muộn" value={`-${formatVND(lateDisc)}`} tone="green" />
              ) : null}

              <View style={qe.grandWrap}>
                {isRangeTotal ? (
                  <>
                    <View style={qe.grandHead}>
                      <Text style={[qe.grandLabel, { flex: 1 }]}>Tổng cộng khách phải trả</Text>
                      <Badge text="Dự kiến" fg={C.goldInk} bg={C.goldSoft} />
                    </View>
                    <Text
                      style={[ui.price, qe.grandRangePrice]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatRangeVND(paysMin, paysMax)}
                    </Text>
                  </>
                ) : (
                  <View style={qe.grandSingleRow}>
                    <Text style={[qe.grandLabel, { flex: 1 }]}>
                      {onSite ? 'Tổng cộng khách phải trả' : 'Tổng báo giá'}
                    </Text>
                    <Text style={[ui.price, qe.grandSinglePrice]}>
                      {formatVND(paysMin)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}
        {!onSite ? (
          <Text style={[ui.meta, { color: C.muted, marginTop: 8, lineHeight: 17 }]}>
            Báo giá trước khi xuất phát — kết quả kiểm tra & chẩn đoán chi tiết sẽ được ghi nhận sau khi xác nhận đến nơi tại nhà khách.
          </Text>
        ) : null}
        {o.quoteEditing ? (
          <Btn
            title="Huỷ sửa báo giá"
            variant="ghost"
            small
            style={{ marginTop: 10 }}
            onPress={() => {
              a.cancelReopenQuote?.(o.code);
              onCancelEdit?.();
            }}
          />
        ) : null}
        <View
          style={[
            qe.callout,
            {
              backgroundColor: diffMax > 0 ? C.orangeSoft : C.greenSoft,
              borderColor: diffMax > 0 ? C.goldBorder : C.greenBorder,
              borderLeftColor: diffMax > 0 ? C.gold : C.green,
            },
          ]}
        >
          <AppIcon
            name={hasRange ? 'receipt-text' : (diffMax > 0 ? 'info' : 'check-circle-2')}
            size={17}
            color={diffMax > 0 ? C.gold : C.green}
            strokeWidth={2.2}
            style={{ marginTop: 1 }}
          />
          <Text style={[qe.calloutText, { color: diffMax > 0 ? C.ink2 : C.greenInk }]}>
            {hasRange ? (
              <>
                Vật tư mua ngoài đang báo theo khoảng giá dao động{' '}
                <Text style={{ fontWeight: '700', color: C.goldInk }}>{formatRangeVND(diffMin, diffMax)}</Text>.
                {' '}Khách duyệt khoảng giá này để thực hiện; khi sửa xong bạn sẽ nhập giá mua thực tế + hoá đơn để khách nghiệm thu.
              </>
            ) : diffMax > 0 ? (
              <>
                Chi phí phát sinh{' '}
                <Text style={{ fontWeight: '700', color: C.goldInk }}>{formatVND(diffMax)}</Text>
                {' '}— khách cần duyệt báo giá trên ứng dụng trước khi thực hiện.
              </>
            ) : onSite ? (
              'Không có phát sinh → bấm "Xác nhận & bắt đầu" để sửa theo đúng dịch vụ khách đã đặt (không cần báo giá).'
            ) : (
              'Không phát sinh thêm chi phí → đúng theo giá dịch vụ khách đã đặt ban đầu.'
            )}
          </Text>
        </View>
      </Card>
    </>
  );
}

const qe = StyleSheet.create({
  summaryBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: R.md,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 5,
  },
  sumLabel: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
  },
  sumVal: {
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 13.5,
    lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
  grandWrap: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  grandHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  grandLabel: {
    fontWeight: '800',
    fontSize: 14,
    color: C.ink,
  },
  grandRangePrice: {
    fontSize: 19,
    fontWeight: '900',
    color: C.navy,
    textAlign: 'right',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  grandSingleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  grandSinglePrice: {
    fontSize: 19,
    fontWeight: '900',
    color: C.navy,
    flexShrink: 0,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  callout: {
    marginTop: 12,
    padding: 12,
    borderRadius: R.md,
    borderWidth: 1,
    borderLeftWidth: 3.5,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  calloutText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18.5,
    fontWeight: '500',
  },
});
