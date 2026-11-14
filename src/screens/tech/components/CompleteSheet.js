// Biên bản nghiệm thu & hoàn thành (sheet) của thợ.
// - Checklist an toàn: mặc định CHƯA tick, phải tick đủ mới gửi được (đếm số mục động).
// - Thu tiền mặt: chỉ hiện khi có tiền mặt cần thu (cashToCollect), mặc định CHƯA tick.
// - Xác nhận nghiệm thu của khách: họ tên người nghiệm thu + tick đồng ý; thời điểm ghi lúc bấm xác nhận.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { C, R } from '../../../theme';
import { formatVND, SAFETY_CHECKLIST_ITEMS } from '../../../constants/data';
import { useApp, orderTotal, cashToCollect, fmtDateTime, isQRPayment } from '../../../context';
import { Btn, Field, Sheet, Checkbox, ui, AppIcon } from '../../../components';
import { useBusyRunner } from './useBusyRunner';
import { tx } from './techStyles';

const SAFETY_ITEMS = Array.isArray(SAFETY_CHECKLIST_ITEMS) ? SAFETY_CHECKLIST_ITEMS : [];

export function CompleteSheet({ o, visible, onClose, initialSummary = '', evidence = [] }) {
  const { a, ui: u } = useApp();
  const { run, isBusy } = useBusyRunner();
  const [summary, setSummary] = useState(initialSummary);
  const [paid, setPaid] = useState(false);
  const [forceDone, setForceDone] = useState(false);
  const [safetyChecks, setSafetyChecks] = useState([]);
  const [acceptName, setAcceptName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState(null);

  // Mỗi lần mở sheet: làm mới bản nháp (không giữ tick từ lần trước).
  useEffect(() => {
    if (!visible) return;
    setSummary(initialSummary);
    setPaid(false);
    setForceDone(false);
    setSafetyChecks([]);
    setAcceptName(o?.report?.customerSignature && typeof o.report.customerSignature === 'string'
      ? o.report.customerSignature
      : (o?.address?.name || ''));
    setAccepted(false);
    setAcceptedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!o) return null;
  const busyKey = `complete:${o.code}`;
  const busy = isBusy(busyKey);
  const qr = isQRPayment(o);
  const cashDue = qr ? 0 : cashToCollect(o);
  const needsCash = !qr && cashDue > 0;
  const hasAfter = evidence.some((e) => e.stage === 'after');
  const safetyTotal = SAFETY_ITEMS.length;
  const safetyDone = SAFETY_ITEMS.filter((it) => safetyChecks.includes(it)).length;

  const toggleAccepted = () => {
    if (accepted) { setAccepted(false); setAcceptedAt(null); return; }
    if (!acceptName.trim()) {
      u.alert('Thiếu họ tên', 'Nhập họ tên người nghiệm thu tại chỗ trước khi xác nhận.', 'pencil');
      return;
    }
    setAccepted(true);
    setAcceptedAt(Date.now());
  };

  const close = () => { if (!busy) onClose?.(); };

  const submit = () => run(busyKey, async () => {
    if (!summary.trim()) {
      u.alert('Thiếu nội dung', 'Ghi ngắn công việc đã làm trước khi gửi biên bản.', 'file-text');
      return false;
    }
    if (safetyDone < safetyTotal) {
      u.alert('Chưa đủ checklist an toàn', `Vui lòng kiểm tra và tick đủ ${safetyTotal} tiêu chuẩn an toàn kỹ thuật (đã tick ${safetyDone}/${safetyTotal}) trước khi bàn giao.`, 'zap');
      return false;
    }
    const name = acceptName.trim();
    if (!name || !accepted || !acceptedAt) {
      u.alert('Chưa có xác nhận nghiệm thu', 'Nhập họ tên người nghiệm thu và tick “Khách đã kiểm tra và đồng ý nghiệm thu”.', 'pen-tool');
      return false;
    }
    if (!hasAfter && !forceDone) {
      u.alert('Thiếu ảnh sau khi làm', 'Nên thêm ảnh “Sau khi làm” làm minh chứng. Tick xác nhận nếu khách đồng ý bỏ qua.', 'camera');
      return false;
    }
    const ok = await Promise.resolve(a.completeJob(o.code, {
      summary: summary.trim(),
      paid: qr ? Boolean(o.report?.paid) : (needsCash ? paid : true),
      safetyChecklist: SAFETY_ITEMS.filter((it) => safetyChecks.includes(it)),
      customerSignature: name, // giữ kiểu cũ: chuỗi họ tên
      customerAcceptance: { name, confirmedAt: acceptedAt },
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
      <Field label="Nội dung công việc đã làm" multiline value={summary} onChangeText={setSummary} style={{ marginTop: -8 }} />
      <Text style={[ui.fieldLabel, { marginTop: 10, marginBottom: 6 }]}>
        ⚡ Checklist an toàn kỹ thuật & nghiệm thu ({safetyDone}/{safetyTotal})
      </Text>
      <View style={{ padding: 10, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.line, marginBottom: 10, gap: 6 }}>
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

      <Text style={[ui.fieldLabel, { marginTop: 6, marginBottom: 6 }]}>✍️ Xác nhận nghiệm thu của khách hàng</Text>
      <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: accepted ? '#A7F3D0' : '#CBD5E1', marginBottom: 10 }}>
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
            backgroundColor: o.report?.paid ? C.greenSoft : '#FFFBEB',
            borderWidth: 1.5,
            borderColor: o.report?.paid ? '#A7F3D0' : '#FDE68A',
            marginTop: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name={o.report?.paid ? 'check-circle-2' : 'qr-code'} size={18} color={o.report?.paid ? C.green : C.orange} strokeWidth={2.3} />
            <Text style={{ fontWeight: '800', color: o.report?.paid ? C.green : C.goldInk, fontSize: 13.5, flex: 1 }}>
              {o.report?.paid
                ? `Khách đã chuyển khoản VietQR (${formatVND(orderTotal(o))})`
                : `Khách chuyển khoản QR (${formatVND(orderTotal(o))}) — KHÔNG THU TIỀN`}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: o.report?.paid ? '#065F46' : C.goldInk, marginTop: 4, lineHeight: 18 }}>
            {o.report?.paid
              ? 'Hệ thống đã xác nhận thanh toán QR từ khách hàng. Bạn chỉ cần gửi biên bản hoàn thành.'
              : 'Đơn này khách chọn Chuyển khoản VietQR trên App Khách hàng. Kỹ thuật viên không được thu tiền mặt — sau khi gửi biên bản, mã QR sẽ hiển thị trên máy khách để quét.'}
          </Text>
        </View>
      ) : null}
      {needsCash ? (
        <View style={[tx.note, { backgroundColor: C.redSoft, marginTop: 4 }]}>
          <Text style={{ color: C.red, fontWeight: '700', lineHeight: 19 }}>
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
      {!hasAfter ? (
        <View style={[tx.note, { backgroundColor: C.orangeSoft, marginTop: 14 }]}>
          <Text style={{ color: C.orange, fontWeight: '700', marginBottom: 8 }}>⚠ Chưa có ảnh “Sau khi làm”.</Text>
          <Checkbox on={forceDone} onPress={() => setForceDone(!forceDone)} label="Khách đồng ý hoàn thành không kèm ảnh sau" />
        </View>
      ) : null}
      <Text style={[ui.meta, { marginTop: 12 }]}>Sau khi gửi, khách nhận thông báo hoàn thành và có thể đánh giá.</Text>
    </Sheet>
  );
}
