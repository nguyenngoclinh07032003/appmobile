import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Platform, ActivityIndicator } from 'react-native';
import { SvgUri } from 'react-native-svg';
import hrmssApi from '../../services/api';
import { formatVND } from '../../constants/data';
import { C } from '../../theme';

// Ảnh QR thật từ backend (img.vietqr.io trả SVG -> dùng SvgUri; bản web dùng <Image>).
function QrImage({ uri, size }) {
  if (Platform.OS === 'web') return <Image source={{ uri }} style={{ width: size, height: size * 1.15 }} resizeMode="contain" />;
  return <SvgUri uri={uri} width={size} height={size * 1.15} />;
}

/**
 * Thanh toán VietQR cho 1 đơn đã lưu trên server (order.dbRequestId).
 * Mã QR do backend tạo: đúng số tiền còn phải trả, nội dung HRMSS<số>, đúng tài khoản nhận.
 * Tiền về thì SePay báo backend; component hỏi lại hóa đơn mỗi 5 giây, thấy PAID thì gọi onPaid().
 */
export function VietQRPay({ requestId, onPaid, size = 220 }) {
  const [qr, setQr] = useState(null);         // { amount, transfer_content, account_no, account_name, qr_image_url }
  const [bill, setBill] = useState(null);     // { payment_status, remaining_amount, paid_amount, overpaid_amount }
  const [error, setError] = useState(null);
  const paidRef = useRef(false);

  const qrRef = useRef(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  // Một vòng cho mỗi đơn: tạo (hoặc lấy lại) mã QR 1 lần, rồi hỏi hoá đơn mỗi 5 giây tới khi PAID.
  // Trước đây effect phụ thuộc qr.payment_id nên mở màn là gọi tạo QR 2 lần và đặt lại vòng hỏi.
  useEffect(() => {
    if (!requestId) return undefined;
    let stop = false;
    paidRef.current = false;
    qrRef.current = null;
    setQr(null); setBill(null); setError(null);
    const loadQr = async () => {
      const res = await hrmssApi.createVietQr(requestId);
      if (stop) return;
      if (res.ok) {
        // Chỉ nhận ảnh QR https từ img.vietqr.io (không mở URL lạ do server trả về).
        const url = String(res.data?.qr_image_url || '');
        const safe = /^https:\/\/img\.vietqr\.io\//.test(url);
        const data = { ...res.data, qr_image_url: safe ? url : null };
        qrRef.current = data; setQr(data); setError(null); return;
      }
      if (res.code === 'ALREADY_PAID') return; // để vòng hỏi hóa đơn xử lý
      setError(res.code === 'NOT_PAYABLE_YET' ? 'Đơn chưa đến bước thanh toán.' : res.message);
    };
    const tick = async () => {
      const res = await hrmssApi.getBill(requestId);
      if (stop || !res.ok) return;
      setBill(res.data);
      const st = res.data.payment_status;
      if (st === 'PAID' || st === 'NOTHING_TO_PAY') {
        if (!paidRef.current) { paidRef.current = true; onPaidRef.current?.(res.data); }
        return;
      }
      // Chuyển thiếu: mã cũ đã dùng -> tạo mã mới cho phần còn lại.
      const cur = qrRef.current;
      if (st === 'PARTIALLY_PAID' && cur && Number(cur.amount) !== Number(res.data.remaining_amount)) loadQr();
    };
    loadQr();
    const timer = setInterval(tick, 5000);
    tick();
    return () => { stop = true; clearInterval(timer); };
  }, [requestId]);

  if (!requestId) return <Text style={{ color: C.muted, textAlign: 'center' }}>Đơn chưa đồng bộ với hệ thống, chưa tạo được mã QR.</Text>;
  if (bill?.payment_status === 'PAID') {
    return (
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontWeight: '800', color: C.green, fontSize: 16 }}>Đã thanh toán {formatVND(bill.paid_amount)}</Text>
        {bill.overpaid_amount > 0 ? <Text style={{ color: C.orange }}>Bạn chuyển dư {formatVND(bill.overpaid_amount)}, văn phòng sẽ hoàn lại.</Text> : null}
      </View>
    );
  }
  if (error) return <Text style={{ color: C.red, textAlign: 'center' }}>Không tạo được mã QR: {error}</Text>;
  if (!qr) return <ActivityIndicator />;

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      {bill?.payment_status === 'PARTIALLY_PAID' ? (
        <Text style={{ color: C.orange, fontWeight: '700', textAlign: 'center' }}>
          Đã nhận {formatVND(bill.paid_amount)}, còn thiếu {formatVND(bill.remaining_amount)}. Quét mã mới để trả phần còn lại.
        </Text>
      ) : null}
      {qr.qr_image_url ? <QrImage uri={qr.qr_image_url} size={size} /> : <Text style={{ color: C.muted }}>Chưa hiện được ảnh QR, chuyển khoản theo thông tin bên dưới.</Text>}
      <Text style={{ fontWeight: '800', color: C.red, fontSize: 16 }}>{formatVND(qr.amount)}</Text>
      <Text style={{ color: C.muted }}>Nội dung: <Text style={{ fontWeight: '800', color: C.ink }}>{qr.transfer_content}</Text> (giữ nguyên, không sửa)</Text>
      <Text style={{ color: C.muted }}>{qr.account_name || ''} · {qr.account_no}</Text>
      <Text style={{ color: C.muted, fontSize: 12 }}>Đang chờ ngân hàng xác nhận… tự cập nhật sau vài giây.</Text>
    </View>
  );
}
