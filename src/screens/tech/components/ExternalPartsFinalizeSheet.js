// Sheet chốt giá mua thực tế + ảnh biên lai cho các vật tư mua ngoài đã báo giá dao động ở Bước 1.
// Khi thợ gửi xong, backend tạo báo giá phụ để khách nghiệm thu trước khi thanh toán hoàn thành.
import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { C, R } from '../../../theme';
import { formatVND, formatNumberInput } from '../../../constants/data';
import { useApp, bookedValue, tierPartDiscountAmount, lateDiscountAmount } from '../../../context';
import { Btn, Field, Sheet, Stepper, Tap, ui, AppIcon, Badge } from '../../../components';
import { pickCamera, pickImage } from '../../../utils/media';
import { formatRangeVND, normalizeExternalPartName } from '../../../utils/externalPartsPricing';
import { useBusyRunner } from './useBusyRunner';

const parseNum = (text) => parseInt(String(text || '').replace(/[^0-9]/g, ''), 10) || 0;

export function ExternalPartsFinalizeSheet({
  o,
  visible,
  onClose,
  initialSummary = '',
  sharedExtraParts,
  onChangeSharedExtraParts,
}) {
  const { a, ui: u } = useApp();
  const { run, isBusy } = useBusyRunner();
  const [parts, setParts] = useState([]);
  const [summary, setSummary] = useState(initialSummary);
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartPriceText, setNewPartPriceText] = useState('');

  useEffect(() => {
    if (!visible || !o) return;
    setSummary(initialSummary);
    setShowAddExtra(false);
    setNewPartName('');
    setNewPartPriceText('');

    const sharedByName = new Map(
      (Array.isArray(sharedExtraParts) ? sharedExtraParts : []).map((p) => [normalizeExternalPartName(p.name), p]),
    );
    const sharedInline = (Array.isArray(sharedExtraParts) ? sharedExtraParts : []).filter((p) => p.isAddedInline);

    const isRevision = o.externalPriceState === 'revision_requested' && o.quote?.isExternalFinalization;
    if (isRevision) {
      // Bỏ các dòng đã được khách duyệt ở đợt trước (isPriorApproved) để không gửi lại / tính tiền 2 lần.
      const finLines = (o.quote?.lines || []).filter((l) => l.isFinalizedExternal && !l.isPriorApproved);
      const baseParts = finLines.map((l, idx) => {
        const draft = sharedByName.get(normalizeExternalPartName(l.name));
        return {
          id: l.dbItemId || `rev_${idx}`,
          name: l.name,
          minPrice: l.minPrice,
          maxPrice: l.maxPrice,
          qty: draft ? Math.max(1, Number(draft.qty) || 1) : Math.max(1, Number(l.qty) || 1),
          origQty: draft?.origQty ?? Math.max(1, Number(l.qty) || 1),
          alreadyBilledUnitPrice: Number(l.priorDeposit) || 0,
          actualPriceText: draft?.actualPriceText || formatNumberInput(String(l.actualPrice ?? l.price ?? '')),
          receiptId: draft?.receiptId || l.receiptId || null,
          receiptUri: draft?.receiptUri || null,
        };
      });
      setParts([...baseParts, ...sharedInline]);
      return;
    }

    const pending = o.pendingExternalEstimates || [];
    const baseParts = pending.map((est, idx) => {
      const draft = sharedByName.get(normalizeExternalPartName(est.name));
      return {
        id: est.itemId || `est_${idx}`,
        name: est.name,
        minPrice: est.minPrice,
        maxPrice: est.maxPrice,
        qty: draft ? Math.max(1, Number(draft.qty) || 1) : Math.max(1, Number(est.qty) || 1),
        origQty: draft?.origQty ?? Math.max(1, Number(est.qty) || 1),
        alreadyBilledUnitPrice: Number(est.alreadyBilledUnitPrice) || 0,
        actualPriceText: draft?.actualPriceText
          || (est.alreadyBilledUnitPrice > 0 ? formatNumberInput(String(est.alreadyBilledUnitPrice)) : ''),
        receiptId: draft?.receiptId || null,
        receiptUri: draft?.receiptUri || null,
      };
    });
    setParts([...baseParts, ...sharedInline]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!o) return null;
  const busyKey = `finalize-ext:${o.code}`;
  const busy = isBusy(busyKey);

  const pickReceipt = async (partId, useCamera) => {
    try {
      let uri = useCamera ? await pickCamera() : await pickImage();
      if (uri === null && useCamera) uri = await pickImage();
      if (!uri) {
        if (uri === null) {
          u.alert('Chưa chọn được ảnh', 'Vui lòng cấp quyền truy cập camera/thư viện để tải ảnh hoá đơn.', 'camera');
        }
        return;
      }
      setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, receiptUri: uri } : p)));
    } catch (e) {
      u.alert('Không tải được ảnh', (e && e.message) || 'Vui lòng thử lại.', 'camera');
    }
  };

  const isRevision = o.externalPriceState === 'revision_requested' && o.quote?.isExternalFinalization;
  const fixedApprovedExtras = (o.quote?.lines || [])
    .filter((l) => !l.isOriginal && !l.isEstimatedRange && !l.isFinalizedExternal)
    .reduce((sum, l) => sum + (Number(l.price) || 0) * Math.max(1, Number(l.qty) || 1), 0);
  const billedExternalDeposits = parts.reduce(
    (sum, p) => sum + (Number(p.alreadyBilledUnitPrice) || 0) * Math.max(1, Number(p.origQty ?? p.qty) || 1),
    0,
  );
  const baseBeforeFinalization = !isRevision && o?.bill && o.bill.quotationTotal != null
    ? Math.max(0, Number(o.bill.amountDue) || 0)
    : Math.max(
        0,
        bookedValue(o) +
          (isRevision && o.quote?.priorApprovedExtra != null
            ? Number(o.quote.priorApprovedExtra) || 0
            : fixedApprovedExtras + billedExternalDeposits) -
          tierPartDiscountAmount(o) -
          (Number(o.voucherDiscount) || 0) -
          lateDiscountAmount(o),
      );

  const actualPartsTotal = parts.reduce((sum, p) => sum + parseNum(p.actualPriceText) * p.qty, 0);
  const addedExternalDelta = parts.reduce(
    (sum, p) => sum + Math.max(0, parseNum(p.actualPriceText) * p.qty - (Number(p.alreadyBilledUnitPrice) || 0) * Math.max(1, Number(p.origQty ?? p.qty) || 1)),
    0,
  );
  const projectedTotal = baseBeforeFinalization + addedExternalDelta;

  const close = () => { if (!busy) onClose?.(); };

  const submit = () => run(busyKey, async () => {
    const payloadParts = parts.map((p) => ({
      name: p.name,
      minPrice: p.minPrice,
      maxPrice: p.maxPrice,
      qty: p.qty,
      origQty: Math.max(1, Number(p.origQty ?? p.qty) || 1),
      alreadyBilledUnitPrice: p.alreadyBilledUnitPrice,
      actualPrice: parseNum(p.actualPriceText),
      receiptUri: p.receiptUri,
      receiptId: p.receiptId,
    }));
    const ok = await Promise.resolve(
      a.submitExternalPartsActualPrice(o.code, {
        parts: payloadParts,
        summary: summary.trim(),
      }),
    );
    if (ok) {
      onChangeSharedExtraParts?.((prev) => prev.filter((p) => !p.isAddedInline));
      onClose?.();
    }
    return ok;
  });

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Chốt giá vật tư mua ngoài"
      footer={(
        <Btn
          title={busy ? 'Đang gửi cho khách…' : 'Gửi giá thực tế để khách nghiệm thu'}
          icon="send"
          disabled={busy || !parts.length}
          onPress={submit}
        />
      )}
    >
      <View style={st.notice}>
        <AppIcon name="receipt-text" size={18} color={C.primary} strokeWidth={2.2} />
        <Text style={st.noticeText}>
          Ở bước trước bạn báo theo khoảng giá dao động. Hãy nhập giá mua thực tế trên hoá đơn và đính kèm ảnh biên lai để khách hàng nghiệm thu trước khi thanh toán.
        </Text>
      </View>

      {isRevision && o.quote?.rejectReason ? (
        <View style={st.reviseBox}>
          <Text style={st.reviseTitle}>🔄 Khách yêu cầu kiểm tra lại giá:</Text>
          <Text style={st.reviseReason}>{o.quote.rejectReason}</Text>
        </View>
      ) : null}

      {parts.map((p, idx) => {
        const actualNum = parseNum(p.actualPriceText);
        const hasRange = p.minPrice != null && p.maxPrice != null && p.maxPrice > 0;
        const inRange = hasRange && actualNum >= p.minPrice && actualNum <= p.maxPrice;
        const existingImg = p.receiptId
          ? (o.evidence || []).find((e) => String(e.dbAttachmentId) === String(p.receiptId))?.uri
          : null;
        const previewUri = p.receiptUri || existingImg;

        return (
          <View key={p.id} style={st.partCard}>
            <View style={st.partHead}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={st.partName}>{idx + 1}. {p.name}</Text>
                {hasRange ? (
                  <Text style={st.rangeSub}>
                    Giá dao động đã báo: {formatRangeVND(p.minPrice, p.maxPrice)} / cái
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Stepper
                  value={p.qty}
                  onChange={(q) => setParts((prev) => prev.map((x) => (x.id === p.id ? { ...x, qty: q } : x)))}
                />
                {p.isAddedInline ? (
                  <Tap onPress={() => setParts((prev) => prev.filter((x) => x.id !== p.id))} hitSlop={8} style={{ padding: 4 }}>
                    <Text style={{ color: C.red, fontSize: 13, fontWeight: '800' }}>✕</Text>
                  </Tap>
                ) : null}
              </View>
            </View>

            <Field
              label="Mức giá cuối cùng (VNĐ / cái) *"
              placeholder={hasRange ? `VD: ${formatNumberInput(String(p.minPrice))}` : 'Nhập giá chốt (VD: 150.000)...'}
              value={p.actualPriceText}
              onChangeText={(t) => setParts((prev) => prev.map((x) => (x.id === p.id ? { ...x, actualPriceText: formatNumberInput(t) } : x)))}
              keyboardType="numeric"
              style={{ marginTop: 6 }}
            />

            {actualNum > 0 && hasRange ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <AppIcon
                  name={inRange ? 'check-circle-2' : 'alert-triangle'}
                  size={14}
                  color={inRange ? C.green : C.orange}
                  strokeWidth={2.3}
                />
                <Text style={{ fontSize: 12, fontWeight: '700', color: inRange ? C.green : C.orange, flex: 1 }}>
                  {inRange
                    ? `Nằm trong khoảng giá dự kiến (Thành tiền: ${formatVND(actualNum * p.qty)})`
                    : `Ngoài khoảng giá dự kiến (${formatRangeVND(p.minPrice, p.maxPrice)}) — hãy chụp rõ hoá đơn để khách đối chiếu`}
                </Text>
              </View>
            ) : null}

            <Text style={[ui.fieldLabel, { marginTop: 12, marginBottom: 6 }]}>
              Ảnh biên lai / hoá đơn (khuyến khích nếu mua ngoài)
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {previewUri ? (
                <View style={st.thumb}>
                  <Image source={{ uri: previewUri }} style={{ width: '100%', height: '100%' }} />
                </View>
              ) : (
                <View style={[st.thumb, st.thumbEmpty]}>
                  <AppIcon name="receipt-text" size={22} color={C.muted} />
                </View>
              )}
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn
                    title={previewUri ? 'Chụp lại' : 'Chụp biên lai'}
                    icon="camera"
                    small
                    variant="soft"
                    style={{ flex: 1 }}
                    onPress={() => pickReceipt(p.id, true)}
                  />
                  <Btn
                    title="Chọn ảnh"
                    icon="image"
                    small
                    variant="outline"
                    style={{ flex: 1 }}
                    onPress={() => pickReceipt(p.id, false)}
                  />
                </View>
                {p.receiptUri || p.receiptId ? (
                  <Badge text="Đã đính kèm hoá đơn" fg={C.green} bg={C.greenSoft} />
                ) : (
                  <Text style={{ fontSize: 11.5, color: C.muted, fontWeight: '600' }}>
                    Tuỳ chọn: đính kèm ảnh hoá đơn nếu mua ngoài để khách dễ đối chiếu
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}

      {!isRevision ? (
        showAddExtra ? (
          <View style={st.addExtraBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13 }}>Thêm vật tư phát sinh mới</Text>
              <Tap onPress={() => setShowAddExtra(false)} hitSlop={8}>
                <Text style={{ color: C.muted, fontWeight: '700' }}>Đóng</Text>
              </Tap>
            </View>
            <Field
              label="Tên vật tư phát sinh *"
              placeholder="VD: Dây đồng 2m, Tụ kích, Van xả..."
              value={newPartName}
              onChangeText={setNewPartName}
            />
            <Field
              label="Mức giá cuối cùng (VNĐ / cái) *"
              placeholder="VD: 150.000"
              value={newPartPriceText}
              onChangeText={(t) => setNewPartPriceText(formatNumberInput(t))}
              keyboardType="numeric"
              style={{ marginTop: 8 }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Btn
                title="Huỷ"
                variant="ghost"
                small
                style={{ flex: 1 }}
                onPress={() => {
                  setShowAddExtra(false);
                  setNewPartName('');
                  setNewPartPriceText('');
                }}
              />
              <Btn
                title="Thêm vào Bill"
                small
                style={{ flex: 1.5 }}
                onPress={() => {
                  const clean = newPartName.trim();
                  const priceNum = parseNum(newPartPriceText);
                  if (!clean) {
                    u.alert('Thiếu tên vật tư', 'Vui lòng nhập tên vật tư phát sinh.', 'alert-triangle');
                    return;
                  }
                  if (!priceNum || priceNum <= 0) {
                    u.alert('Giá không hợp lệ', 'Vui lòng nhập mức giá cuối cùng lớn hơn 0đ.', 'alert-triangle');
                    return;
                  }
                  setParts((prev) => [
                    ...prev,
                    {
                      id: `sheet_ext_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                      name: clean,
                      minPrice: null,
                      maxPrice: null,
                      qty: 1,
                      alreadyBilledUnitPrice: 0,
                      actualPriceText: formatNumberInput(String(priceNum)),
                      receiptId: null,
                      receiptUri: null,
                      isAddedInline: true,
                    },
                  ]);
                  setNewPartName('');
                  setNewPartPriceText('');
                  setShowAddExtra(false);
                }}
              />
            </View>
          </View>
        ) : (
          <Tap style={st.addExtraBtn} onPress={() => setShowAddExtra(true)}>
            <AppIcon name="plus" size={14} color={C.primary} strokeWidth={2.5} />
            <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>Thêm vật tư phát sinh khác</Text>
          </Tap>
        )
      ) : null}

      <Field
        label="Nội dung công việc đã hoàn thành"
        multiline
        value={summary}
        onChangeText={setSummary}
        placeholder="Mô tả công việc đã làm & linh kiện vừa thay thế..."
        style={{ marginTop: 4 }}
      />

      <View style={st.summaryBox}>
        <View style={st.summaryRow}>
          <Text style={st.summaryLabel}>Tổng vật tư mua ngoài thực tế</Text>
          <Text style={st.summaryVal}>{formatVND(actualPartsTotal)}</Text>
        </View>
        <View style={[st.summaryRow, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line }]}>
          <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Tổng tiền khách nghiệm thu</Text>
          <Text style={[ui.price, { fontSize: 18 }]}>{formatVND(projectedTotal)}</Text>
        </View>
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: R.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 3.5,
    borderLeftColor: C.primary,
    marginBottom: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    color: C.ink2,
    lineHeight: 18,
    fontWeight: '600',
  },
  reviseBox: {
    padding: 12,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 3.5,
    borderLeftColor: C.gold,
    marginBottom: 12,
  },
  reviseTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.goldInk,
  },
  reviseReason: {
    fontSize: 12.5,
    color: C.ink2,
    marginTop: 4,
    lineHeight: 18,
  },
  partCard: {
    padding: 12,
    borderRadius: R.md,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 12,
  },
  partHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  partName: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
  },
  rangeSub: {
    fontSize: 12,
    color: C.goldInk,
    fontWeight: '700',
    marginTop: 2,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.line,
  },
  thumbEmpty: {
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: R.md,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12.5,
    color: C.muted,
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 13.5,
    color: C.ink,
    fontWeight: '700',
  },
  addExtraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.primaryBorder,
    backgroundColor: C.primarySoft,
    marginBottom: 12,
  },
  addExtraBox: {
    padding: 12,
    borderRadius: R.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 12,
  },
});
