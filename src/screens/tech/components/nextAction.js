// Hành động chính tiếp theo của một việc — MỘT nguồn logic duy nhất cho thẻ việc, khối "Việc tiếp theo"
// và thanh hành động ở màn chi tiết.
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useApp, isQRPayment, isPaid, getPendingExternalEstimates, isSupportAssignment, isSupportWaitingForLead } from '../../../context';
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

const destLocOf = (o) => {
  const lat = o?.address?.lat != null ? Number(o.address.lat) : null;
  const lng = o?.address?.lng != null ? Number(o.address.lng) : null;
  if (lat == null || lng == null) return null;
  return {
    lat,
    lng,
    accuracy: 15,
    label: 'Xác nhận đến nơi theo địa chỉ khách (trình duyệt)',
    at: Date.now(),
  };
};

// Lấy GPS thật rồi check-in. Không tự giả tọa độ im lặng; trên web mới hỏi dùng địa chỉ khách.
export async function checkInWithGps(o, a, u) {
  let loc = null;
  try {
    loc = await Promise.resolve(getCheckInLocation({ timeoutMs: 4000 }));
  } catch (_e) {
    loc = null;
  }
  const dest = destLocOf(o);

  if (!loc || loc.lat == null || loc.lng == null) {
    if (Platform.OS === 'web' && dest) {
      u.toast('Trình duyệt không có định vị · dùng địa chỉ khách để xác nhận đến nơi', '📍');
      return Promise.resolve(a.arrive(o.code, dest));
    }
    u.alert(
      'Không thể lấy vị trí định vị',
      'Bật định vị rồi thử lại khi đã đến gần nhà khách.',
      '📍',
    );
    return false;
  }

  if (
    Platform.OS === 'web' &&
    dest &&
    (distanceKm(loc, { lat: dest.lat, lng: dest.lng }) ?? 0) > 0.3
  ) {
    u.toast('Định vị trình duyệt lệch điểm hẹn · dùng địa chỉ khách', '📍');
    return Promise.resolve(a.arrive(o.code, dest));
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
    if (isSupportWaitingForLead(o)) {
      return {
        label: 'Chờ thợ chính tới',
        icon: 'clock',
        variant: 'ghost',
        disabled: inDetail,
        run: inDetail ? () => {} : open,
      };
    }
    const isSupport = isSupportAssignment(o);
    switch (o.status) {
      case 'confirmed': {
        if (!isSupport && o.quote?.revisionRequested) {
          return inDetail
            ? null
            : {
                label: 'Báo giá lại cho khách',
                icon: 'receipt-text',
                variant: 'primary',
                run: open,
              };
        }
        if (!isSupport && isAwaitingPreQuote(o)) {
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
          label: busy ? 'Đang lấy vị trí…' : (inDetail ? 'Đã đến nơi (xác nhận vị trí)' : 'Xác nhận đến nơi'),
          icon: 'map-pin',
          busy,
          disabled: busy,
          run: () => run(key, () => checkInWithGps(o, a, u)),
        };
      }
      case 'diagnosing': {
        if (inDetail) return null;
        if (isSupport) return { label: 'Làm phần việc hỗ trợ', icon: 'wrench', run: open };
        if (o.externalPriceState === 'revision_requested' || (o.quote?.isExternalFinalization && o.quote?.revisionRequested)) {
          return { label: 'Chỉnh lại giá vật tư', icon: 'receipt-text', variant: 'primary', run: open };
        }
        return { label: 'Chẩn đoán & báo giá', icon: 'receipt-text', run: open };
      }
      case 'out_of_warranty': {
        if (inDetail) return null;
        if (isSupport) return { label: 'Làm phần việc hỗ trợ', icon: 'wrench', run: open };
        return { label: 'Báo giá có phí', icon: 'receipt-text', variant: 'primary', run: open };
      }
      case 'quoted':
        if (inDetail) return null;
        if (isSupport) return { label: 'Làm phần việc hỗ trợ', icon: 'wrench', run: open };
        return {
          label: o.quote?.isExternalFinalization ? 'Chờ khách xác nhận hoá đơn' : 'Chờ khách duyệt',
          icon: 'clock',
          variant: 'ghost',
          run: open,
        };
      case 'repairing': {
        if (inDetail) return null;
        if (isSupport) return { label: 'Làm phần việc hỗ trợ', icon: 'wrench', run: open };
        if (o.externalPriceState === 'revision_requested') {
          return { label: 'Chỉnh lại giá vật tư', icon: 'receipt-text', variant: 'primary', run: open };
        }
        if (getPendingExternalEstimates(o).length > 0) {
          return { label: 'Chốt giá & Gửi hoá đơn', icon: 'receipt-text', variant: 'primary', run: open };
        }
        if (o.externalPriceState === 'finalized') {
          return { label: 'Ký bàn giao & Mở TT', icon: 'check-circle-2', variant: 'primary', run: open };
        }
        return { label: 'Cập nhật công việc', icon: 'wrench', run: open };
      }
      case 'pending_payment': {
        if (inDetail || isPaid(o) || isSupport) return null;
        if (isQRPayment(o)) {
          return { label: 'Chờ khách chuyển khoản QR', icon: 'qr-code', variant: 'ghost', run: open };
        }
        return {
          label: o.bill?.cashClaimPending ? 'Xác nhận đã thu TM' : 'Thu tiền mặt',
          icon: 'banknote',
          variant: o.bill?.cashClaimPending ? 'primary' : 'soft',
          run: open,
        };
      }
      default: return null;
    }
  }, [a, nav, u, run, isBusy, inDetail]);
}
