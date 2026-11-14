// Hành động chính tiếp theo của một việc — MỘT nguồn logic duy nhất cho thẻ việc, khối "Việc tiếp theo"
// và thanh hành động ở màn chi tiết.
import { useCallback } from 'react';
import { useApp } from '../../../context';
import { getCheckInLocation } from '../../../utils/geo';
import { useBusyRunner } from './useBusyRunner';

// Báo giá trước khi xuất phát đã gửi nhưng khách chưa duyệt -> chưa được đi.
export const isAwaitingPreQuote = (o) => Boolean(o && o.status === 'confirmed' && o.quote && !o.quote.approved);

// Lấy GPS thật rồi check-in. Không có quyền / không lấy được vị trí -> báo rõ, không gửi.
export async function checkInWithGps(o, a, u) {
  let loc = null;
  try {
    loc = await Promise.resolve(getCheckInLocation());
  } catch (_e) {
    loc = null;
  }
  if (!loc || loc.lat == null || loc.lng == null) {
    u?.alert?.(
      'Không lấy được vị trí',
      'Hãy bật định vị (GPS) và cho phép ứng dụng truy cập vị trí, rồi bấm check-in lại.',
      'map-pin',
    );
    return false;
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
