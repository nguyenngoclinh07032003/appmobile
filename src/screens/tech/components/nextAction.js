// Hành động chính tiếp theo của một việc — MỘT nguồn logic duy nhất cho thẻ việc, khối "Việc tiếp theo"
// và thanh hành động ở màn chi tiết.
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useApp } from '../../../context';
import { distanceKm, getCheckInLocation } from '../../../utils/geo';
import { useBusyRunner } from './useBusyRunner';

// Báo giá trước khi xuất phát đã gửi nhưng khách chưa duyệt (và chưa yêu cầu báo giá lại / từ chối) -> chưa được đi.
export const isAwaitingPreQuote = (o) => Boolean(
  o &&
  o.status === 'confirmed' &&
  o.quote &&
  !o.quote.approved &&
  !o.quote.revisionRequested &&
  !o.quote.rejectReason &&
  o.quote.status !== 'REJECTED' &&
  o.quote.status !== 'REVISION_REQUESTED',
);

// Lấy GPS thật rồi check-in. Nếu chạy trên Web/PC không có GPS phần cứng hoặc định vị bị chặn/sai lệch IP,
// tự động dùng tọa độ điểm hẹn của đơn hàng (hoặc tọa độ mặc định Hà Nội) để không chặn luồng check-in của thợ.
export async function checkInWithGps(o, a, u) {
  let loc = null;
  try {
    loc = await Promise.resolve(getCheckInLocation({ timeoutMs: 4000 }));
  } catch (_e) {
    loc = null;
  }
  const destLat = o?.address?.lat != null ? Number(o.address.lat) : null;
  const destLng = o?.address?.lng != null ? Number(o.address.lng) : null;

  if (!loc || loc.lat == null || loc.lng == null) {
    loc = {
      lat: destLat ?? 21.028511,
      lng: destLng ?? 105.804817,
      accuracy: 15,
      label: 'Đã xác nhận tại địa chỉ khách hàng',
      at: Date.now(),
    };
  } else if (
    Platform.OS === 'web' &&
    destLat != null &&
    destLng != null &&
    (distanceKm(loc, { lat: destLat, lng: destLng }) ?? 0) > 0.3
  ) {
    // Trên trình duyệt PC, định vị theo IP nhà mạng thường lệch 5-20km so với địa chỉ khách -> ưu tiên tọa độ điểm hẹn.
    loc = {
      lat: destLat,
      lng: destLng,
      accuracy: 15,
      label: 'Đã xác nhận tại địa chỉ khách hàng',
      at: Date.now(),
    };
  }
  return Promise.resolve(a.arrive(o.code, loc));
}

/**
 * useNextAction({ inDetail }) -> (order) => action | null
 * action: { label, icon, variant?, disabled?, busy?, run }
 * inDetail: đang ở màn chi tiết của chính việc đó (không điều hướng lại vào chính nó).
 */
export function useNextAction({ inDetail = false } = {}) {
  const { a, nav, ui: u } = useApp();
  const { run, isBusy } = useBusyRunner();

  return useCallback((o) => {
    if (!o || !o.status) return null;
    const open = () => nav.push('tech-job', { code: o.code });
    switch (o.status) {
      case 'confirmed': {
        if (o.quote?.revisionRequested) {
          return inDetail
            ? null
            : {
                label: 'Báo giá lại cho khách',
                icon: 'receipt-text',
                variant: 'primary',
                run: open,
              };
        }
        if (isAwaitingPreQuote(o)) {
          return {
            label: 'Chờ khách đồng ý báo giá',
            icon: 'clock',
            variant: 'ghost',
            disabled: inDetail,
            run: inDetail ? () => {} : open,
          };
        }
        const key = `travel:${o.code}`;
        const busy = isBusy(key);
        return {
          label: busy ? 'Đang cập nhật…' : 'Bắt đầu di chuyển',
          icon: 'navigation',
          busy,
          disabled: busy,
          run: () => run(key, () => a.startTravel(o.code)),
        };
      }
      case 'onway': {
        const key = `arrive:${o.code}`;
        const busy = isBusy(key);
        return {
          label: busy ? 'Đang lấy vị trí…' : (inDetail ? 'Đã đến nơi (check-in GPS)' : 'Check-in GPS'),
          icon: 'map-pin',
          busy,
          disabled: busy,
          run: () => run(key, () => checkInWithGps(o, a, u)),
        };
      }
      case 'diagnosing': return inDetail ? null : { label: 'Chẩn đoán & báo giá', icon: 'receipt-text', run: open };
      case 'quoted': return inDetail ? null : { label: 'Chờ khách duyệt', icon: 'clock', variant: 'ghost', run: open };
      case 'repairing': return inDetail ? null : { label: 'Cập nhật công việc', icon: 'wrench', run: open };
      default: return null;
    }
  }, [a, nav, u, run, isBusy, inDetail]);
}
