// Cờ "đang xử lý" chống bấm đúp cho các thao tác gửi lên server của app Thợ.
// Khoá theo key (vd `accept:MD123`) ở mức module: hai nút khác nhau (thẻ việc + màn chi tiết) cùng gọi
// một thao tác cho cùng một đơn cũng không thể chạy song song.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../context';
import { toVietnamese } from '../../../utils/viText';

const inflight = new Set();
const listeners = new Set();
const notifyAll = () => {
  listeners.forEach((fn) => fn());
};

export function useBusyRunner() {
  const { ui: u } = useApp();
  const [, setTick] = useState(0);
  const mounted = useRef(true);
  const uRef = useRef(u);
  uRef.current = u;

  const bump = useCallback(() => {
    if (mounted.current) setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    listeners.add(bump);
    return () => {
      mounted.current = false;
      listeners.delete(bump);
    };
  }, [bump]);

  const isBusy = useCallback((key) => inflight.has(key), []);

  // Chạy fn (đồng bộ hoặc trả Promise). Đang chạy cùng key -> bỏ qua, trả undefined.
  // Lỗi bất ngờ -> báo người dùng, trả false (để nơi gọi coi như thất bại).
  const run = useCallback(async (key, fn) => {
    if (inflight.has(key)) return undefined;
    inflight.add(key);
    notifyAll();
    try {
      return await Promise.resolve(fn());
    } catch (e) {
      uRef.current?.alert?.(
        'Có lỗi xảy ra',
        toVietnamese(e?.message, 'Không thực hiện được thao tác. Vui lòng thử lại.') || 'Không thực hiện được thao tác. Vui lòng thử lại.',
        'alert-triangle',
      );
      return false;
    } finally {
      inflight.delete(key);
      notifyAll();
    }
  }, []);

  return { run, isBusy };
}
