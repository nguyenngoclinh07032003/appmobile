// Service kết nối API trực tiếp với Backend HRMSS
// Hỗ trợ kết nối đa cổng: 5173, 5174 và Cloud https://server.hrmss.cyou/api/v1
import { API_BASE_URL, API_ENDPOINTS, APP_CONFIG, API_URL_OVERRIDDEN } from '../constants/config';

// Quản lý Token trong sessionStorage (cô lập theo từng tab & tự động xoá khi đóng trình duyệt, chống rò rỉ localStorage)
const getStoredToken = () => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(APP_CONFIG.tokenStorageKey);
    }
  } catch (e) {
    // Bỏ qua lỗi storage
  }
  return null;
};

const setStoredToken = (token) => {
  try {
    if (typeof localStorage !== 'undefined') {
      // Dọn sạch token cũ nếu từng lưu trong localStorage
      localStorage.removeItem(APP_CONFIG.tokenStorageKey);
      localStorage.removeItem(APP_CONFIG.refreshTokenStorageKey);
    }
    if (typeof sessionStorage !== 'undefined') {
      if (token) {
        sessionStorage.setItem(APP_CONFIG.tokenStorageKey, token);
      } else {
        sessionStorage.removeItem(APP_CONFIG.tokenStorageKey);
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

    // Nếu gọi local (5173 hoặc 5174) bị lỗi kết nối, tự động thử fallback sang Cloud Server.
    // Khi đã chỉ định EXPO_PUBLIC_API_URL (backend test) thì không chuyển, để không ghi nhầm vào server thật.
    if (baseUrl !== API_ENDPOINTS.cloud && !isTimeout && !API_URL_OVERRIDDEN) {
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
        ...(address ? { address } : {}),
        ...(phone ? { phone } : {}),
      },
      targetPort,
    });
  },

  // 3b. Xác thực địa chỉ Email bằng mã OTP 6 chữ số (bắt buộc trước khi đặt dịch vụ)
  async getEmailVerificationStatus(targetPort = null) {
    return apiRequest('/auth/email-verification/status', { targetPort });
  },

  async sendEmailVerificationOtp(targetPort = null) {
    return apiRequest('/auth/email-verification/send', {
      method: 'POST',
      targetPort,
    });
  },

  async verifyEmailOtp(otp, targetPort = null) {
    return apiRequest('/auth/email-verification/verify', {
      method: 'POST',
      body: { otp: String(otp || '').trim() },
      targetPort,
    });
  },

  // 3c. Mật khẩu: đổi khi đã đăng nhập; quên mật khẩu = gửi mã OTP qua email rồi đặt lại bằng mã đó.
  async changePassword({ currentPassword, newPassword }, targetPort = null) {
    return apiRequest('/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword, confirm_password: newPassword },
      targetPort,
    });
  },
  async forgotPassword(identifier, targetPort = null) {
    return apiRequest('/auth/forgot-password', { method: 'POST', body: { identifier }, targetPort });
  },
  async resetPassword({ identifier, otp, newPassword }, targetPort = null) {
    return apiRequest('/auth/reset-password', {
      method: 'POST',
      body: { identifier, otp: String(otp || '').trim(), new_password: newPassword, confirm_password: newPassword },
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
    return apiRequest('/auth/me/profile', {
      method: 'PATCH',
      body: { profile: profileData },
      targetPort,
    });
  },

  // 7. Danh mục + dịch vụ đang mở (công khai, chỉ mục đang bật)
  async getServiceCategories(targetPort = null) {
    return apiRequest('/service-categories', { targetPort });
  },
  async getServices(targetPort = null) {
    const res = await apiRequest('/customer/services', { targetPort });
    if (res.ok && res.data?.items) {
      return { ok: true, items: res.data.items };
    }
    return res;
  },

  // 8. Chi tiết dịch vụ công khai (mô tả, số lượt đặt) và các bước thực hiện chuẩn của dịch vụ
  async getServiceDetail(id, targetPort = null) {
    return apiRequest(`/customer/services/${encodeURIComponent(id)}`, { targetPort });
  },
  async getServiceProcedure(id, targetPort = null) {
    return apiRequest(`/customer/services/${encodeURIComponent(id)}/procedure`, { targetPort });
  },

  // 9. Nghiệp vụ Khách hàng (Customer Requests & Addresses)
  async getCustomerAddresses(targetPort = null) {
    return apiRequest('/customer/addresses', { targetPort });
  },
  async createCustomerAddress(payload, targetPort = null) {
    return apiRequest('/customer/addresses', { method: 'POST', body: payload, targetPort });
  },
  async getCustomerRequests(status = 'ALL', targetPort = null) {
    return apiRequest(`/customer/requests?status=${encodeURIComponent(status)}&limit=50`, { targetPort });
  },
  async getCustomerRequestDetail(id, targetPort = null) {
    return apiRequest(`/customer/requests/${id}`, { targetPort });
  },
  async createCustomerRequest(payload, targetPort = null) {
    return apiRequest('/customer/requests', { method: 'POST', body: payload, targetPort });
  },
  async cancelCustomerRequest(id, reason, targetPort = null) {
    return apiRequest(`/customer/requests/${id}/cancel`, {
      method: 'PATCH',
      body: { reason: reason || 'Khách hàng hủy đơn qua ứng dụng' },
      targetPort,
    });
  },
  async decideQuotation(id, { decision, rejection_reason }, targetPort = null) {
    return apiRequest(`/customer/requests/${id}/quotation-decision`, {
      method: 'POST',
      body: {
        decision: decision === 'APPROVED' || decision === true || decision === 'approve' ? 'APPROVED' : 'REJECTED',
        ...(rejection_reason ? { rejection_reason } : {}),
      },
      targetPort,
    });
  },
  async reviewCustomerRequest(id, { rating, review_text, punctuality_rating, attitude_rating, expertise_rating }, targetPort = null) {
    return apiRequest(`/customer/requests/${id}/review`, {
      method: 'POST',
      body: {
        rating: Number(rating) || 5,
        review_text: review_text || null,
        punctuality_rating: Number(punctuality_rating || rating) || 5,
        attitude_rating: Number(attitude_rating || rating) || 5,
        expertise_rating: Number(expertise_rating || rating) || 5,
      },
      targetPort,
    });
  },

  // 10. Nghiệp vụ Kỹ thuật viên (Technician Jobs & Field Operations)
  async getTechnicianJobs(status = 'ALL', targetPort = null) {
    return apiRequest(`/technician/jobs?status=${encodeURIComponent(status)}&limit=50`, { targetPort });
  },
  async getTechnicianOpenRequests(targetPort = null) {
    return apiRequest('/technician/jobs/open-requests', { targetPort });
  },
  async acceptTechnicianOpenRequest(requestId, targetPort = null) {
    return apiRequest(`/technician/jobs/open-requests/${requestId}/accept`, {
      method: 'POST',
      targetPort,
    });
  },
  async getTechnicianJobDetail(id, targetPort = null) {
    return apiRequest(`/technician/jobs/${id}`, { targetPort });
  },
  async getTechnicianMaterials(targetPort = null) {
    return apiRequest('/technician/jobs/materials', { targetPort });
  },
  async updateTechnicianLocation({ latitude, longitude, location_accuracy = 10, location_sharing_enabled = true }, targetPort = null) {
    return apiRequest('/technician/jobs/location', {
      method: 'PUT',
      body: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        location_accuracy: Number(location_accuracy),
        location_sharing_enabled: Boolean(location_sharing_enabled),
      },
      targetPort,
    });
  },
  async startTechnicianJob(id, targetPort = null) {
    return apiRequest(`/technician/jobs/${id}/start`, { method: 'PATCH', targetPort });
  },
  async submitDiagnosis(id, payload, targetPort = null) {
    return apiRequest(`/technician/jobs/${id}/diagnosis`, {
      method: 'POST',
      body: {
        symptoms: payload.symptoms || null,
        findings: payload.findings || 'Đã kiểm tra thiết bị tại hiện trường',
        repair_recommendation: payload.repair_recommendation || null,
        needs_quotation: Boolean(payload.needs_quotation),
      },
      targetPort,
    });
  },
  async submitQuotation(id, payload, targetPort = null) {
    return apiRequest(`/technician/jobs/${id}/quotation`, {
      method: 'POST',
      body: {
        quotation_type: payload.quotation_type || 'INITIAL',
        items: payload.items || [],
      },
      targetPort,
    });
  },
  async recordMaterialUsage(id, { material_id, used_quantity = 1, notes = null }, targetPort = null) {
    return apiRequest(`/technician/jobs/${id}/materials`, {
      method: 'POST',
      body: {
        material_id: String(material_id),
        used_quantity: Number(used_quantity) || 1,
        notes,
      },
      targetPort,
    });
  },
  async completeTechnicianJob(id, payload, targetPort = null) {
    return apiRequest(`/technician/jobs/${id}/complete`, {
      method: 'PATCH',
      body: {
        work_performed: payload.work_performed || 'Đã hoàn thành sửa chữa & bảo dưỡng thiết bị',
        testing_result: payload.testing_result || 'Thiết bị vận hành ổn định sau sửa chữa',
        handover_result: payload.handover_result || 'Đã bàn giao cho khách hàng và kích hoạt bảo hành điện tử',
      },
      targetPort,
    });
  },

  // 11. Dữ liệu công khai thay cho dữ liệu mẫu trong app (không cần đăng nhập)
  // Chính sách hệ thống: phí kiểm tra, mức trễ, quy tắc điểm, hạng thành viên.
  async getPublicConfig(targetPort = null) {
    return apiRequest('/config/public', { targetPort });
  },
  // Bảng giá vật tư niêm yết.
  async getPublicMaterials(targetPort = null) {
    return apiRequest('/customer/materials', { targetPort });
  },
  // Điểm trung bình + nhận xét của khách cho một dịch vụ (tên khách đã che).
  async getServiceReviews(serviceDbId, { page = 1, limit = 10 } = {}, targetPort = null) {
    return apiRequest(`/customer/services/${encodeURIComponent(serviceDbId)}/reviews?page=${page}&limit=${limit}`, { targetPort });
  },

  // 12. Thông báo (khách & thợ)
  async getNotifications({ limit = 50 } = {}, targetPort = null) {
    return apiRequest(`/notifications?limit=${limit}`, { targetPort });
  },
  async markNotificationRead(id, targetPort = null) {
    return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', targetPort });
  },
  async markAllNotificationsRead(targetPort = null) {
    return apiRequest('/notifications/read-all', { method: 'PATCH', targetPort });
  },

  // 13. Điểm thưởng & voucher (khách)
  async getLoyalty({ limit = 50 } = {}, targetPort = null) {
    return apiRequest(`/customer/loyalty?limit=${limit}`, { targetPort });
  },
  async getVoucherWallet(status = 'AVAILABLE', targetPort = null) {
    return apiRequest(`/customer/vouchers?status=${encodeURIComponent(status)}`, { targetPort });
  },
  async getVoucherCatalog(targetPort = null) {
    return apiRequest('/customer/vouchers/catalog', { targetPort });
  },
  async redeemVoucher(voucherId, targetPort = null) {
    return apiRequest('/customer/vouchers/redeem', { method: 'POST', body: { voucher_id: String(voucherId) }, targetPort });
  },

  // 14. Theo dõi thợ của đơn (khách): tên, SĐT, điểm đánh giá của thợ được giao.
  async getRequestTracking(id, targetPort = null) {
    return apiRequest(`/customer/requests/${encodeURIComponent(id)}/tracking`, { targetPort });
  },

  // 15. Hồ sơ & đánh giá của thợ
  async getTechnicianProfile(targetPort = null) {
    return apiRequest('/technician/profile', { targetPort });
  },
  async updateTechnicianWorkArea(workArea, targetPort = null) {
    return apiRequest('/technician/profile', { method: 'PATCH', body: { work_area: workArea }, targetPort });
  },
  async getTechnicianReviews({ limit = 20 } = {}, targetPort = null) {
    return apiRequest(`/technician/jobs/reviews?limit=${limit}`, { targetPort });
  },

  // 15b. Thanh toán VietQR: mã thật do backend tạo (đúng số tiền, nội dung HRMSS<số>, đúng tài khoản nhận).
  async createVietQr(requestId, targetPort = null) {
    return apiRequest(`/customer/requests/${encodeURIComponent(requestId)}/payments/vietqr`, { method: 'POST', targetPort });
  },
  // Hóa đơn + tình trạng thanh toán: payment_status = UNPAID | PENDING | PARTIALLY_PAID | PAID | NOTHING_TO_PAY.
  async getBill(requestId, targetPort = null) {
    return apiRequest(`/customer/requests/${encodeURIComponent(requestId)}/bill`, { targetPort });
  },

  // 16. Đăng xuất
  logout() {
    authTokens.clear();
  },
};

export default hrmssApi;
