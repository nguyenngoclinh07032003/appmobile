// Service kết nối API trực tiếp với Backend HRMSS (địa chỉ server: constants/config.js -> API_BASE_URL)
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, APP_CONFIG } from '../constants/config';

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

// Refresh token của phiên mobile (POST /auth/mobile/login trả trong body, sống 7 ngày, đổi mới mỗi lần refresh).
// - Bản native (iOS/Android): lưu bằng expo-secure-store (Keychain / Keystore) -> mở lại app vẫn còn phiên.
// - Bản web (Expo web): sessionStorage, MỖI TAB MỘT PHIÊN như session (authService). Trước đây để chung ở localStorage nên
//   2 tab đăng nhập 2 tài khoản (Khách / Thợ) dùng nhầm refresh token của nhau. Tải lại trang trong cùng tab vẫn giữ phiên.
const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';
const webRefreshStore = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
const readRefresh = () => {
  if (IS_NATIVE) return null; // native đọc bất đồng bộ qua authTokens.restore()
  try {
    // Dọn bản cũ để chung trong localStorage.
    if (typeof localStorage !== 'undefined') localStorage.removeItem(APP_CONFIG.refreshTokenStorageKey);
    return webRefreshStore()?.getItem(APP_CONFIG.refreshTokenStorageKey) || null;
  } catch (e) { return null; }
};
const writeRefresh = (token) => {
  if (IS_NATIVE) {
    (token
      ? SecureStore.setItemAsync(APP_CONFIG.refreshTokenStorageKey, token)
      : SecureStore.deleteItemAsync(APP_CONFIG.refreshTokenStorageKey)).catch(() => {});
    return;
  }
  try {
    const store = webRefreshStore();
    if (!store) return;
    if (token) store.setItem(APP_CONFIG.refreshTokenStorageKey, token);
    else store.removeItem(APP_CONFIG.refreshTokenStorageKey);
  } catch (e) { /* bỏ qua lỗi storage */ }
};
let currentRefresh = readRefresh();
// Phiên hết hạn / bị thu hồi (refresh thất bại): app đăng ký hàm này để đưa người dùng về màn đăng nhập.
let onSessionExpired = null;

export const authTokens = {
  get: () => currentToken || getStoredToken(),
  set: (token) => {
    currentToken = token;
    setStoredToken(token);
  },
  getRefresh: () => currentRefresh || readRefresh(),
  setRefresh: (token) => {
    currentRefresh = token || null;
    writeRefresh(token || null);
  },
  clear: () => {
    currentToken = null;
    setStoredToken(null);
    currentRefresh = null;
    writeRefresh(null);
  },
  // Đăng ký hàm chạy khi phiên hết hạn (refresh token hết hạn / bị thu hồi).
  onExpired: (fn) => { onSessionExpired = typeof fn === 'function' ? fn : null; },
  // Native: nạp refresh token đã lưu trong SecureStore vào bộ nhớ (gọi 1 lần khi mở app). Trả true nếu có.
  restore: async () => {
    if (!IS_NATIVE) return Boolean(authTokens.getRefresh());
    try {
      const saved = await SecureStore.getItemAsync(APP_CONFIG.refreshTokenStorageKey);
      if (saved) currentRefresh = saved;
      return Boolean(saved);
    } catch (e) { return false; }
  },
};

