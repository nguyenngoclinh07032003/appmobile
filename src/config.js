// Cấu hình kết nối Backend HRMSS
// Mặc định kết nối toàn bộ sang Port 5174 (Localhost)

export const API_ENDPOINTS = {
  // Server Localhost Port 5174 (Được chọn làm mặc định)
  local5174: 'http://localhost:5174/api/v1',

  // Server Localhost Port 5173
  local5173: 'http://localhost:5173/api/v1',

  // Server Cloud Online dự phòng
  cloud: 'https://server.hrmss.cyou/api/v1',
};

// Đặt toàn bộ kết nối của App sang Port 5174
export const API_BASE_URL = API_ENDPOINTS.local5174;

export const APP_CONFIG = {
  apiBaseUrl: API_BASE_URL,
  endpoints: API_ENDPOINTS,
  timeoutMs: 8000,
  tokenStorageKey: 'tho-hrmss-jwt-token',
  refreshTokenStorageKey: 'tho-hrmss-refresh-token',
};
