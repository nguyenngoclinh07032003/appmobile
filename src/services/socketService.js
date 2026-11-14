import { io } from 'socket.io-client';
import { SOCKET_BASE_URL, SOCKET_PATH } from '../constants/config';

let socket = null;
const eventListeners = new Map();
// Phòng đơn đang mở: server không nhớ phòng của socket cũ nên mỗi lần kết nối lại phải xin vào lại.
const joinedRequests = new Set();

// Sự kiện server phát (backend/README.md, mục Realtime). Chỉ phát sau khi dữ liệu đã lưu DB.
//  - notification:new   -> phòng riêng của tài khoản { type, title, body, icon, request_id }
//  - request:status     -> phòng đơn { request_id, previous_status, new_status, changed_at }
//  - request:updated    -> phòng đơn { request_id, type }
//  - technician:location-> phòng đơn { request_id, latitude, longitude, location_accuracy, location_sharing_enabled, updated_at }
//  - session:expired    -> token hết hạn / đăng xuất / bị khóa; server ngắt kết nối ngay sau đó
const SERVER_EVENTS = ['notification:new', 'request:status', 'request:updated', 'technician:location', 'session:expired'];

const subscribeRoom = (requestId) => {
  socket.emit('request:subscribe', { request_id: String(requestId) }, (res) => {
    if (res && res.ok === false) console.warn(`[Socket.IO] Không vào được phòng đơn ${requestId}: ${res.code}`);
  });
};

/**
 * Khởi tạo kết nối Socket.IO tới server. Chỉ gọi khi đã đăng nhập (khách chưa đăng nhập bị server từ chối).
 * @param {() => string|null} getToken hàm trả access token HIỆN TẠI: socket.io gọi lại mỗi lần (kết nối lại),
 *   nên sau khi app refresh token, lần kết nối kế tiếp tự dùng token mới. Mở lại app chưa có access token
 *   -> server từ chối -> 'auth_required' -> AppContext refresh token rồi reconnectSocket().
 */
export function initSocket(getToken) {
  if (socket) return socket;
  if (typeof getToken !== 'function') return null;

  try {
    socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getToken() || '' }),
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity, // mạng chập chờn: không bỏ cuộc
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      joinedRequests.forEach(subscribeRoom);
      notifyListeners('connection_change', { connected: true, id: socket.id });
    });

    socket.on('disconnect', (reason) => {
      notifyListeners('connection_change', { connected: false, reason });
      // Server chủ động ngắt (sau session:expired): socket.io không tự kết nối lại -> cần refresh token.
      if (reason === 'io server disconnect') notifyListeners('auth_required', { reason });
    });

    // Server từ chối lúc bắt tay (token hết hạn / sai): socket.io KHÔNG tự thử lại -> AppContext refresh token rồi reconnectSocket().
    socket.on('connect_error', (error) => {
      const code = error?.data?.code;
      if (code === 'UNAUTHENTICATED') notifyListeners('auth_required', { code });
      else console.warn(`[Socket.IO] Lỗi kết nối: ${error.message}`);
    });

    // session:expired không xử lý riêng: server ngắt kết nối ngay sau đó -> nhánh 'io server disconnect' ở trên.
    SERVER_EVENTS.forEach((evt) => {
      socket.on(evt, (data) => notifyListeners(evt, data));
    });

    return socket;
  } catch (err) {
    console.warn('[Socket.IO] Không thể khởi tạo socket:', err.message);
    return null;
  }
}

// Kết nối lại sau khi app đã refresh token (auth là hàm nên tự lấy token mới).
export function reconnectSocket() {
  if (socket && !socket.connected) socket.connect();
}

/**
 * Kiểm tra trạng thái kết nối Socket hiện tại
 */
export function isSocketConnected() {
  return Boolean(socket && socket.connected);
}

/**
 * Lấy đối tượng Socket instance hiện thời
 */
export function getSocket() {
  return socket;
}

/**
 * Vào phòng của đơn (mở màn chi tiết đơn / việc) để nhận request:status, request:updated, technician:location.
 * Chỉ khách sở hữu đơn / thợ được giao mới vào được. Nhớ lại để tự vào lại sau khi kết nối lại.
 * @param {string|number} requestId request_id trên server (dbRequestId)
 */
export function joinOrderRoom(requestId) {
  if (!requestId) return;
  joinedRequests.add(String(requestId));
  if (socket?.connected) subscribeRoom(requestId);
}

/**
 * Rời phòng của đơn (đóng màn chi tiết).
 * @param {string|number} requestId
 */
export function leaveOrderRoom(requestId) {
  if (!requestId) return;
  joinedRequests.delete(String(requestId));
  if (socket?.connected) socket.emit('request:unsubscribe', { request_id: String(requestId) });
}

/**
 * Đăng ký lắng nghe sự kiện từ Socket
 * @param {string} event Tên sự kiện
 * @param {Function} callback Hàm xử lý
 */
export function subscribeSocketEvent(event, callback) {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event).add(callback);

  return () => {
    unsubscribeSocketEvent(event, callback);
  };
}

/**
 * Huỷ lắng nghe sự kiện
 * @param {string} event 
 * @param {Function} callback 
 */
export function unsubscribeSocketEvent(event, callback) {
  const set = eventListeners.get(event);
  if (set) {
    set.delete(callback);
    if (set.size === 0) {
      eventListeners.delete(event);
    }
  }
}

function notifyListeners(event, data) {
  const set = eventListeners.get(event);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[Socket.IO] Lỗi listener của sự kiện ${event}:`, err);
      }
    });
  }
}

/**
 * Ngắt kết nối socket (khi đăng xuất)
 */
export function disconnectSocket() {
  joinedRequests.clear();
  if (socket) {
    try {
      socket.disconnect();
    } catch (e) {}
    socket = null;
  }
}
