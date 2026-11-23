// Biên bản nghiệm thu & hoàn thành (sheet) của thợ.
// - Checklist an toàn: mặc định CHƯA tick, phải tick đủ mới gửi được (đếm số mục động).
// - Thu tiền mặt: chỉ hiện khi có tiền mặt cần thu (cashToCollect), mặc định CHƯA tick.
// - Xác nhận nghiệm thu của khách: họ tên người nghiệm thu + tick đồng ý; thời điểm ghi lúc bấm xác nhận.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { C, R } from '../../../theme';
import { formatVND, SAFETY_CHECKLIST_ITEMS } from '../../../constants/data';
import { useApp, orderTotal, cashToCollect, fmtDateTime, isQRPayment, bookedValue, tierPartDiscountAmount, lateDiscountAmount, isPaid, getPendingExternalEstimates } from '../../../context';
import { Btn, Field, Sheet, Checkbox, Tap, Badge, ui, AppIcon } from '../../../components';
import { pickCamera, pickImage } from '../../../utils/media';
import { toVietnamese } from '../../../utils/viText';
import { useBusyRunner } from './useBusyRunner';
import { tx } from './techStyles';

const SAFETY_ITEMS = Array.isArray(SAFETY_CHECKLIST_ITEMS) ? SAFETY_CHECKLIST_ITEMS : [];
const AFTER_NOTE = 'Ảnh hoàn thành bàn giao thiết bị';

