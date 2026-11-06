// Cấu hình kết nối Backend HRMSS
// Mặc định kết nối trực tiếp tới VPS Cloud (https://server.hrmss.cyou/api/v1)

export const API_ENDPOINTS = {
  // Server Cloud VPS chính thức
  cloud: "https://server.hrmss.cyou/api/v1",

  // Server Backend Localhost Port 8080
  local8080: "http://localhost:5000/api/v1",

  // Server Localhost Port 5174 / 5173
  local5174: "http://localhost:5174/api/v1",
  local5173: "http://localhost:5173/api/v1",
};

// Đặt toàn bộ kết nối của App sang VPS Cloud
export const API_BASE_URL = API_ENDPOINTS.cloud;

export const APP_CONFIG = {
  apiBaseUrl: API_BASE_URL,
  endpoints: API_ENDPOINTS,
  timeoutMs: 8000,
  tokenStorageKey: "tho-hrmss-jwt-token",
  refreshTokenStorageKey: "tho-hrmss-refresh-token",
};
