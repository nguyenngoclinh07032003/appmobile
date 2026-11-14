import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Platform, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SvgUri } from 'react-native-svg';
import hrmssApi from '../../services/api';
import { formatVND } from '../../constants/data';
import { C } from '../../theme';

const POLL_MS = 5000;
const DONE_STATUSES = ['PAID', 'NOTHING_TO_PAY'];

// Ảnh QR thật từ backend (img.vietqr.io trả SVG -> dùng SvgUri; bản web dùng <Image>).
function QrImage({ uri, size }) {
  if (Platform.OS === 'web') return <Image source={{ uri }} style={{ width: size, height: size * 1.15 }} resizeMode="contain" />;
  return <SvgUri uri={uri} width={size} height={size * 1.15} />;
}

function RetryButton({ onPress, busy }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: '#D6E4FF', opacity: busy ? 0.5 : 1 }}
    >
      <Text style={{ color: C.primary, fontWeight: '700' }}>{busy ? 'Đang thử lại…' : 'Thử lại'}</Text>
    </TouchableOpacity>
  );
}

/**
 * Thanh toán VietQR cho 1 đơn đã lưu trên server (order.dbRequestId).
 * Mã QR do backend tạo: đúng số tiền còn phải trả, nội dung HRMSS<số>, đúng tài khoản nhận.
 * Tiền về thì SePay báo backend; component hỏi lại hóa đơn mỗi 5 giây, thấy PAID / NOTHING_TO_PAY thì
 * dừng hỏi và gọi onPaid() đúng 1 lần.
 */
