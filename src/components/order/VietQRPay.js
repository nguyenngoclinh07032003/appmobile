import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Platform, ActivityIndicator, TouchableOpacity, Share } from 'react-native';
import { SvgUri } from 'react-native-svg';
import hrmssApi from '../../services/api';
import { formatVND } from '../../constants/data';
import { C } from '../../theme';
import { toVietnamese } from '../../utils/viText';

const POLL_MS = 5000;
const DONE_STATUSES = ['PAID', 'NOTHING_TO_PAY'];

// Ảnh QR thật từ backend: tự phát hiện .svg vs .png/.jpg và fallback sang <Image> nếu SvgUri lỗi.
function QrImage({ uri, size }) {
  const [forceRaster, setForceRaster] = useState(false);
  useEffect(() => { setForceRaster(false); }, [uri]);
  const isSvgUrl = /\.svg(?:$|\?)/i.test(String(uri || ''));
  if (Platform.OS === 'web' || forceRaster || !isSvgUrl) {
    return <Image source={{ uri }} style={{ width: size, height: size * 1.15 }} resizeMode="contain" />;
  }
  return (
    <SvgUri
      uri={uri}
      width={size}
      height={size * 1.15}
      onError={() => setForceRaster(true)}
    />
  );
}

function RetryButton({ onPress, busy }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryBorder, opacity: busy ? 0.5 : 1 }}
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
export function VietQRPay({ requestId, onPaid, size = 220, paused = false }) {
  const [qr, setQr] = useState(null);         // { amount, transfer_content, account_no, account_name, qr_image_url }
  const [bill, setBill] = useState(null);     // { payment_status, remaining_amount, paid_amount, overpaid_amount }
  const [error, setError] = useState(null);   // lỗi tạo QR
  const [billError, setBillError] = useState(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false); // createVietQr trả ALREADY_PAID
  const [creating, setCreating] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const paidRef = useRef(false);
  const qrRef = useRef(null);
  const creatingRef = useRef(false);
  const stopRef = useRef(false);
  const timerRef = useRef(null);
  const alreadyPaidRef = useRef(false);
  const lastPartialRemainingRef = useRef(null);
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
      if (res?.code === 'ALREADY_PAID') {
        alreadyPaidRef.current = true;
        setAlreadyPaid(true);
        setError(null);
        return;
      } // để vòng hỏi hoá đơn xác nhận
      if (res?.code === 'NOT_PAYABLE_YET') { stopPolling(); setError('Đơn chưa đến bước thanh toán.'); return; }
      setError(toVietnamese(res?.message, '') || 'Không kết nối được máy chủ.');
    } catch (e) {
      if (!stopRef.current) setError(toVietnamese(e?.message, '') || 'Không kết nối được máy chủ.');
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
      if (!stopRef.current) setBillError(toVietnamese(e?.message, '') || 'Không kết nối được máy chủ.');
      return;
    }
    if (stopRef.current) return;
    if (!res?.ok || !res.data) {
      if (res?.code === 'NOT_PAYABLE_YET' || [400, 403, 404].includes(Number(res?.status))) {
        stopPolling();
        if (alreadyPaidRef.current && !paidRef.current) {
          paidRef.current = true;
          try { onPaidRef.current?.({ payment_status: 'PAID' }); } catch (_e) {}
          return;
        }
      }
      setBillError(res?.code === 'NOT_PAYABLE_YET' ? 'Đơn chưa đến bước thanh toán.' : (toVietnamese(res?.message, '') || 'Không lấy được hoá đơn.'));
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
    // Chuyển thiếu: mã cũ đã dùng -> tạo mã mới cho phần còn lại (chặn gọi lặp cho cùng số tiền nếu lỗi).
    const cur = qrRef.current;
    const rem = Number(res.data.remaining_amount);
    if (st === 'PARTIALLY_PAID' && cur && Number(cur.amount) !== rem && lastPartialRemainingRef.current !== rem) {
      lastPartialRemainingRef.current = rem;
      loadQr();
    }
  }, [requestId, loadQr, stopPolling]);

  // Một vòng cho mỗi đơn: tạo mã QR 1 lần, rồi hỏi hoá đơn mỗi 5 giây tới khi PAID / NOTHING_TO_PAY.
  useEffect(() => {
    if (!requestId || paused) return undefined;
    stopRef.current = false;
    paidRef.current = false;
    qrRef.current = null;
    creatingRef.current = false;
    alreadyPaidRef.current = false;
    lastPartialRemainingRef.current = null;
    setQr(null); setBill(null); setError(null); setBillError(null); setAlreadyPaid(false); setCreating(false);
    loadQr();
    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    return () => { stopRef.current = true; stopPolling(); };
  }, [requestId, paused, loadQr, tick, stopPolling]);

  const copyText = async (field, val) => {
    const str = String(val ?? '');
    if (!str) return;
    let copied = false;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(str);
        copied = true;
      } else {
        await Share.share({ message: str });
        copied = true;
      }
    } catch (_e) {
      try {
        await Share.share({ message: str });
        copied = true;
      } catch (_e2) {}
    }
    if (copied) {
      setCopiedField(field);
      setTimeout(() => setCopiedField((cur) => (cur === field ? null : cur)), 2000);
    }
  };

  const retry = () => {
    setError(null);
    lastPartialRemainingRef.current = null;
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
      <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }}>{formatVND(qr.amount)}</Text>
      <Text style={{ color: C.muted }}>Nội dung: <Text style={{ fontWeight: '800', color: C.ink }}>{qr.transfer_content}</Text> (giữ nguyên, không sửa)</Text>
      <Text style={{ color: C.muted, textAlign: 'center' }}>
        {[qr.bank_name || qr.bank_code || qr.bank_id, qr.account_name, qr.account_no].filter(Boolean).join(' · ')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 2 }}>
        {qr.account_no ? (
          <TouchableOpacity
            onPress={() => copyText('acc', qr.account_no)}
            activeOpacity={0.8}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>
              {copiedField === 'acc' ? '✓ Đã chép STK' : 'Sao chép STK'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {qr.transfer_content ? (
          <TouchableOpacity
            onPress={() => copyText('memo', qr.transfer_content)}
            activeOpacity={0.8}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>
              {copiedField === 'memo' ? '✓ Đã chép nội dung' : 'Sao chép nội dung'}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => copyText('amt', String(Math.round(Number(qr.amount) || 0)))}
          activeOpacity={0.8}
          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>
            {copiedField === 'amt' ? '✓ Đã chép số tiền' : 'Sao chép số tiền'}
          </Text>
        </TouchableOpacity>
      </View>
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
