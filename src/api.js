// Service kết nối API trực tiếp với Backend HRMSS
// Hỗ trợ kết nối đa cổng: 5173, 5174 và Cloud https://server.hrmss.cyou/api/v1
import { API_BASE_URL, API_ENDPOINTS, APP_CONFIG } from './config';

// Quản lý Token trên môi trường Web / LocalStorage
const getStoredToken = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(APP_CONFIG.tokenStorageKey);
    }
  } catch (e) {
    // Bỏ qua lỗi storage
  }
  return null;
};

const setStoredToken = (token) => {
  try {
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem(APP_CONFIG.tokenStorageKey, token);
      } else {
        localStorage.removeItem(APP_CONFIG.tokenStorageKey);
      }
    }
  } catch (e) {
    // Bỏ qua lỗi storage
  }
};

let currentToken = getStoredToken();

export const authTokens = {
  get: () => currentToken || getStoredToken(),
  set: (token) => {
    currentToken = token;
    setStoredToken(token);
  },
  clear: () => {
    currentToken = null;
    setStoredToken(null);
  },
};

/**
 * Hàm gọi API tổng quát (HTTP Client)
 * Tự động gắn header Authorization, timeout và hỗ trợ chuyển đổi linh hoạt giữa các cổng (5173, 5174, cloud)
 */
export async function apiRequest(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = APP_CONFIG.timeoutMs,
    targetPort = null, // Có thể truyền '5173', '5174' hoặc 'cloud'
  } = options;

  let baseUrl = API_BASE_URL;
  if (targetPort === '5173' || targetPort === 5173) {
    baseUrl = API_ENDPOINTS.local5173;
  } else if (targetPort === '5174' || targetPort === 5174) {
    baseUrl = API_ENDPOINTS.local5174;
  } else if (targetPort === 'cloud') {
    baseUrl = API_ENDPOINTS.cloud;
  }

  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanPath}`;

  const token = authTokens.get();
  const reqHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);

    let resData = null;
    const contentType = res.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        resData = await res.json();
      } catch (parseErr) {
        resData = null;
      }
    } else {
      const text = await res.text();
      resData = { message: text };
    }

    if (!res.ok) {
      let errMsg = resData?.message || `Lỗi máy chủ (${res.status})`;
      if (Array.isArray(resData?.errors) && resData.errors.length > 0) {
        const details = resData.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
        errMsg = `${errMsg} (${details})`;
      }
      return {
        ok: false,
        status: res.status,
        code: resData?.code || 'ERROR',
        message: errMsg,
        data: resData?.data || null,
        errors: resData?.errors || [],
      };
    }

    return {
      ok: true,
      status: res.status,
      code: resData?.code || 'OK',
      message: resData?.message || 'Thành công',
      data: resData?.data ?? resData,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError';

    // Nếu gọi local (5173 hoặc 5174) bị lỗi kết nối, tự động thử fallback sang Cloud Server
    if (baseUrl !== API_ENDPOINTS.cloud && !isTimeout) {
      try {
        const cloudUrl = `${API_ENDPOINTS.cloud}${cleanPath}`;
        const cloudRes = await fetch(cloudUrl, {
          method,
          headers: reqHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          return {
            ok: true,
            status: cloudRes.status,
            code: cloudData?.code || 'OK',
            message: cloudData?.message || 'Thành công (Cloud)',
            data: cloudData?.data ?? cloudData,
          };
        }
      } catch (fallbackErr) {
        // Bỏ qua lỗi fallback
      }
    }

    return {
      ok: false,
      status: 0,
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? 'Kết nối máy chủ quá hạn (timeout). Vui lòng thử lại.'
        : `Lỗi kết nối máy chủ (${baseUrl}): ${err?.message || 'Không thể kết nối.'}`,
      data: null,
      errors: [],
    };
  }
}

// -------------------------------------------------------------
// CÁC HÀM TƯƠNG TÁC NGHIỆP VỤ VỚI BACKEND HRMSS
// -------------------------------------------------------------

export const hrmssApi = {
  // 1. Kiểm tra kết nối máy chủ
  async ping(targetPort = null) {
    return apiRequest('/', { targetPort });
  },

  // 2. Đăng nhập tài khoản (hỗ trợ chỉ định port 5173 hoặc 5174 nếu cần)
  async login({ identifier, password }, targetPort = null) {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier, password },
      targetPort,
    });

    if (res.ok && res.data?.access_token) {
      authTokens.set(res.data.access_token);
    }
    return res;
  },

  // 3. Đăng ký tài khoản
  async register({ username, email, password, confirm_password, full_name, address, phone }, targetPort = null) {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: {
        username,
        email,
        password,
        confirm_password: confirm_password || password,
        full_name,
        address: address || 'Chưa cập nhật',
        phone,
      },
      targetPort,
    });
  },

  // 4. Lấy thông tin tài khoản và profile hiện tại qua JWT
  async getMe(targetPort = null) {
    return apiRequest('/auth/me', { targetPort });
  },

  // 5. Lấy hồ sơ user hiện tại
  async getUserProfile(targetPort = null) {
    return apiRequest('/users/me', { targetPort });
  },

  // 6. Cập nhật hồ sơ user
  async updateProfile(profileData, targetPort = null) {
    return apiRequest('/users/me', {
      method: 'PATCH',
      body: { profile: profileData },
      targetPort,
    });
  },

  // 7. Lấy danh mục dịch vụ thực tế từ backend
  async getServices(targetPort = null) {
    const res = await apiRequest('/services', { targetPort });
    if (res.ok && res.data?.items) {
      return { ok: true, items: res.data.items };
    }
    return res;
  },

  // 8. Lấy chi tiết dịch vụ theo ID
  async getServiceDetail(id, targetPort = null) {
    return apiRequest(`/services/${id}`, { targetPort });
  },

  // 9. Đăng xuất
  logout() {
    authTokens.clear();
  },
};

export default hrmssApi;
