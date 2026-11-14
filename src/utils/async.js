// Tiện ích bất đồng bộ dùng chung.

/** Chỉ ghi cảnh báo khi chạy bản phát triển (expo start). */
export const devWarn = (...args) => {
  // eslint-disable-next-line no-console
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(...args);
};

/**
 * Chạy fn cho từng phần tử với tối đa `limit` lời gọi song song (tránh bắn hàng chục request cùng lúc).
 * Giữ đúng thứ tự kết quả; phần tử lỗi (throw) cho kết quả null.
 */
export async function mapLimit(items, limit, fn) {
  const list = Array.from(items || []);
  const results = new Array(list.length).fill(null);
  if (!list.length) return results;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await fn(list[i], i);
      } catch (e) {
        devWarn('[mapLimit] lỗi xử lý phần tử', i, e?.message || e);
        results[i] = null;
      }
    }
  };
  const n = Math.min(Math.max(1, Number(limit) || 1), list.length);
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