// Gặp 401: đổi cặp token MỘT lần (nhiều request cùng lúc dùng chung 1 lần refresh) rồi gửi lại request cũ.
// - Server từ chối refresh token (400/401): xóa token + báo phiên hết hạn (app về màn đăng nhập).
// - Lỗi mạng / timeout / lỗi máy chủ 5xx: KHÔNG xóa phiên (refresh token vẫn còn hạn), trả lỗi rõ ràng để nơi gọi báo
//   "mất kết nối" thay vì đăng xuất người dùng.
// Trả { ok, status, code, message, data } (data = { access_token, refresh_token, account } khi thành công).
let refreshing = null;
async function refreshSession() {
  const refreshToken = authTokens.getRefresh();
  if (!refreshToken) return { ok: false, status: null, code: 'NO_REFRESH_TOKEN', message: 'Chưa đăng nhập.', data: null };
  if (!refreshing) {
    refreshing = rawRequest('/auth/mobile/refresh', { method: 'POST', body: { refresh_token: refreshToken }, noAuth: true })
      .then((res) => {
        if (res.ok && res.data?.access_token) {
          authTokens.set(res.data.access_token);
          authTokens.setRefresh(res.data.refresh_token);
          return res;
        }
        if (res.status === 401 || res.status === 400) {
          authTokens.clear();
          try { onSessionExpired?.(); } catch (e) { /* bỏ qua */ }
          return { ...res, ok: false, code: res.code && res.code !== 'ERROR' ? res.code : 'SESSION_EXPIRED' };
        }
        // Lỗi mạng / máy chủ: giữ nguyên phiên.
        return { ...res, ok: false };
      })
      .catch((e) => ({ ok: false, status: 0, code: 'NETWORK_ERROR', message: e?.message || 'Không thể kết nối.', data: null }))
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

/** Bảo đảm có access token (native mở lại app chỉ còn refresh token trong SecureStore). Trả true nếu dùng được API. */
export async function ensureAccessToken() {
  if (authTokens.get()) return true;
  if (!authTokens.getRefresh()) return false;
  const r = await refreshSession();
  return Boolean(r?.ok);
}

/**
 * Hàm gọi API tổng quát: tự gắn Bearer, hết hạn access token (401) thì tự làm mới phiên rồi gửi lại 1 lần.
 * Làm mới phiên lỗi mạng -> trả lỗi mạng đó (rõ nguyên nhân) thay vì 401.
 */
export async function apiRequest(endpoint, options = {}) {
  const res = await rawRequest(endpoint, options);
  const isAuthCall = String(endpoint).startsWith('/auth/login') || String(endpoint).startsWith('/auth/mobile/');
  if (res.status === 401 && !isAuthCall && authTokens.getRefresh()) {
    const refreshed = await refreshSession();
    if (refreshed.ok) return rawRequest(endpoint, options);
    if (refreshed.status === 0) return refreshed;
  }
  return res;
}

/**
 * Gọi HTTP một lần (không tự refresh). Tự động gắn header Authorization và timeout.
 */
async function rawRequest(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = APP_CONFIG.timeoutMs,
    noAuth = false, // true: không gắn Bearer (vd. gọi refresh)
    formData = null, // multipart (tải ảnh): gửi nguyên FormData, không đặt Content-Type
  } = options;

  const baseUrl = API_BASE_URL;

  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanPath}`;

  const token = noAuth ? null : authTokens.get();
  const reqHeaders = {
    ...(formData ? {} : { 'Content-Type': 'application/json' }),
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
      body: formData || (body ? JSON.stringify(body) : undefined),
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

    // Không tự gửi lại sang server khác khi lỗi mạng: tránh gửi Authorization ra host khác và ghi trùng (POST 2 lần).

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

// Tải 1 ảnh lên POST /uploads (multipart). uri: data:/blob: (bản web) hoặc file:// (bản native).
// Không reject: lỗi đọc ảnh trả về dạng phản hồi lỗi như các API khác.
async function uploadFile(uri, fileName, fields = {}) {
  try {
    const form = new FormData();
    if (/^(data|blob):/.test(String(uri))) {
      const blob = await (await fetch(uri)).blob();
      form.append('file', blob, fileName);
    } else {
      form.append('file', { uri, name: fileName, type: 'image/jpeg' });
    }
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    return await apiRequest('/uploads', { method: 'POST', formData: form, timeout: 30000 });
  } catch (e) {
    return { ok: false, status: 0, code: 'INVALID_PHOTO', message: `Không đọc được ảnh: ${e?.message || 'lỗi không xác định'}`, data: null, errors: [] };
  }
}

export const hrmssApi = {
  // 1. Kiểm tra kết nối máy chủ
  async ping() {
    return apiRequest('/');
  },

  // 2. Đăng nhập phiên mobile: access token (15 phút) + refresh token (7 ngày) trong body.
  // (/auth/login là của web: refresh token nằm trong cookie, app không dùng được -> bị đăng xuất sau 15 phút.)
  async login({ identifier, password }) {
    const res = await apiRequest('/auth/mobile/login', {
      method: 'POST',
      body: { identifier, password },
      noAuth: true,
    });

    if (res.ok && res.data?.access_token) {
      authTokens.set(res.data.access_token);
      authTokens.setRefresh(res.data.refresh_token);
    }
    return res;
  },

  // 2b. Mở lại app (native: đóng hẳn app rồi mở): dùng refresh token đã lưu để lấy phiên mới.
  // Trả { ok, data: { access_token, refresh_token, account } } hoặc { ok:false, status } nếu không còn phiên
  // (status null: không có refresh token; 0: lỗi mạng -> phiên vẫn giữ; 400/401: phiên hết hạn, đã xoá token).
  // Dùng chung lần refresh đang chạy (refresh token đổi mới mỗi lần, 2 lần refresh song song sẽ làm hỏng phiên).
  async resumeSession() {
    if (!(await authTokens.restore())) return { ok: false, status: null };
    const res = await refreshSession();
    if (res.ok) return res;
    return { ok: false, status: res.status ?? null, code: res.code, message: res.message };
  },

  // 3. Đăng ký tài khoản
  async register({ username, email, password, confirm_password, full_name, address, phone }) {
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
    });
  },

  // 3b. Xác thực địa chỉ Email bằng mã OTP 6 chữ số (bắt buộc trước khi đặt dịch vụ)
  async getEmailVerificationStatus() {
    return apiRequest('/auth/email-verification/status');
  },

  async sendEmailVerificationOtp() {
    return apiRequest('/auth/email-verification/send', {
      method: 'POST',
    });
  },

  async verifyEmailOtp(otp) {
    return apiRequest('/auth/email-verification/verify', {
      method: 'POST',
      body: { otp: String(otp || '').trim() },
    });
  },

  // 3c. Mật khẩu: đổi khi đã đăng nhập; quên mật khẩu = gửi mã OTP qua email rồi đặt lại bằng mã đó.
  async changePassword({ currentPassword, newPassword }) {
    return apiRequest('/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword, confirm_password: newPassword },
    });
  },
  async forgotPassword(identifier) {
    return apiRequest('/auth/forgot-password', { method: 'POST', body: { identifier } });
  },
  async resetPassword({ identifier, otp, newPassword }) {
    return apiRequest('/auth/reset-password', {
      method: 'POST',
      body: { identifier, otp: String(otp || '').trim(), new_password: newPassword, confirm_password: newPassword },
    });
  },

  // 4. Lấy thông tin tài khoản và profile hiện tại qua JWT
  async getMe() {
    return apiRequest('/auth/me');
  },

  // 5. Lấy hồ sơ user hiện tại
  async getUserProfile() {
    return apiRequest('/users/me');
  },

  // 6. Cập nhật hồ sơ user
  // Ngày sinh / SĐT / địa chỉ của chính mình: PATCH /users/me { profile: { dateOfBirth: 'YYYY-MM-DD' } }.
  async updateMyInfo(profile) {
    return apiRequest('/users/me', { method: 'PATCH', body: { profile } });
  },
  async updateProfile(profileData) {
    // Backend nhận trực tiếp { full_name, phone } (schema strict, không bọc trong "profile").
    return apiRequest('/auth/me/profile', {
      method: 'PATCH',
      body: profileData,
    });
  },

  // 7. Danh mục + dịch vụ đang mở (công khai, chỉ mục đang bật)
  async getServiceCategories() {
    return apiRequest('/service-categories');
  },
  async getServices() {
    const res = await apiRequest('/customer/services');
    if (res.ok && res.data?.items) {
      return { ok: true, items: res.data.items };
    }
    return res;
  },

  // 8. Chi tiết dịch vụ công khai (mô tả, số lượt đặt) và các bước thực hiện chuẩn của dịch vụ
  async getServiceDetail(id) {
    return apiRequest(`/customer/services/${encodeURIComponent(id)}`);
  },
  async getServiceProcedure(id) {
    return apiRequest(`/customer/services/${encodeURIComponent(id)}/procedure`);
  },

  // 9. Nghiệp vụ Khách hàng (Customer Requests & Addresses)
  async getCustomerAddresses() {
    return apiRequest('/customer/addresses');
  },
  // Sửa / xóa địa chỉ (đổi phường thì gửi cả ward_code + address_text).
  async updateCustomerAddress(id, payload) {
    return apiRequest(`/customer/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
  },
  async deleteCustomerAddress(id) {
    return apiRequest(`/customer/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  // 126 phường/xã Hà Nội sau sáp nhập (công khai). q: tìm không dấu.
  async getHanoiWards(q = '') {
    return apiRequest(`/locations/hanoi/wards${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  },
  async createCustomerAddress(payload) {
    return apiRequest('/customer/addresses', { method: 'POST', body: payload });
  },
  async getCustomerRequests(status = 'ALL') {
    return apiRequest(`/customer/requests?status=${encodeURIComponent(status)}&limit=50`);
  },
  async getCustomerRequestDetail(id) {
    return apiRequest(`/customer/requests/${id}`);
  },
  async createCustomerRequest(payload) {
    return apiRequest('/customer/requests', { method: 'POST', body: payload });
  },
  async cancelCustomerRequest(id, reason) {
    return apiRequest(`/customer/requests/${id}/cancel`, {
      method: 'PATCH',
      body: { reason: reason || 'Khách hàng hủy đơn qua ứng dụng' },
    });
  },
  async decideQuotation(id, { decision, rejection_reason }) {
    return apiRequest(`/customer/requests/${id}/quotation-decision`, {
      method: 'POST',
      body: {
        decision: ['APPROVED', 'REVISE'].includes(decision) || decision === true || decision === 'approve'
          ? (decision === 'REVISE' ? 'REVISE' : 'APPROVED')
          : 'REJECTED',
        ...(rejection_reason ? { rejection_reason } : {}),
      },
    });
  },
  // Khách sửa đơn còn chờ (giờ hẹn, mô tả, nhà, cách trả tiền): PATCH /customer/requests/:id.
  async updateCustomerRequest(id, payload) {
    return apiRequest(`/customer/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
  },
  // Chọn cách trả tiền: method = 'CASH' | 'BANK_TRANSFER'.
  async setPaymentMethod(id, method) {
    return apiRequest(`/customer/requests/${encodeURIComponent(id)}/payment-method`, { method: 'PATCH', body: { method } });
  },
  // Khách xác nhận đã trả tiền mặt (chuyển khoản do SePay tự xác nhận).
  async confirmCashPayment(id) {
    return apiRequest(`/customer/requests/${encodeURIComponent(id)}/payments/confirm`, { method: 'POST', body: { method: 'CASH' } });
  },
  // Xóa tài khoản của chính mình (cần mật khẩu).
  async deleteMyAccount(password) {
    return apiRequest('/auth/me', { method: 'DELETE', body: { password } });
  },
  // Yêu cầu bảo hành cho đơn đã xong: tạo đơn bảo hành WARRANTY_PENDING (văn phòng thẩm định).
  async requestWarranty(id, note = null) {
    return apiRequest(`/customer/requests/${encodeURIComponent(id)}/warranty`, { method: 'POST', body: note ? { note } : {} });
  },
  async reviewCustomerRequest(id, { rating, review_text, punctuality_rating, attitude_rating, expertise_rating }) {
    return apiRequest(`/customer/requests/${id}/review`, {
      method: 'POST',
      body: {
        rating: Number(rating) || 5,
        review_text: review_text || null,
        punctuality_rating: Number(punctuality_rating || rating) || 5,
        attitude_rating: Number(attitude_rating || rating) || 5,
        expertise_rating: Number(expertise_rating || rating) || 5,
      },
    });
  },

  // 10. Nghiệp vụ Kỹ thuật viên (Technician Jobs & Field Operations)
  async getTechnicianJobs(status = 'ALL') {
    return apiRequest(`/technician/jobs?status=${encodeURIComponent(status)}&limit=50`);
  },
  async getTechnicianOpenRequests() {
    return apiRequest('/technician/jobs/open-requests');
  },
  async acceptTechnicianOpenRequest(requestId) {
    return apiRequest(`/technician/jobs/open-requests/${requestId}/accept`, {
      method: 'POST',
    });
  },
  // Bỏ qua việc ở chợ việc (không phạt): POST /technician/jobs/open-requests/:request_id/decline.
  async declineTechnicianOpenRequest(requestId, reason = null) {
    return apiRequest(`/technician/jobs/open-requests/${encodeURIComponent(requestId)}/decline`, { method: 'POST', body: reason ? { reason } : {} });
  },
  async remindQuotation(jobId) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/remind-quote`, { method: 'POST' });
  },
  // Tiến độ / ghi chú sửa chữa: cần progress_percent hoặc note.
  async addJobProgress(jobId, { progress_percent, note }) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/progress`, {
      method: 'POST',
      body: { ...(progress_percent != null ? { progress_percent } : {}), ...(note ? { note } : {}) },
    });
  },
  async updateMaterialUsage(jobId, usageId, usedQuantity) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/materials/${encodeURIComponent(usageId)}`, { method: 'PATCH', body: { used_quantity: usedQuantity } });
  },
  async deleteMaterialUsage(jobId, usageId) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/materials/${encodeURIComponent(usageId)}`, { method: 'DELETE' });
  },
  async markOutOfWarranty(jobId, reason) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/out-of-warranty`, { method: 'POST', body: { reason } });
  },
  async requestJobFollowUp(jobId, reason, remainingWork = null) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/follow-up`, {
      method: 'POST', body: { reason, ...(remainingWork ? { remaining_work: remainingWork } : {}) },
    });
  },
  // Thợ xác nhận đã nhận tiền mặt của khách (khách bấm 'đã trả' chỉ tạo khoản chờ xác nhận).
  async confirmCashReceived(jobId) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/payments/confirm-cash`, { method: 'POST' });
  },
  // Hóa đơn của việc (số tiền mặt cần thu).
  async getTechnicianJobBill(jobId) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/bill`);
  },
  // Ảnh của việc (thợ) / của đơn (khách): GET /uploads?job_id= | ?request_id=.
  async listJobPhotos(jobId) {
    return apiRequest(`/uploads?job_id=${encodeURIComponent(jobId)}`);
  },
  // Khách gắn ảnh vào đơn của mình (POST /uploads: file + request_id).
  async uploadRequestPhoto(requestId, uri) {
    return uploadFile(uri, 'anh-don.jpg', { request_id: String(requestId) });
  },
  async listRequestPhotos(requestId) {
    return apiRequest(`/uploads?request_id=${encodeURIComponent(requestId)}`);
  },
  async updatePhotoNote(attachmentId, description) {
    return apiRequest(`/uploads/${encodeURIComponent(attachmentId)}`, { method: 'PATCH', body: { description: description || null } });
  },
  async deletePhoto(attachmentId) {
    return apiRequest(`/uploads/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' });
  },
  // Gắn ảnh biên lai (đã tải qua POST /uploads) vào dòng linh kiện mua ngoài của báo giá.
  async attachPartReceipt(jobId, itemId, attachmentId) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/quotation-items/${encodeURIComponent(itemId)}/receipt`, {
      method: 'PATCH', body: { attachment_id: String(attachmentId) },
    });
  },
  async getTechnicianJobDetail(id) {
    return apiRequest(`/technician/jobs/${id}`);
  },
  async getTechnicianMaterials() {
    return apiRequest('/technician/jobs/materials');
  },
  async updateTechnicianLocation({ latitude, longitude, location_accuracy = 10, location_sharing_enabled = true }) {
    return apiRequest('/technician/jobs/location', {
      method: 'PUT',
      body: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        location_accuracy: Number(location_accuracy),
        location_sharing_enabled: Boolean(location_sharing_enabled),
      },
    });
  },
  // Hành trình của thợ: xuất phát và check-in (backend tính trễ, kiểm tra bán kính GPS, phát voucher bồi thường).
  async travelTechnicianJob(id) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(id)}/travel`, { method: 'PATCH' });
  },
  async arriveTechnicianJob(id, { latitude, longitude, location_accuracy }) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(id)}/arrive`, {
      method: 'PATCH',
      body: { latitude: Number(latitude), longitude: Number(longitude), ...(location_accuracy != null ? { location_accuracy: Number(location_accuracy) } : {}) },
    });
  },
  async releaseTechnicianJob(id, reason) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(id)}/release`, { method: 'POST', body: { reason } });
  },
  async startTechnicianJob(id) {
    return apiRequest(`/technician/jobs/${id}/start`, { method: 'PATCH' });
  },
  async submitDiagnosis(id, payload) {
    return apiRequest(`/technician/jobs/${id}/diagnosis`, {
      method: 'POST',
      body: {
        symptoms: payload.symptoms || null,
        findings: payload.findings || 'Đã kiểm tra thiết bị tại hiện trường',
        repair_recommendation: payload.repair_recommendation || null,
        needs_quotation: Boolean(payload.needs_quotation),
      },
    });
  },
  async submitQuotation(id, payload) {
    return apiRequest(`/technician/jobs/${id}/quotation`, {
      method: 'POST',
      body: {
        quotation_type: payload.quotation_type || 'INITIAL',
        items: payload.items || [],
      },
    });
  },
  async recordMaterialUsage(id, { material_id, used_quantity = 1, notes = null }) {
    return apiRequest(`/technician/jobs/${id}/materials`, {
      method: 'POST',
      body: {
        material_id: String(material_id),
        used_quantity: Number(used_quantity) || 1,
        notes,
      },
    });
  },
  async completeTechnicianJob(id, payload) {
    return apiRequest(`/technician/jobs/${id}/complete`, {
      method: 'PATCH',
      body: {
        work_performed: payload.work_performed || 'Đã hoàn thành sửa chữa & bảo dưỡng thiết bị',
        testing_result: payload.testing_result || 'Thiết bị vận hành ổn định sau sửa chữa',
        handover_result: payload.handover_result || 'Đã bàn giao cho khách hàng và kích hoạt bảo hành điện tử',
        // Thợ đã thu đủ tiền mặt lúc bàn giao (khách chọn VietQR thì backend từ chối 409 CUSTOMER_PAYS_BY_QR).
        ...(payload.cash_collected ? { cash_collected: true } : {}),
      },
    });
  },

  // 11. Dữ liệu công khai thay cho dữ liệu mẫu trong app (không cần đăng nhập)
  // Chính sách hệ thống: phí kiểm tra, mức trễ, quy tắc điểm, hạng thành viên.
  async getPublicConfig() {
    return apiRequest('/config/public');
  },
  // Bảng giá vật tư niêm yết.
  async getPublicMaterials() {
    return apiRequest('/customer/materials');
  },
  // Điểm trung bình + nhận xét của khách cho một dịch vụ (tên khách đã che).
  async getServiceReviews(serviceDbId, { page = 1, limit = 10 } = {}) {
    return apiRequest(`/customer/services/${encodeURIComponent(serviceDbId)}/reviews?page=${page}&limit=${limit}`);
  },

  // 12. Thông báo (khách & thợ)
  async getNotifications({ limit = 50 } = {}) {
    return apiRequest(`/notifications?limit=${limit}`);
  },
  async markNotificationRead(id) {
    return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
  },
  async markAllNotificationsRead() {
    return apiRequest('/notifications/read-all', { method: 'PATCH' });
  },

  // 13. Điểm thưởng & voucher (khách)
  async getLoyalty({ limit = 50 } = {}) {
    return apiRequest(`/customer/loyalty?limit=${limit}`);
  },
  async getVoucherWallet(status = 'AVAILABLE') {
    return apiRequest(`/customer/vouchers?status=${encodeURIComponent(status)}`);
  },
  async getVoucherCatalog() {
    return apiRequest('/customer/vouchers/catalog');
  },
  async redeemVoucher(voucherId) {
    return apiRequest('/customer/vouchers/redeem', { method: 'POST', body: { voucher_id: String(voucherId) } });
  },

  // 14. Theo dõi thợ của đơn (khách): tên, SĐT, điểm đánh giá của thợ được giao.
  async getRequestTracking(id) {
    return apiRequest(`/customer/requests/${encodeURIComponent(id)}/tracking`);
  },

  // 15. Hồ sơ & đánh giá của thợ
  async getTechnicianProfile() {
    return apiRequest('/technician/profile');
  },
  async updateTechnicianWorkArea(workArea) {
    return apiRequest('/technician/profile', { method: 'PATCH', body: { work_area: workArea } });
  },
  async getTechnicianReviews({ limit = 20 } = {}) {
    return apiRequest(`/technician/jobs/reviews?limit=${limit}`);
  },

  // 15b. Thanh toán VietQR: mã thật do backend tạo (đúng số tiền, nội dung HRMSS<số>, đúng tài khoản nhận).
  async createVietQr(requestId) {
    return apiRequest(`/customer/requests/${encodeURIComponent(requestId)}/payments/vietqr`, { method: 'POST' });
  },
  // Hóa đơn + tình trạng thanh toán: payment_status = UNPAID | PENDING | PARTIALLY_PAID | PAID | NOTHING_TO_PAY.
  async getBill(requestId) {
    return apiRequest(`/customer/requests/${encodeURIComponent(requestId)}/bill`);
  },
  // Tên cũ (giữ để không vỡ chỗ gọi): dùng chung cài đặt với setPaymentMethod / confirmCashPayment.
  async updateCustomerPaymentMethod(requestId, method) {
    return hrmssApi.setPaymentMethod(requestId, method);
  },
  async confirmCustomerPayment(requestId) {
    return hrmssApi.confirmCashPayment(requestId);
  },

  // 15c. Các bước thực hiện của việc (thợ) và ảnh của bước.
  async getJobProcedure(jobId) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/procedure`);
  },
  // body: { status: 'DONE'|'SKIPPED'|'PENDING', checked_items?, measurements?, photo_ids?, note? }
  async updateProcedureStep(jobId, stepId, body) {
    return apiRequest(`/technician/jobs/${encodeURIComponent(jobId)}/procedure/${encodeURIComponent(stepId)}`, { method: 'PATCH', body });
  },
  // Tải ảnh của việc lên server (POST /uploads multipart: file, job_id, evidence_type). Trả data.attachment.attachment_id.
  // uri: data:/blob: (bản web) hoặc file:// (bản native).
  async uploadJobPhoto(jobId, uri, evidenceType = 'AFTER_REPAIR', description = null) {
    return uploadFile(uri, 'anh-buoc.jpg', {
      job_id: String(jobId),
      evidence_type: evidenceType,
      ...(description ? { description: String(description).slice(0, 500) } : {}),
    });
  },

  // 16. Đăng xuất
  logout() {
    // Thu hồi nhóm phiên trên server (dùng được cả khi access token đã hết hạn), rồi xóa token trên máy.
    const refreshToken = authTokens.getRefresh();
    if (refreshToken) {
      rawRequest('/auth/mobile/logout', { method: 'POST', body: { refresh_token: refreshToken }, noAuth: true }).catch(() => {});
    }
    authTokens.clear();
  },
};

export default hrmssApi;
