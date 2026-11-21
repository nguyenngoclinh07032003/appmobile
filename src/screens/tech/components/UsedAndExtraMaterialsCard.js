// Mục Vật tư đã sử dụng & Vật tư phát sinh trên màn Chi tiết công việc của Thợ.
// Cho phép ghi nhận xuất kho nội bộ, đồng thời thêm vật tư phát sinh / cấu hình mức giá cuối cùng để gửi Bill cho khách.
import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { C, R } from '../../../theme';
import { MATERIALS, formatVND, formatNumberInput } from '../../../constants/data';
import { useApp, bookedValue, tierPartDiscountAmount, lateDiscountAmount } from '../../../context';
import { Badge, Btn, Card, Field, HScroll, Stepper, Tap, AppIcon, ui } from '../../../components';
import { pickCamera, pickImage } from '../../../utils/media';
import { formatRangeVND, normalizeExternalPartName } from '../../../utils/externalPartsPricing';
import { tx } from './techStyles';
import { useBusyRunner } from './useBusyRunner';

const parseNum = (text) => parseInt(String(text || '').replace(/[^0-9]/g, ''), 10) || 0;

export function UsedAndExtraMaterialsCard({
  o,
  mine,
  onOpenWarehouseUsage,
  sharedExtraParts,
  onChangeSharedExtraParts,
}) {
  const { a, ui: u } = useApp();
  const { run, isBusy } = useBusyRunner();

  const [localExtraParts, setLocalExtraParts] = useState([]);
  const extraParts = Array.isArray(sharedExtraParts) ? sharedExtraParts : localExtraParts;
  const setExtraParts = onChangeSharedExtraParts || setLocalExtraParts;
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [extraName, setExtraName] = useState('');
  const [extraPriceText, setExtraPriceText] = useState('');
  const [extraQty, setExtraQty] = useState(1);
  // Số lượng vật tư kho hiển thị lạc quan trong lúc chờ server: id -> { qty, base } (base = qty server lúc bấm).
  const [localMatQty, setLocalMatQty] = useState({});

  const isRevision = o?.externalPriceState === 'revision_requested' && o?.quote?.isExternalFinalization;
  const orderCode = o?.code || '';

  // Reset form khi chuyển sang đơn khác
  useEffect(() => {
    if (!onChangeSharedExtraParts) setLocalExtraParts([]);
    setShowAddExtra(false);
    setExtraName('');
    setExtraPriceText('');
    setExtraQty(1);
    setLocalMatQty({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  const estSource = !o
    ? []
    : isRevision
      ? (o.quote?.lines || [])
          // Bỏ các dòng khách đã duyệt ở đợt trước (isPriorApproved) để không gửi lại / tính tiền 2 lần.
          .filter((l) => l.isFinalizedExternal && !l.isPriorApproved)
          .map((l, idx) => ({
            syncKey: `rev_${l.dbItemId || idx}`,
            name: l.name,
            minPrice: l.minPrice,
            maxPrice: l.maxPrice,
            qty: Math.max(1, Number(l.qty) || 1),
            alreadyBilledUnitPrice: Number(l.priorDeposit) || 0,
            defaultPrice: l.actualPrice ?? l.price ?? '',
            receiptId: l.receiptId || null,
          }))
      : (o.pendingExternalEstimates || []).map((est, idx) => ({
          syncKey: `est_${est.itemId || idx}`,
          name: est.name,
          minPrice: est.minPrice,
          maxPrice: est.maxPrice,
          qty: Math.max(1, Number(est.qty) || 1),
          alreadyBilledUnitPrice: Number(est.alreadyBilledUnitPrice) || 0,
          defaultPrice: est.alreadyBilledUnitPrice > 0 ? est.alreadyBilledUnitPrice : '',
          receiptId: null,
        }));
  const estSourceSig = JSON.stringify(estSource);

  // Tự động đồng bộ các vật tư mua ngoài đang báo giá dao động (hoặc cần nhập lại giá) vào danh sách chốt Bill
  useEffect(() => {
    if (!o) return;
    setExtraParts((prev) => {
      const prevBySync = new Map(prev.filter((p) => p.syncKey).map((p) => [p.syncKey, p]));
      const syncedItems = estSource.map((src) => {
        const existing = prevBySync.get(src.syncKey);
        if (existing) {
          return {
            ...existing,
            name: src.name,
            minPrice: src.minPrice,
            maxPrice: src.maxPrice,
            // Thợ chưa tự chỉnh số lượng -> theo số lượng mới nhất từ server.
            qty: existing.qtyTouched ? existing.qty : src.qty,
            alreadyBilledUnitPrice: src.alreadyBilledUnitPrice,
            receiptId: existing.receiptId || src.receiptId,
          };
        }
        return {
          id: src.syncKey,
          syncKey: src.syncKey,
          name: src.name,
          minPrice: src.minPrice,
          maxPrice: src.maxPrice,
          qty: src.qty,
          alreadyBilledUnitPrice: src.alreadyBilledUnitPrice,
          actualPriceText: src.defaultPrice ? formatNumberInput(String(src.defaultPrice)) : '',
          receiptId: src.receiptId,
          receiptUri: null,
          isAddedInline: false,
        };
      });
      const inlineAdded = prev.filter((p) => p.isAddedInline);
      return [...syncedItems, ...inlineAdded];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode, isRevision, estSourceSig]);

  // Bỏ số lượng lạc quan khi số lượng trên server đã đổi (server đã xác nhận / đồng bộ lại).
  const matQtySig = (o?.materials || []).map((m) => `${m.id}:${m.qty}`).join('|');
  useEffect(() => {
    setLocalMatQty((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) return prev;
      const serverQty = new Map((o?.materials || []).map((m) => [String(m.id), Math.max(1, Number(m.qty) || 1)]));
      let changed = false;
      const next = {};
      keys.forEach((k) => {
        if (serverQty.has(k) && serverQty.get(k) === prev[k].base) next[k] = prev[k];
        else changed = true;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matQtySig]);

  if (!o) return null;

  // Khách yêu cầu kiểm tra lại giá VT ngoài: thợ nhập lại giá cuối ngay tại card này.
  const isRevisionEditable = Boolean(
    o.quote?.isExternalFinalization && o.quote?.revisionRequested && ['diagnosing', 'quoted'].includes(o.status),
  );
  const editable = mine && (o.status === 'repairing' || isRevisionEditable);
  // Bill đang chờ khách xác nhận: server không nhận Bill mới (409) -> chỉ hiện thông báo chờ khách.
  const billLocked = o.externalPriceState === 'awaiting_customer_approval';
  const canComposeBill = editable && !billLocked;
  // Ghi nhận / chỉnh vật tư kho chỉ khi đang sửa chữa.
  const canEditWarehouse = mine && o.status === 'repairing';
  const warehouseMats = o.materials || [];
  const finalizedApproved = o.finalizedExternalParts || [];
  const matNameSet = new Set(warehouseMats.map((m) => normalizeExternalPartName(m.name)));
  const visibleFinalized = finalizedApproved.filter((f) => !matNameSet.has(normalizeExternalPartName(f.name)));

  const busyKey = `used-extra-bill:${o.code}`;
  const busySendBill = isBusy(busyKey);

  const isAlreadyBilledOrListed = (mat) => {
    const norm = normalizeExternalPartName(mat?.name);
    const inQuotedLines = (o.quote?.lines || []).some(
      (l) =>
        !l.isOriginal &&
        !l.isEstimatedRange &&
        ((mat?.matId && l.matId === mat.matId) || normalizeExternalPartName(l.name) === norm),
    );
    const inExtraDraft = extraParts.some((p) => normalizeExternalPartName(p.name) === norm);
    const inFinalized = finalizedApproved.some((f) => normalizeExternalPartName(f.name) === norm);
    return inQuotedLines || inExtraDraft || inFinalized;
  };

  const failed = (res) => res === false || (res && typeof res === 'object' && res.ok === false);
  const matBusyKey = (m) => `mat:${o.code}:${m.id}`;
  const changeMatQty = (m, baseQty, q) => {
    const key = matBusyKey(m);
    if (isBusy(key)) return;
    setLocalMatQty((prev) => ({ ...prev, [String(m.id)]: { qty: q, base: baseQty } }));
    run(key, () => a.setMaterialQty(o.code, m.id, q)).then((res) => {
      if (failed(res)) {
        setLocalMatQty((prev) => {
          const next = { ...prev };
          delete next[String(m.id)];
          return next;
        });
      }
    });
  };
  const removeMat = (m) => {
    const key = matBusyKey(m);
    if (isBusy(key)) return;
    run(key, () => a.removeMaterial(o.code, m.id));
  };

  const handleMoveWarehouseToExtra = (mat) => {
    const unitPrice = Number(mat.price) || 0;
    const qty = Math.max(1, Number(mat.qty) || 1);
    setExtraParts((prev) => [
      ...prev,
      {
        id: `wh_extra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: mat.name,
        minPrice: null,
        maxPrice: null,
        qty,
        alreadyBilledUnitPrice: 0,
        actualPriceText: unitPrice > 0 ? formatNumberInput(String(unitPrice)) : '',
        receiptId: null,
        receiptUri: null,
        isAddedInline: true,
      },
    ]);
    u.toast(`Đã thêm "${mat.name}" vào mục tính Bill`, 'check-circle-2');
  };

  const handleAddInlineExtra = () => {
    const clean = extraName.trim();
    const priceNum = parseNum(extraPriceText);
    if (!clean) {
      u.alert('Thiếu tên vật tư', 'Vui lòng nhập tên vật tư phát sinh.', 'alert-triangle');
      return;
    }
    if (!priceNum || priceNum <= 0) {
      u.alert('Mức giá chưa hợp lệ', 'Vui lòng nhập mức giá cuối cùng lớn hơn 0đ.', 'alert-triangle');
      return;
    }
    setExtraParts((prev) => [
      ...prev,
      {
        id: `inline_ext_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        minPrice: null,
        maxPrice: null,
        qty: Math.max(1, Number(extraQty) || 1),
        alreadyBilledUnitPrice: 0,
        actualPriceText: formatNumberInput(String(priceNum)),
        receiptId: null,
        receiptUri: null,
        isAddedInline: true,
      },
    ]);
    setExtraName('');
    setExtraPriceText('');
    setExtraQty(1);
    setShowAddExtra(false);
    u.toast(`Đã thêm "${clean}" (${formatVND(priceNum)}) vào Bill`, 'check-circle-2');
  };

  const pickReceipt = async (partId, useCamera) => {
    try {
      let uri = useCamera ? await pickCamera() : await pickImage();
      if (uri === null && useCamera) uri = await pickImage();
      if (!uri) {
        if (uri === null) {
          u.alert('Chưa chọn được ảnh', 'Vui lòng cấp quyền camera/thư viện để chọn ảnh.', 'camera');
        }
        return;
      }
      setExtraParts((prev) => prev.map((p) => (p.id === partId ? { ...p, receiptUri: uri } : p)));
    } catch (e) {
      u.alert('Không tải được ảnh', (e && e.message) || 'Vui lòng thử lại.', 'camera');
    }
  };

  const fixedApprovedExtras = (o.quote?.lines || [])
    .filter((l) => !l.isOriginal && !l.isEstimatedRange && !l.isFinalizedExternal)
    .reduce((sum, l) => sum + (Number(l.price) || 0) * Math.max(1, Number(l.qty) || 1), 0);
  const billedExternalDeposits = extraParts.reduce(
    (sum, p) => sum + (Number(p.alreadyBilledUnitPrice) || 0) * Math.max(1, Number(p.qty) || 1),
    0,
  );
  const baseBeforeExtra = !isRevision && o?.bill && o.bill.quotationTotal != null
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

  const extraDisplayTotal = extraParts.reduce(
    (sum, p) => sum + parseNum(p.actualPriceText) * Math.max(1, Number(p.qty) || 1),
    0,
  );
  const extraAddedDelta = extraParts.reduce(
    (sum, p) => sum + Math.max(0, parseNum(p.actualPriceText) - (Number(p.alreadyBilledUnitPrice) || 0)) * Math.max(1, Number(p.qty) || 1),
    0,
  );
  const projectedBillTotal = baseBeforeExtra + extraAddedDelta;

  const sendBillToCustomer = () => run(busyKey, async () => {
    if (!extraParts.length) {
      u.alert('Chưa có vật tư phát sinh', 'Thêm ít nhất 1 vật tư phát sinh và nhập mức giá cuối để gửi Bill.', 'ℹ️');
      return false;
    }
    const payloadParts = extraParts.map((p) => ({
      name: p.name,
      minPrice: p.minPrice,
      maxPrice: p.maxPrice,
      qty: Math.max(1, Number(p.qty) || 1),
      alreadyBilledUnitPrice: Number(p.alreadyBilledUnitPrice) || 0,
      actualPrice: parseNum(p.actualPriceText),
      receiptUri: p.receiptUri,
      receiptId: p.receiptId,
    }));
    const ok = await Promise.resolve(
      a.submitExternalPartsActualPrice(o.code, {
        parts: payloadParts,
        summary: `Chốt ${payloadParts.length} vật tư phát sinh (tổng ${formatVND(extraDisplayTotal)})`,
      }),
    );
    if (ok) {
      setExtraParts((prev) => prev.filter((p) => !p.isAddedInline));
      setShowAddExtra(false);
    }
    return ok;
  });

  const canSendBillNow = canComposeBill && extraParts.length > 0;
  const awaitingApproval = mine && billLocked;

  return (
    <Card style={{ marginTop: 12 }}>
      <View style={st.headerRow}>
        <Text style={[tx.h, { marginBottom: 0 }]}>🔩 Vật tư đã sử dụng & Phát sinh</Text>
        {canComposeBill && extraParts.length > 0 ? (
          <Badge text={`${extraParts.length} mục chờ gửi Bill`} fg={C.orange} bg={C.orangeSoft} />
        ) : null}
      </View>
      <Text style={[ui.meta, { marginTop: 4, marginBottom: 8, lineHeight: 17 }]}>
        Ghi nhận vật tư sử dụng trong lúc sửa, đồng thời thêm vật tư phát sinh và cấu hình mức giá cuối cùng để gửi Bill cho khách thanh toán.
      </Text>

      {/* 1. Vật tư đã ghi nhận (kho nội bộ / báo giá đã duyệt) */}
      {warehouseMats.length === 0 ? (
        <Text style={ui.meta}>Chưa ghi nhận vật tư kho.</Text>
      ) : (
        warehouseMats.map((m) => {
          const isUsage = Boolean(m.dbUsageId);
          const unitP = Number(m.price) || 0;
          const serverQty = Math.max(1, Number(m.qty) || 1);
          const local = localMatQty[String(m.id)];
          const qty = local && local.base === serverQty ? local.qty : serverQty;
          const matBusy = isBusy(matBusyKey(m));
          const canAddToBill = canComposeBill && isUsage && !isAlreadyBilledOrListed(m);

          return (
            <View key={m.id} style={st.matRow}>
              <View style={st.matTop}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={1}>{m.name}</Text>
                    {!isUsage ? (
                      <Badge text="Đã tính trong báo giá" fg={C.green} bg={C.greenSoft} />
                    ) : null}
                  </View>
                  {unitP > 0 ? (
                    <Text style={[ui.meta, { marginTop: 2 }]}>
                      {isUsage
                        ? `Đơn giá niêm yết: ${formatVND(unitP)} / ${m.unit || 'cái'}`
                        : `${formatVND(unitP)} x${qty} ${m.unit || 'cái'} = ${formatVND(unitP * qty)}`}
                    </Text>
                  ) : null}
                </View>

                {canEditWarehouse && isUsage ? (
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: matBusy ? 0.5 : 1 }}
                    pointerEvents={matBusy ? 'none' : 'auto'}
                  >
                    <Stepper value={qty} onChange={(q) => changeMatQty(m, serverQty, q)} />
                    <Tap onPress={() => removeMat(m)} disabled={matBusy} hitSlop={6}>
                      <Text style={{ color: C.faint, marginLeft: 4, fontWeight: '700' }}>✕</Text>
                    </Tap>
                  </View>
                ) : (
                  <Text style={{ color: C.ink2, fontWeight: '700' }}>{qty} {m.unit || 'cái'}</Text>
                )}
              </View>

              {canAddToBill ? (
                <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11.5, color: C.muted, flex: 1, paddingRight: 8 }}>
                    Xuất kho nội bộ · Chưa tính vào Bill khách
                  </Text>
                  <Tap onPress={() => handleMoveWarehouseToExtra(m)} style={st.moveToBillBtn}>
                    <Text style={st.moveToBillText}>+ Tính giá vào Bill</Text>
                  </Tap>
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {/* Vật tư phát sinh đã chốt Bill & được khách duyệt trước đó */}
      {visibleFinalized.length > 0 ? (
        <View style={st.sectionBox}>
          <Text style={st.sectionTitleGreen}>✅ Vật tư phát sinh đã chốt Bill ({visibleFinalized.length})</Text>
          {visibleFinalized.map((f, idx) => (
            <View key={`fin_${f.itemId || idx}`} style={st.finRow}>
              <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }} numberOfLines={2}>
                {f.name} x{f.qty}
              </Text>
              <Text style={{ color: C.green, fontWeight: '800' }}>{formatVND(f.actualPrice * f.qty)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 2. Danh sách vật tư phát sinh đang cấu hình giá cuối để gửi Bill */}
      {canComposeBill && extraParts.length > 0 ? (
        <View style={st.extraWrap}>
          <Text style={st.sectionTitleOrange}>
            🧾 Vật tư phát sinh & Giá cuối gửi Bill ({extraParts.length})
          </Text>
          {extraParts.map((p, idx) => {
            const actualNum = parseNum(p.actualPriceText);
            const qty = Math.max(1, Number(p.qty) || 1);
            const hasRange = p.minPrice != null && p.maxPrice != null && p.maxPrice > 0;
            const inRange = hasRange && actualNum >= p.minPrice && actualNum <= p.maxPrice;
            const existingImg = p.receiptId
              ? (o.evidence || []).find((e) => String(e.dbAttachmentId) === String(p.receiptId))?.uri
              : null;
            const previewUri = p.receiptUri || existingImg;

            return (
              <View key={p.id} style={st.extraCard}>
                <View style={st.extraCardHead}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ color: C.ink, fontWeight: '800', fontSize: 13.5 }} numberOfLines={2}>
                        {idx + 1}. {p.name}
                      </Text>
                      <Badge
                        text={hasRange ? 'Giá dao động' : 'Phát sinh mới'}
                        fg={hasRange ? C.orange : C.primary}
                        bg={hasRange ? C.orangeSoft : C.primarySoft}
                      />
                    </View>
                    {hasRange ? (
                      <Text style={{ fontSize: 11.5, color: C.orange, fontWeight: '700', marginTop: 2 }}>
                        Dự kiến ban đầu: {formatRangeVND(p.minPrice, p.maxPrice)} / cái
                      </Text>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Stepper
                      value={qty}
                      onChange={(q) => setExtraParts((prev) => prev.map((x) => (x.id === p.id ? { ...x, qty: q, qtyTouched: true } : x)))}
                    />
                    {p.isAddedInline ? (
                      <Tap
                        onPress={() => setExtraParts((prev) => prev.filter((x) => x.id !== p.id))}
                        hitSlop={8}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ color: C.red, fontSize: 13, fontWeight: '800' }}>✕</Text>
                      </Tap>
                    ) : null}
                  </View>
                </View>

                <Field
                  label="Mức giá cuối cùng (VNĐ / cái) *"
                  placeholder={hasRange ? `VD: ${formatNumberInput(String(p.minPrice))}` : 'Nhập giá chốt (VD: 150.000)'}
                  value={p.actualPriceText}
                  onChangeText={(t) =>
                    setExtraParts((prev) =>
                      prev.map((x) => (x.id === p.id ? { ...x, actualPriceText: formatNumberInput(t) } : x)),
                    )
                  }
                  keyboardType="numeric"
                  style={{ marginTop: 6 }}
                />

                {actualNum > 0 ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: hasRange ? (inRange ? C.green : C.orange) : C.ink2, flex: 1 }}>
                      {hasRange
                        ? (inRange ? '✓ Nằm trong khoảng dự kiến' : '⚠ Ngoài khoảng dự kiến')
                        : '✓ Giá chốt gửi khách'}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>
                      = {formatVND(actualNum * qty)}
                    </Text>
                  </View>
                ) : null}

                {/* Ảnh biên lai tuỳ chọn */}
                <View style={st.receiptRow}>
                  {previewUri ? (
                    <Image source={{ uri: previewUri }} style={st.receiptThumb} />
                  ) : null}
                  <Tap onPress={() => pickReceipt(p.id, true)} style={st.receiptChip}>
                    <AppIcon name="camera" size={13} color={C.primary} strokeWidth={2.2} />
                    <Text style={st.receiptChipText}>{previewUri ? 'Chụp lại hoá đơn' : 'Chụp hoá đơn (tuỳ chọn)'}</Text>
                  </Tap>
                  <Tap onPress={() => pickReceipt(p.id, false)} style={st.receiptChip}>
                    <AppIcon name="image" size={13} color={C.ink2} strokeWidth={2.2} />
                    <Text style={[st.receiptChipText, { color: C.ink2 }]}>Chọn ảnh</Text>
                  </Tap>
                  {p.receiptUri || p.receiptId ? (
                    <Badge text="Có ảnh" fg={C.green} bg={C.greenSoft} />
                  ) : null}
                </View>
              </View>
            );
          })}

          {/* Tổng hợp Bill xem trước & nút gửi ngay */}
          <View style={st.billBox}>
            <View style={st.billRow}>
              <Text style={st.billLabel}>Dịch vụ & hạng mục đã chốt</Text>
              <Text style={st.billVal}>{formatVND(baseBeforeExtra)}</Text>
            </View>
            <View style={[st.billRow, { marginTop: 4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.billLabel, { flex: 0 }]}>Vật tư phát sinh chốt thêm ({extraParts.length})</Text>
                {billedExternalDeposits > 0 ? (
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>(đã trừ phần tạm tính trước đó)</Text>
                ) : null}
              </View>
              <Text style={[st.billVal, { color: C.orange }]}>+{formatVND(extraAddedDelta)}</Text>
            </View>
            <View style={[st.billRow, st.billTotalDivider]}>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Tổng Bill gửi khách</Text>
              <Text style={[ui.price, { fontSize: 18 }]}>{formatVND(projectedBillTotal)}</Text>
            </View>
            <Btn
              title={busySendBill ? 'Đang gửi Bill cho khách…' : 'Chốt giá cuối & Gửi Bill cho khách'}
              icon="receipt-text"
              small
              disabled={!canSendBillNow || busySendBill}
              style={{ marginTop: 10 }}
              onPress={sendBillToCustomer}
            />
          </View>
        </View>
      ) : null}

      {/* Form thêm mới vật tư phát sinh */}
      {canComposeBill && showAddExtra ? (
        <View style={st.addForm}>
          <View style={st.addFormHead}>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5 }}>➕ Thêm vật tư phát sinh tính Bill</Text>
            <Tap onPress={() => setShowAddExtra(false)} hitSlop={8}>
              <Text style={{ color: C.muted, fontWeight: '700' }}>Đóng</Text>
            </Tap>
          </View>

          <Text style={[ui.meta, { marginBottom: 6 }]}>Chọn nhanh từ danh mục hoặc tự nhập tên vật tư:</Text>
          <HScroll contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
            {MATERIALS.slice(0, 10).map((m) => (
              <Tap
                key={`q_${m.id}`}
                onPress={() => {
                  setExtraName(m.name);
                  if (Number(m.price) > 0) setExtraPriceText(formatNumberInput(String(m.price)));
                }}
                style={st.quickChip}
              >
                <Text style={st.quickChipText}>
                  {m.name}{Number(m.price) > 0 ? ` (${formatVND(m.price)})` : ''}
                </Text>
              </Tap>
            ))}
          </HScroll>

          <Field
            label="Tên vật tư phát sinh *"
            placeholder="VD: Dây đồng 2m, Tụ kích block, Van xả..."
            value={extraName}
            onChangeText={setExtraName}
          />

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
            <Field
              label="Mức giá cuối cùng (VNĐ) *"
              placeholder="VD: 150.000"
              value={extraPriceText}
              onChangeText={(t) => setExtraPriceText(formatNumberInput(t))}
              keyboardType="numeric"
              style={{ flex: 1, marginTop: 0 }}
            />
            <View style={{ paddingBottom: 6 }}>
              <Text style={[ui.fieldLabel, { marginBottom: 4 }]}>Số lượng</Text>
              <Stepper value={extraQty} onChange={setExtraQty} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Btn
              title="Huỷ"
              variant="ghost"
              small
              style={{ flex: 1 }}
              onPress={() => {
                setShowAddExtra(false);
                setExtraName('');
                setExtraPriceText('');
                setExtraQty(1);
              }}
            />
            <Btn title="Thêm vào danh sách Bill" small style={{ flex: 1.7 }} onPress={handleAddInlineExtra} />
          </View>
        </View>
      ) : null}

      {/* Thanh nút thêm vật tư kho & vật tư phát sinh */}
      {editable ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {canEditWarehouse ? (
            <Tap style={[tx.addLine, { flex: 1, marginTop: 0, flexDirection: 'row', gap: 4 }]} onPress={onOpenWarehouseUsage}>
              <AppIcon name="plus" size={14} color={C.primary} strokeWidth={2.5} />
              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12.5 }}>Ghi nhận VT kho</Text>
            </Tap>
          ) : null}
          {canComposeBill ? (
            <Tap
              style={[
                tx.addLine,
                { flex: 1.15, marginTop: 0, flexDirection: 'row', gap: 4, borderColor: '#F59E0B', backgroundColor: showAddExtra ? '#FEF3C7' : '#FFFBEB' },
              ]}
              onPress={() => setShowAddExtra((v) => !v)}
            >
              <AppIcon name="plus" size={14} color="#D97706" strokeWidth={2.5} />
              <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 12.5 }}>Thêm VT phát sinh</Text>
            </Tap>
          ) : null}
        </View>
      ) : null}

      {awaitingApproval ? (
        <View style={[tx.note, { backgroundColor: '#F0F9FF', marginTop: 10 }]}>
          <Text style={{ color: '#0369A1', fontSize: 12, fontWeight: '700', lineHeight: 17 }}>
            ⏳ Đã gửi Bill vật tư phát sinh. Đang chờ khách hàng xác nhận nghiệm thu trên App Khách.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  matRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EEF5',
  },
  matTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moveToBillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  moveToBillText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
  },
  sectionBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: R.md,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  sectionTitleGreen: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.green,
    marginBottom: 4,
  },
  finRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    gap: 8,
  },
  extraWrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  sectionTitleOrange: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
    marginBottom: 8,
  },
  extraCard: {
    padding: 10,
    borderRadius: R.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  extraCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  receiptThumb: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  receiptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: R.sm,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.line,
  },
  receiptChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.primary,
  },
  billBox: {
    padding: 12,
    borderRadius: R.md,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  billLabel: {
    fontSize: 12.5,
    color: C.ink2,
    fontWeight: '600',
    flex: 1,
  },
  billVal: {
    fontSize: 13,
    color: C.ink,
    fontWeight: '700',
  },
  billTotalDivider: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  addForm: {
    marginTop: 12,
    padding: 12,
    borderRadius: R.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  addFormHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.ink2,
  },
});
