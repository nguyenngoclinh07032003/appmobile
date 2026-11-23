// Biên bản nghiệm thu & hoàn thành (sheet) của thợ.
// - Checklist an toàn: smart-precheck mặc định đủ các tiêu chuẩn, tóm tắt 1 dòng và cho phép mở chi tiết để điều chỉnh.
// - Xác nhận nghiệm thu của khách: điền sẵn tên khách (cho phép sửa), bấm nút hoàn thành để xác nhận luôn.
// - Thu tiền mặt: đưa trực tiếp ra nút CTA ở footer (không cần tick thêm checkbox thừa).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { C, R } from '../../../theme';
import { formatVND, SAFETY_CHECKLIST_ITEMS } from '../../../constants/data';
import { useApp, orderTotal, amountRemaining, cashToCollect, isQRPayment, bookedValue, billExtraAmount, tierPartDiscountAmount, lateDiscountAmount, isPaid, getPendingExternalEstimates } from '../../../context';
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
  const [safetyChecks, setSafetyChecks] = useState(() => [...SAFETY_ITEMS]);
  const [showSafetyDetails, setShowSafetyDetails] = useState(false);
  const [acceptName, setAcceptName] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPendingUris, setLocalPendingUris] = useState([]);
  const allEvidence = o ? (Array.isArray(evidence) ? evidence : (o.evidence || [])) : [];
  const serverAfterPhotos = allEvidence.filter((e) => e?.stage === 'after' && e?.uri);
  const [uploadedUris, setUploadedUris] = useState([]);
  const serverCountRef = useRef(serverAfterPhotos.length);
  const lastPickedUriRef = useRef(null);

  // Mỗi lần mở sheet: smart-precheck đủ tiêu chuẩn an toàn & điền sẵn tên khách nghiệm thu.
  useEffect(() => {
    if (!visible) return;
    setSummary(initialSummary);
    setSafetyChecks([...SAFETY_ITEMS]);
    setShowSafetyDetails(false);
    setAcceptName(o?.report?.customerSignature && typeof o.report.customerSignature === 'string'
      ? o.report.customerSignature
      : (o?.address?.name || ''));
    setLocalPendingUris([]);
    setUploadedUris([]);
    lastPickedUriRef.current = null;
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
  const paidAmount = Number(o.bill?.paidAmount) || 0;
  const remainDue = amountRemaining(o);
  const extraAmount = billExtraAmount(o);
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
      lastPickedUriRef.current = uri;
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

  const close = () => { if (!busy && !uploadingPhoto) onClose?.(); };

  const submit = (collectCash = false) => run(busyKey, async () => {
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
      setShowSafetyDetails(true);
      u.alert('Chưa đủ danh mục kiểm tra an toàn', `Vui lòng kiểm tra và đánh dấu đủ ${safetyTotal} tiêu chuẩn an toàn kỹ thuật (đã đánh dấu ${safetyDone}/${safetyTotal}) trước khi bàn giao.`, 'zap');
      return false;
    }
    const name = acceptName.trim();
    if (!name) {
      u.alert('Thiếu tên người nghiệm thu', 'Nhập họ tên khách hàng / người nghiệm thu tại chỗ trước khi hoàn thành.', 'pen-tool');
      return false;
    }
    const ok = await Promise.resolve(a.completeJob(o.code, {
      summary: summary.trim(),
      paid: qr ? orderPaid : (needsCash ? Boolean(collectCash) : false),
      safetyChecklist: SAFETY_ITEMS.filter((it) => safetyChecks.includes(it)),
      customerSignature: name,
      customerAcceptance: { name, confirmedAt: Date.now() },
      completionPhotoUris: localPendingUris,
      completionPhotoFallbackUri: lastPickedUriRef.current,
    }));
    if (ok) onClose?.();
    return ok;
  });

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Biên bản nghiệm thu & hoàn thành"
      footer={needsCash ? (
        <View style={{ gap: 6 }}>
          <Btn
            title={busy ? 'Đang gửi biên bản…' : `Hoàn thành & Đã thu ${formatVND(cashDue)}`}
            icon="banknote"
            disabled={busy || uploadingPhoto}
            onPress={() => submit(true)}
          />
          <Btn
            title="Hoàn thành (chưa thu tiền mặt)"
            variant="ghost"
            small
            disabled={busy || uploadingPhoto}
            onPress={() => submit(false)}
          />
        </View>
      ) : (
        <Btn
          title={busy ? 'Đang gửi biên bản…' : 'Hoàn thành & Bàn giao'}
          icon="check-circle-2"
          disabled={busy || uploadingPhoto}
          onPress={() => submit(qr ? orderPaid : false)}
        />
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
        {paidAmount > 0 && !orderPaid ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 12.5, color: C.green }}>Đã thanh toán trước</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>-{formatVND(paidAmount)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>Còn lại cần thanh toán</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: C.primary }}>{formatVND(remainDue)}</Text>
            </View>
          </>
        ) : null}
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

      <View
        style={{
          marginTop: 10,
          marginBottom: 10,
          borderRadius: R.md,
          backgroundColor: C.bg,
          borderWidth: 1,
          borderColor: safetyDone === safetyTotal ? C.greenBorder : C.goldBorder,
          padding: 10,
        }}
      >
        <Tap
          onPress={() => setShowSafetyDetails((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <AppIcon
              name={safetyDone === safetyTotal ? 'check-circle-2' : 'alert-triangle'}
              size={18}
              color={safetyDone === safetyTotal ? C.green : C.gold}
              strokeWidth={2.2}
            />
            <Text
              style={{
                flex: 1,
                fontWeight: '700',
                fontSize: 13,
                color: safetyDone === safetyTotal ? C.greenInk : C.goldInk,
              }}
            >
              {safetyDone === safetyTotal
                ? `Đạt đủ ${safetyDone}/${safetyTotal} tiêu chuẩn an toàn kỹ thuật`
                : `Thiếu tiêu chuẩn an toàn (${safetyDone}/${safetyTotal})`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.primary }}>
              {showSafetyDetails ? 'Thu gọn' : 'Chi tiết'}
            </Text>
            <View style={{ transform: [{ rotate: showSafetyDetails ? '-90deg' : '90deg' }] }}>
              <AppIcon name="chevron-right" size={14} color={C.primary} strokeWidth={2.3} />
            </View>
          </View>
        </Tap>
        {showSafetyDetails ? (
          <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line, gap: 6 }}>
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
        ) : null}
      </View>

      <Field
        label="Người xác nhận nghiệm thu tại chỗ"
        value={acceptName}
        onChangeText={setAcceptName}
        placeholder="VD: Nguyễn Văn A"
      />
      <Text style={[ui.meta, { marginTop: 4, marginBottom: 10 }]}>
        Bấm hoàn thành đồng nghĩa khách đã kiểm tra & đồng ý nghiệm thu thiết bị.
      </Text>

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
                : `Khách chuyển khoản QR (${formatVND(remainDue)}) — KHÔNG THU TIỀN`}
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
            Tiền mặt cần thu tại chỗ: {formatVND(cashDue)} ({o.payment})
          </Text>
          <Text style={[ui.meta, { marginTop: 4 }]}>
            Chọn "Hoàn thành & Đã thu" bên dưới nếu khách trả ngay, hoặc "Hoàn thành (chưa thu)" để đối soát sau.
          </Text>
        </View>
      ) : null}
      <Text style={[ui.meta, { marginTop: 12 }]}>Sau khi gửi, khách nhận thông báo hoàn thành và có thể đánh giá.</Text>
    </Sheet>
  );
}