export function VietQRPay({ requestId, onPaid, size = 220 }) {
  const [qr, setQr] = useState(null);         // { amount, transfer_content, account_no, account_name, qr_image_url }
  const [bill, setBill] = useState(null);     // { payment_status, remaining_amount, paid_amount, overpaid_amount }
  const [error, setError] = useState(null);   // lỗi tạo QR
  const [billError, setBillError] = useState(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false); // createVietQr trả ALREADY_PAID
  const [creating, setCreating] = useState(false);

  const paidRef = useRef(false);
  const qrRef = useRef(null);
  const creatingRef = useRef(false);
  const stopRef = useRef(false);
  const timerRef = useRef(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Tạo (hoặc lấy lại) mã QR. Có cờ chống tạo trùng khi vòng hỏi hoá đơn gọi lại liên tục.
  const loadQr = useCallback(async () => {
    if (!requestId || creatingRef.current || stopRef.current || paidRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const res = await hrmssApi.createVietQr(requestId);
      if (stopRef.current) return;
      if (res?.ok) {
        // Chỉ nhận ảnh QR https từ img.vietqr.io (không mở URL lạ do server trả về).
        const url = String(res.data?.qr_image_url || '');
        const safe = /^https:\/\/img\.vietqr\.io\//.test(url);
        const data = { ...res.data, qr_image_url: safe ? url : null };
        qrRef.current = data;
        setQr(data);
        setError(null);
        return;
      }
      if (res?.code === 'ALREADY_PAID') { setAlreadyPaid(true); setError(null); return; } // để vòng hỏi hoá đơn xác nhận
      setError(res?.code === 'NOT_PAYABLE_YET' ? 'Đơn chưa đến bước thanh toán.' : (res?.message || 'Không kết nối được máy chủ.'));
    } catch (e) {
      if (!stopRef.current) setError((e && e.message) || 'Không kết nối được máy chủ.');
    } finally {
      creatingRef.current = false;
      if (!stopRef.current) setCreating(false);
    }
  }, [requestId]);

  const tick = useCallback(async () => {
    if (!requestId || stopRef.current || paidRef.current) return;
    let res;
    try {
      res = await hrmssApi.getBill(requestId);
    } catch (e) {
      if (!stopRef.current) setBillError((e && e.message) || 'Không kết nối được máy chủ.');
      return;
    }
    if (stopRef.current) return;
    if (!res?.ok || !res.data) {
      setBillError(res?.message || 'Không lấy được hoá đơn.');
      return;
    }
    setBillError(null);
    setBill(res.data);
    const st = res.data.payment_status;
    if (DONE_STATUSES.includes(st)) {
      stopPolling(); // đã xong: không hỏi nữa
      if (!paidRef.current) {
        paidRef.current = true;
        try { onPaidRef.current?.(res.data); } catch (_e) { /* lỗi ở nơi gọi không làm hỏng màn QR */ }
      }
      return;
    }
    // Chuyển thiếu: mã cũ đã dùng -> tạo mã mới cho phần còn lại (loadQr tự chống gọi trùng).
    const cur = qrRef.current;
    if (st === 'PARTIALLY_PAID' && cur && Number(cur.amount) !== Number(res.data.remaining_amount)) loadQr();
  }, [requestId, loadQr, stopPolling]);

  // Một vòng cho mỗi đơn: tạo mã QR 1 lần, rồi hỏi hoá đơn mỗi 5 giây tới khi PAID / NOTHING_TO_PAY.
  useEffect(() => {
    if (!requestId) return undefined;
    stopRef.current = false;
    paidRef.current = false;
    qrRef.current = null;
    creatingRef.current = false;
    setQr(null); setBill(null); setError(null); setBillError(null); setAlreadyPaid(false); setCreating(false);
    loadQr();
    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    return () => { stopRef.current = true; stopPolling(); };
  }, [requestId, loadQr, tick, stopPolling]);

  const retry = () => {
    setError(null);
    loadQr();
    if (!timerRef.current && !paidRef.current) {
      tick();
      timerRef.current = setInterval(tick, POLL_MS);
    }
  };

  if (!requestId) return <Text style={{ color: C.muted, textAlign: 'center' }}>Đơn chưa đồng bộ với hệ thống, chưa tạo được mã QR.</Text>;

  const status = bill?.payment_status;
  if (status === 'PAID') {
    return (
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontWeight: '800', color: C.green, fontSize: 16 }}>Đã thanh toán {formatVND(bill.paid_amount)}</Text>
        {bill.overpaid_amount > 0 ? <Text style={{ color: C.orange }}>Bạn chuyển dư {formatVND(bill.overpaid_amount)}, văn phòng sẽ hoàn lại.</Text> : null}
      </View>
    );
  }
  if (status === 'NOTHING_TO_PAY') {
    return (
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontWeight: '800', color: C.green, fontSize: 16 }}>Đơn không còn khoản nào cần thanh toán</Text>
      </View>
    );
  }
  if (alreadyPaid && !qr) {
    // Server báo đã trả nhưng chưa đọc được hoá đơn để xác nhận số tiền.
    return (
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontWeight: '800', color: C.green, fontSize: 15, textAlign: 'center' }}>Hệ thống ghi nhận đơn đã được thanh toán</Text>
        <Text style={{ color: C.muted, textAlign: 'center', fontSize: 12 }}>
          {billError ? `Chưa tải được hoá đơn: ${billError}` : 'Đang đối soát hoá đơn…'}
        </Text>
        {billError ? <RetryButton onPress={retry} busy={creating} /> : null}
      </View>
    );
  }
  if (error && !qr) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: C.red, textAlign: 'center' }}>Không tạo được mã QR: {error}</Text>
        <RetryButton onPress={retry} busy={creating} />
      </View>
    );
  }
  if (!qr) {
    return (
      <View style={{ alignItems: 'center', gap: 6 }}>
        <ActivityIndicator />
        {billError ? <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>Chưa tải được hoá đơn: {billError}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      {status === 'PARTIALLY_PAID' ? (
        <Text style={{ color: C.orange, fontWeight: '700', textAlign: 'center' }}>
          Đã nhận {formatVND(bill.paid_amount)}, còn thiếu {formatVND(bill.remaining_amount)}. {creating ? 'Đang tạo mã mới cho phần còn lại…' : 'Quét mã mới để trả phần còn lại.'}
        </Text>
      ) : null}
      {qr.qr_image_url ? <QrImage uri={qr.qr_image_url} size={size} /> : <Text style={{ color: C.muted }}>Chưa hiện được ảnh QR, chuyển khoản theo thông tin bên dưới.</Text>}
      <Text style={{ fontWeight: '800', color: C.red, fontSize: 16 }}>{formatVND(qr.amount)}</Text>
      <Text style={{ color: C.muted }}>Nội dung: <Text style={{ fontWeight: '800', color: C.ink }}>{qr.transfer_content}</Text> (giữ nguyên, không sửa)</Text>
      <Text style={{ color: C.muted }}>{qr.account_name || ''} · {qr.account_no}</Text>
      {error ? (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: C.red, fontSize: 12, textAlign: 'center' }}>Không tạo được mã mới: {error}</Text>
          <RetryButton onPress={retry} busy={creating} />
        </View>
      ) : (
        <Text style={{ color: C.muted, fontSize: 12 }}>Đang chờ ngân hàng xác nhận… tự cập nhật sau vài giây.</Text>
      )}
    </View>
  );
}
