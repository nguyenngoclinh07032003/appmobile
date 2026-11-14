// Cấu hình kết nối Backend HRMSS
// Mặc định kết nối trực tiếp tới VPS Cloud (https://server.hrmss.cyou/api/v1)

export const API_ENDPOINTS = {
  // Server Cloud VPS chính thức
  cloud: "https://server.hrmss.cyou/api/v1",

  // Backend chạy trên máy (cổng 5000) — dùng qua EXPO_PUBLIC_API_URL, xem hướng dẫn bên dưới.
  local5000: "http://localhost:5000/api/v1",
};

// Chọn server theo biến môi trường (Expo nhúng sẵn biến EXPO_PUBLIC_* lúc build):
//   - Thử / demo với backend trên máy: tạo file .env.local (copy từ .env.example) với
//       EXPO_PUBLIC_API_URL=http://localhost:5000/api/v1
//     hoặc chạy: EXPO_PUBLIC_API_URL=http://localhost:5000/api/v1 npx expo start
//   - Không đặt biến -> server thật (production) https://server.hrmss.cyou/api/v1.
// Đổi .env.local xong phải chạy lại: npx expo start -c (xóa cache để nhận biến mới).
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL || '';
// true = đang trỏ tới backend tự chọn: không tự chuyển sang server thật khi lỗi mạng.
export const API_URL_OVERRIDDEN = Boolean(ENV_API_URL);
export const API_BASE_URL = ENV_API_URL || API_ENDPOINTS.cloud;
// Môi trường hiển thị cho người phát triển: "production" khi đang trỏ server thật.
export const API_ENV = API_URL_OVERRIDDEN ? 'custom' : 'production';

// Cấu hình Socket.IO kết nối realtime
export const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
export const SOCKET_PATH = '/api/socket.io';

// Chạy bản phát triển (expo start) mà vẫn trỏ server thật: cảnh báo rõ để tránh ghi dữ liệu thử lên server thật.
if (typeof __DEV__ !== 'undefined' && __DEV__ && !API_URL_OVERRIDDEN) {
  // eslint-disable-next-line no-console
  console.warn(`[HRMSS] App đang gọi SERVER THẬT (${API_ENDPOINTS.cloud}). Muốn thử với backend trên máy: đặt EXPO_PUBLIC_API_URL trong .env.local rồi chạy npx expo start -c.`);
}

export const APP_CONFIG = {
  apiBaseUrl: API_BASE_URL,
  endpoints: API_ENDPOINTS,
  timeoutMs: 8000,
  tokenStorageKey: "tho-hrmss-jwt-token",
  refreshTokenStorageKey: "tho-hrmss-refresh-token",
};
