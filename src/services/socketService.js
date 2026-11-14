import { io } from 'socket.io-client';
import { SOCKET_BASE_URL, SOCKET_PATH } from '../constants/config';

let socket = null;
const eventListeners = new Map();

/**
 * Khởi tạo kết nối Socket.IO tới server
 * @param {string|null} token JWT token của người dùng (nếu có)
 */
export function initSocket(token = null) {
  if (socket && socket.connected) {
    if (token && socket.auth?.token !== token) {
      socket.auth = { token };
      socket.disconnect().connect();
    }
    return socket;
  }

  try {
    socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      auth: token ? { token } : {},
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log(`[Socket.IO] Đã kết nối thành công: ${socket.id} tới ${SOCKET_BASE_URL}`);
      notifyListeners('connection_change', { connected: true, id: socket.id });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Ngắt kết nối: ${reason}`);
      notifyListeners('connection_change', { connected: false, reason });
    });

    socket.on('connect_error', (error) => {
      console.warn(`[Socket.IO] Lỗi kết nối: ${error.message}`);
      notifyListeners('connection_error', error);
    });

    // Lắng nghe các sự kiện realtime chuẩn nghiệp vụ
    const standardEvents = [
      'order:status_update',
      'order:update',
      'order:quote_decision',
      'tech:location_update',
      'payment:success',
      'chat:message',
      'notification:new',
    ];

    standardEvents.forEach((evt) => {
      socket.on(evt, (data) => {
        console.log(`[Socket.IO] Nhận sự kiện ${evt}:`, data);
        notifyListeners(evt, data);
      });
    });

    return socket;
  } catch (err) {
    console.warn('[Socket.IO] Không thể khởi tạo socket:', err.message);
    return null;
  }
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
 * Tham gia vào phòng theo dõi đơn hàng
 * @param {string|number} requestId 
 */
export function joinOrderRoom(requestId) {
  if (!socket || !requestId) return;
  socket.emit('order:join', { requestId: String(requestId) });
}

/**
 * Rời khỏi phòng theo dõi đơn hàng
 * @param {string|number} requestId 
 */
export function leaveOrderRoom(requestId) {
  if (!socket || !requestId) return;
  socket.emit('order:leave', { requestId: String(requestId) });
}

/**
 * Thợ gửi tọa độ GPS di chuyển theo thời gian thực
 * @param {string|number} requestId 
 * @param {{ lat: number, lng: number, etaMin?: number }} coords 
 */
export function sendTechLocation(requestId, { lat, lng, etaMin }) {
  if (!socket || !socket.connected) return;
  socket.emit('tech:send_location', {
    requestId: String(requestId),
    lat: Number(lat),
    lng: Number(lng),
    etaMin: Number(etaMin || 0),
  });
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
  if (socket) {
    try {
      socket.disconnect();
    } catch (e) {}
    socket = null;
  }
}