export function CompleteSheet({ o, visible, onClose, initialSummary = '', evidence }) {
  const { a, ui: u } = useApp();
  const { run, isBusy } = useBusyRunner();
  const [summary, setSummary] = useState(initialSummary);
  const [paid, setPaid] = useState(false);
  const [safetyChecks, setSafetyChecks] = useState([]);
  const [acceptName, setAcceptName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPendingUris, setLocalPendingUris] = useState([]);
  const allEvidence = o ? (Array.isArray(evidence) ? evidence : (o.evidence || [])) : [];
  const serverAfterPhotos = allEvidence.filter((e) => e?.stage === 'after' && e?.uri);
  const [uploadedUris, setUploadedUris] = useState([]);
  const serverCountRef = useRef(serverAfterPhotos.length);

  // Mỗi lần mở sheet: làm mới bản nháp (không giữ tick từ lần trước).
  useEffect(() => {
    if (!visible) return;
    setSummary(initialSummary);
    setPaid(false);
    setSafetyChecks([]);
    setAcceptName(o?.report?.customerSignature && typeof o.report.customerSignature === 'string'
      ? o.report.customerSignature
      : (o?.address?.name || ''));
    setAccepted(false);
    setAcceptedAt(null);
    setLocalPendingUris([]);
    setUploadedUris([]);
    serverCountRef.current = serverAfterPhotos.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Chỉ xoá ảnh tạm sau khi serverAfterPhotos thực sự tăng lên từ syncFromBackend, tránh nhấp nháy "0 ảnh".
  useEffect(() => {
    if (uploadedUris.length > 0 && serverAfterPhotos.length > serverCountRef.current) {
      setUploadedUris([]);
    }
    serverCountRef.current = serverAfterPhotos.length;
  }, [serverAfterPhotos.length, uploadedUris.length]);

  if (!o) return null;
  const hasInitialPhotos =
    (o.attachments || []).length > 0 || allEvidence.some((e) => e?.stage === 'diagnosis' && e?.uri);

  const totalAfterCount = serverAfterPhotos.length + localPendingUris.length + uploadedUris.length;
  const busyKey = `complete:${o.code}`;
  const busy = isBusy(busyKey);
  const qr = isQRPayment(o);
  const orderPaid = isPaid(o);
  const cashDue = qr ? 0 : cashToCollect(o);
  const needsCash = !qr && cashDue > 0;
  const safetyTotal = SAFETY_ITEMS.length;
  const safetyDone = SAFETY_ITEMS.filter((it) => safetyChecks.includes(it)).length;
  const bookedBase = bookedValue(o);
  const finalTotal = orderTotal(o);
  const extraAmount = o.bill
    ? (Number(o.bill.supplementalTotal) || 0) +
      (o.bill.quotationTotal != null
        ? Math.max(0, Number(o.bill.quotationTotal) - (Number(o.bill.bookedAmount) || bookedBase))
        : 0)
    : o.quote?.approved
      ? Math.max(0, Number(o.quote.extraAmount) || 0)
      : Math.max(0, Number(o.quote?.priorApprovedExtra) || 0);
  const deductAmount = tierPartDiscountAmount(o) + (Number(o.voucherDiscount) || 0) + lateDiscountAmount(o);

  const handleAddCompletionPhoto = async (source = 'camera') => {
    if (uploadingPhoto || totalAfterCount >= 5) return;
    setUploadingPhoto(true);
    try {
      let uri = source === 'camera' ? await pickCamera() : await pickImage();
      if (source === 'camera' && uri === null) uri = await pickImage();
      if (!uri) {
        if (uri === null) {
          u.alert('Chưa hỗ trợ máy ảnh', 'Hãy cấp quyền máy ảnh hoặc chọn ảnh từ máy.', 'camera');
        }
        return;
      }
      setLocalPendingUris((prev) => (prev.includes(uri) ? prev : [...prev, uri]));
      if (o.dbAssignmentId) {
        const beforeUploadCount = serverCountRef.current;
        const ok = await Promise.resolve(a.addEvidence(o.code, { uri, stage: 'after', note: AFTER_NOTE }));
        setLocalPendingUris((prev) => prev.filter((x) => x !== uri));
        if (ok && serverCountRef.current <= beforeUploadCount) {
          setUploadedUris((prev) => (prev.includes(uri) ? prev : [...prev, uri]));
        }
      }
    } catch (e) {
      u.alert('Không tải được ảnh', toVietnamese(e?.message, 'Vui lòng thử lại.') || 'Vui lòng thử lại.', 'camera');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveServerPhoto = async (ph) => {
    if (!ph?.id || uploadingPhoto) return;
    setUploadingPhoto(true);
    try {
      await Promise.resolve(a.removeEvidence(o.code, ph.id));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const toggleAccepted = () => {
    if (accepted) { setAccepted(false); setAcceptedAt(null); return; }
    if (!acceptName.trim()) {
      u.alert('Thiếu họ tên', 'Nhập họ tên người nghiệm thu tại chỗ trước khi xác nhận.', 'pencil');
      return;
    }
    setAccepted(true);
    setAcceptedAt(Date.now());
  };

  const close = () => { if (!busy && !uploadingPhoto) onClose?.(); };

  const submit = () => run(busyKey, async () => {
    if (getPendingExternalEstimates(o).length > 0) {
      u.alert(
        'Chưa chốt giá vật tư mua ngoài',
        'Đơn có vật tư mua ngoài báo theo giá dao động. Vui lòng nhập giá mua thực tế + ảnh biên lai để khách nghiệm thu trước khi nộp biên bản hoàn thành.',
        'receipt-text',
      );
      return false;
    }
    if (uploadingPhoto) {
      u.alert('Đang tải ảnh', 'Vui lòng đợi ảnh hoàn thành tải lên xong rồi gửi biên bản.', 'camera');
      return false;
    }
    if (totalAfterCount === 0) {
      u.alert(
        'Thiếu ảnh hoàn thành',
        'Vui lòng chụp hoặc tải lên ít nhất 1 hình ảnh thiết bị sau khi hoàn thành công việc trước khi gửi biên bản.',
        'camera',
      );
      return false;
    }
    if (!summary.trim()) {
      u.alert('Thiếu nội dung', 'Ghi ngắn công việc đã làm trước khi gửi biên bản.', 'file-text');
      return false;
    }
    if (safetyDone < safetyTotal) {
      u.alert('Chưa đủ danh mục kiểm tra an toàn', `Vui lòng kiểm tra và đánh dấu đủ ${safetyTotal} tiêu chuẩn an toàn kỹ thuật (đã đánh dấu ${safetyDone}/${safetyTotal}) trước khi bàn giao.`, 'zap');
      return false;
    }
    const name = acceptName.trim();
    if (!name || !accepted || !acceptedAt) {
      u.alert('Chưa có xác nhận nghiệm thu', 'Nhập họ tên người nghiệm thu và đánh dấu “Khách đã kiểm tra và đồng ý nghiệm thu”.', 'pen-tool');
      return false;
    }
    const ok = await Promise.resolve(a.completeJob(o.code, {
      summary: summary.trim(),
      paid: qr ? orderPaid : (needsCash ? paid : false),
      safetyChecklist: SAFETY_ITEMS.filter((it) => safetyChecks.includes(it)),
      customerSignature: name, // giữ kiểu cũ: chuỗi họ tên
      customerAcceptance: { name, confirmedAt: acceptedAt },
      completionPhotoUris: localPendingUris,
    }));
    if (ok) onClose?.();
    return ok;
  });

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Biên bản nghiệm thu & hoàn thành"
      footer={(
        <Btn title={busy ? 'Đang gửi biên bản…' : 'Gửi biên bản & hoàn thành'} disabled={busy} onPress={submit} />
      )}
    >
      <View style={{ padding: 12, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary, marginTop: -8, marginBottom: 14 }}>
        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5, marginBottom: 6 }}>
          Tổng kết hoá đơn bàn giao
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
          <Text style={{ fontSize: 12.5, color: C.ink2 }}>Dịch vụ ban đầu</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{formatVND(bookedBase)}</Text>
        </View>
        {extraAmount > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ fontSize: 12.5, color: C.ink2 }}>Vật tư & phát sinh đã chốt</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.goldInk }}>+{formatVND(extraAmount)}</Text>
          </View>
        ) : null}
        {deductAmount > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ fontSize: 12.5, color: C.green }}>Ưu đãi / giảm trừ</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>-{formatVND(deductAmount)}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5 }}>Tổng thanh toán chốt với khách</Text>
          <Text style={[ui.price, { fontSize: 18 }]}>{formatVND(finalTotal)}</Text>
        </View>
      </View>
      <Field label="Nội dung công việc đã làm" multiline value={summary} onChangeText={setSummary} />

      <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: totalAfterCount > 0 ? C.greenBorder : C.line, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5, flex: 1 }}>
            Hình ảnh hoàn thành công việc
          </Text>
          <Badge
            text={totalAfterCount > 0 ? `Đã có ${totalAfterCount} ảnh` : 'Bắt buộc ≥ 1 ảnh'}
            fg={totalAfterCount > 0 ? C.greenInk : C.goldInk}
            bg={totalAfterCount > 0 ? C.greenSoft : C.goldSoft}
          />
        </View>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 17 }}>
          {hasInitialPhotos
            ? 'Đơn đã có ảnh triệu chứng/hiện trạng ban đầu — chụp hoặc tải ảnh thiết bị sau khi hoàn thành để đối chứng Trước & Sau với khách.'
            : 'Chụp hoặc tải lên ít nhất 1 ảnh thiết bị đã sửa xong & bàn giao gọn gàng (tối đa 5 ảnh).'}
        </Text>
        {totalAfterCount > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {serverAfterPhotos.map((ph) => (
              <View key={ph.id} style={tx.thumb}>
                <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                <Tap style={tx.thumbX} disabled={uploadingPhoto} onPress={() => handleRemoveServerPhoto(ph)} hitSlop={6}>
                  <AppIcon name="x" size={11} color="#fff" strokeWidth={3} />
                </Tap>
              </View>
            ))}
            {uploadedUris.map((uri, idx) => (
              <View key={`up_after_${idx}`} style={tx.thumb}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
              </View>
            ))}
            {localPendingUris.map((uri, idx) => (
              <View key={`local_after_${idx}`} style={tx.thumb}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
                <Tap
                  style={tx.thumbX}
                  disabled={uploadingPhoto}
                  onPress={() => setLocalPendingUris((prev) => prev.filter((x) => x !== uri))}
                  hitSlop={6}
                >
                  <AppIcon name="x" size={11} color="#fff" strokeWidth={3} />
                </Tap>
              </View>
            ))}
          </View>
        ) : null}
        {totalAfterCount < 5 ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn
              title={uploadingPhoto ? 'Đang tải…' : 'Chụp ảnh hoàn thành'}
              icon="camera"
              variant="soft"
              small
              style={{ flex: 1 }}
              disabled={uploadingPhoto || busy}
              onPress={() => handleAddCompletionPhoto('camera')}
            />
            <Btn
              title="Tải ảnh từ máy"
              icon="image"
              variant="outline"
              small
              style={{ flex: 1 }}
              disabled={uploadingPhoto || busy}
              onPress={() => handleAddCompletionPhoto('library')}
            />
          </View>
        ) : null}
      </View>

      <Text style={[ui.fieldLabel, { marginTop: 10, marginBottom: 6 }]}>
        Danh mục kiểm tra an toàn kỹ thuật & nghiệm thu ({safetyDone}/{safetyTotal})
      </Text>
      <View style={{ padding: 10, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, marginBottom: 10, gap: 6 }}>
        {SAFETY_ITEMS.map((item) => {
          const checked = safetyChecks.includes(item);
          return (
            <Checkbox
              key={item}
              on={checked}
              onPress={() => setSafetyChecks((prev) => (checked ? prev.filter((x) => x !== item) : [...prev, item]))}
              label={item}
            />
          );
        })}
      </View>

      <Text style={[ui.fieldLabel, { marginTop: 6, marginBottom: 6 }]}>Xác nhận nghiệm thu của khách hàng</Text>
      <View style={{ padding: 12, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: accepted ? C.greenBorder : C.line, marginBottom: 10 }}>
        <Field
          label="Họ tên người nghiệm thu tại chỗ"
          value={acceptName}
          onChangeText={(t) => { setAcceptName(t); if (accepted) { setAccepted(false); setAcceptedAt(null); } }}
          placeholder="VD: Nguyễn Văn A"
          style={{ marginTop: -12 }}
        />
        <Checkbox on={accepted} onPress={toggleAccepted} label="Khách đã kiểm tra và đồng ý nghiệm thu" style={{ marginTop: 12 }} />
        {accepted && acceptedAt ? (
          <Text style={{ fontSize: 11.5, color: C.green, fontWeight: '700', marginTop: 6 }}>
            ✓ {acceptName.trim()} xác nhận lúc {fmtDateTime(acceptedAt)}
          </Text>
        ) : null}
      </View>

      {qr && orderTotal(o) > 0 ? (
        <View
          style={{
            padding: 12,
            borderRadius: R.md,
            backgroundColor: C.surface,
            borderWidth: 1,
            borderColor: C.line,
            borderLeftWidth: 3.5,
            borderLeftColor: orderPaid ? C.green : C.gold,
            marginTop: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name={orderPaid ? 'check-circle-2' : 'qr-code'} size={18} color={orderPaid ? C.green : C.gold} strokeWidth={2.3} />
            <Text style={{ fontWeight: '800', color: orderPaid ? C.greenInk : C.goldInk, fontSize: 13.5, flex: 1 }}>
              {orderPaid
                ? `Khách đã chuyển khoản VietQR (${formatVND(orderTotal(o))})`
                : `Khách chuyển khoản QR (${formatVND(orderTotal(o))}) — KHÔNG THU TIỀN`}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: C.ink2, marginTop: 4, lineHeight: 18 }}>
            {orderPaid
              ? 'Hệ thống đã xác nhận thanh toán QR từ khách hàng. Bạn chỉ cần gửi biên bản hoàn thành.'
              : 'Đơn này khách chọn Chuyển khoản VietQR trên ứng dụng Khách hàng. Kỹ thuật viên không được thu tiền mặt — sau khi gửi biên bản, mã QR sẽ hiển thị trên máy khách để quét.'}
          </Text>
        </View>
      ) : null}
      {needsCash ? (
        <View style={[tx.note, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary, marginTop: 4 }]}>
          <Text style={{ color: C.ink, fontWeight: '800', lineHeight: 19 }}>
            Tiền mặt cần thu: {formatVND(cashDue)} ({o.payment})
          </Text>
          <Checkbox
            on={paid}
            onPress={() => setPaid(!paid)}
            label={`Tôi đã nhận đủ ${formatVND(cashDue)} tiền mặt`}
            style={{ marginTop: 10 }}
          />
          {!paid ? (
            <Text style={[ui.meta, { marginTop: 6 }]}>Chưa thu thì để trống — khách có thể báo đã trả sau, bạn xác nhận khi nhận đủ.</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={[ui.meta, { marginTop: 12 }]}>Sau khi gửi, khách nhận thông báo hoàn thành và có thể đánh giá.</Text>
    </Sheet>
  );
}
