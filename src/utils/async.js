// Tiện ích bất đồng bộ dùng chung.

/** Chỉ ghi cảnh báo khi chạy bản phát triển (expo start). */
export const devWarn = (...args) => {
  // eslint-disable-next-line no-console
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(...args);
};
