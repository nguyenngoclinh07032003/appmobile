import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { TopBar, EmptyState } from '../../components';

// Gọi một action trong context một cách phòng thủ: action có thể đồng bộ hoặc trả Promise,
// có thể chưa tồn tại. Luôn trả Promise để dùng chung với try/catch.
export function callAction(fn, ...args) {
  if (typeof fn !== 'function') return Promise.reject(new Error('Chức năng chưa sẵn sàng, vui lòng thử lại.'));
  try {
    return Promise.resolve(fn(...args));
  } catch (e) {
    return Promise.reject(e);
  }
}

// Thông điệp lỗi thân thiện từ Error / object { error | message }.
export const errorText = (e, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại.') => {
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  return e.error || e.message || fallback;
};

// Kết quả action được coi là thành công: true / mã đơn / object không mang ok:false.
// (Các action trả false/null khi thất bại và tự hiện thông báo lỗi.)
export const isOk = (res) => !!res && res.ok !== false;

// Cờ busy chống bấm đúp: ref chặn đồng bộ ngay lần bấm thứ 2, state để vẽ lại nút (disabled / "Đang xử lý…").
// run(fn) trả về kết quả của fn, hoặc undefined nếu đang bận.
export function useBusy() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn) => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

// Màn hình "không tìm thấy" có nút quay lại (thay cho return null gây màn trắng).
export function NotFoundView({ title = 'Không tìm thấy đơn', body = 'Đơn hàng không tồn tại hoặc chưa được đồng bộ. Vui lòng quay lại và thử lại.', onBack, icon = 'receipt-text' }) {
  return (
    <View style={{ flex: 1 }}>
      <TopBar title={title} />
      <EmptyState icon={icon} title={title} body={body} action={onBack ? 'Quay lại' : null} onAction={onBack} style={{ flex: 1 }} />
    </View>
  );
}
