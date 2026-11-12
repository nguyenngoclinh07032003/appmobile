import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform } from 'react-native';
import {
  getService, TECH_ME, formatVND, catLabel, HOTLINE, serviceKind, matchJobForTech, CATEGORIES, SERVICES,
  tierOf, comboDiscountFor, syncCatalogFromBackend, syncPolicyFromBackend, resolveDbServiceId, PAYMENT_METHODS,
} from '../constants/data';
export { matchJobForTech, comboDiscountFor } from '../constants/data';
import {
  getSession, clearSession, urlRoleHint, setSession, upsertBackendAccount, deleteAccountById,
} from '../services/authService';
import { hrmssApi, authTokens } from '../services/api';
import { API_BASE_URL } from '../constants/config';
import { authErrorMessage } from '../utils/authErrorMessages';
import { readTechnicianSpecialties } from '../utils/techProfile';

// Ngày sinh: server lưu 'YYYY-MM-DD', app hiển thị 'DD/MM/YYYY'.
const isoToDob = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
const dobToIso = (dob) => {
  const m = String(dob || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
// Lỗi mạng: ghi rõ địa chỉ server app đang gọi (sai địa chỉ / server tắt thì nhìn là thấy).
const networkError = (res) => (res?.code === 'TIMEOUT'
  ? `Máy chủ ${API_BASE_URL} phản hồi quá lâu. Kiểm tra mạng rồi thử lại.`
  : `Không kết nối được máy chủ ${API_BASE_URL}. Kiểm tra mạng rồi thử lại.`);
import {
  mapBackendAddressToApp,
  mapBackendCustomerRequestToOrder,
  mapBackendTechJobToOrder,
  mapBackendOpenRequestToOrder,
  mergeBackendOrdersWithLocal,
  buildPreferredTimeIso,
  resolveDbMaterialId,
  mapBackendNotification,
  mapWalletVoucher,
  mapPublicVoucher,
  mapRedeemOption,
  mapPointHistory,
  mapBackendPhotoToEvidence,
} from '../services/syncService';
import {
  TECH_POLICY, normalizeTechRep, isTechLocked, techLockReason, assessCancelAfterAccept, assessLateness,
  applyTechPenalty, applyTechBonus, mintWalletVoucher, slotStartTs, getCancellationWindowStatus,
} from '../constants/techPolicy';
import { getCheckInLocation } from '../utils/geo';
export {
  TECH_POLICY, isTechLocked, techLockReason, assessCancelAfterAccept, assessLateness,
  reputationTone, normalizeTechRep, slotStartTs, getCancellationWindowStatus,
} from '../constants/techPolicy';

// ---------------------------------------------------------------------------
// Tiện ích thời gian
// ---------------------------------------------------------------------------
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (ts) => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtDateTime = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
export const timeAgo = (ts) => {
  if (!ts) return '';
  const s = Math.floor((Date.now() - Number(ts)) / 1000);
  if (s <= 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return fmtDate(ts);
};
const addMonths = (ts, m) => { const d = new Date(ts); d.setMonth(d.getMonth() + m); return d.getTime(); };
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const cartTotal = (items) => items.reduce((sum, it) => sum + (getService(it.id)?.price || 0) * it.qty, 0);
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'onway', 'diagnosing', 'quoted', 'repairing', 'pending_payment', 'partially_paid', 'pending_review', 'warranty_pending', 'out_of_warranty'];
export const isActiveOrder = (o) => ACTIVE_STATUSES.includes(o.status);
// Giá trị dịch vụ khách đã đặt (sau giảm giá dịch vụ + combo, trước voucher)
export const bookedValue = (o) => (
  o.kind === 'warranty' ? 0 : Math.max(0, (o.goods || 0) - (o.productDiscount || 0) - (o.comboDiscount || 0))
);
/** Giảm giá linh kiện theo hạng thành viên: lấy từ hoá đơn server (bill.tier_part_discount_amount). */
export const tierPartDiscountAmount = (o) => Number(o?.bill?.tierPartDiscount) || 0;
/** Giảm do thợ đến muộn: lấy từ hoá đơn server (bill.late_discount_amount). */
export const lateDiscountAmount = (o) => Number(o?.bill?.lateDiscount) || 0;
// Số tiền khách phải trả = bill.amount_due của server (đã gồm báo giá, phát sinh, giảm hạng, voucher, đến muộn, phí kiểm tra).
// Chưa tải được hoá đơn thì tạm dùng tổng server trả cùng đơn (estimated_total / tổng báo giá đã duyệt).
export const orderTotal = (o) => {
  if (o?.bill) return Math.max(0, Number(o.bill.amountDue) || 0);
  if (o.kind === 'warranty' || o.kind === 'followup') return 0;
  if (o.status === 'cancelled') return o.inspectionFee || 0;
  if (o.quote?.approvedTotal != null) return Math.max(0, o.quote.approvedTotal - (o.voucherDiscount || 0));
  const base = o.finalTotal != null ? o.finalTotal : o.total;
  return Math.max(0, Number(base) || 0);
};
// Tiền mặt thợ cần thu: bill.cash_to_collect của server (0 nếu khách trả VietQR).
export const cashToCollect = (o) => (o?.bill?.cashToCollect != null ? o.bill.cashToCollect : (o?.cashToCollect ?? orderTotal(o)));
// Còn phải trả (đã trừ tiền đã thanh toán) và trạng thái thanh toán theo server.
export const amountRemaining = (o) => (o?.bill ? Math.max(0, Number(o.bill.remainingAmount) || 0) : orderTotal(o));
export const isPaid = (o) => (o?.bill ? ['PAID', 'NOTHING_TO_PAY'].includes(o.bill.paymentStatus) : Boolean(o?.report?.paid));
// Đơn đã sửa xong, đang chờ khách trả tiền (PENDING_PAYMENT / trả thiếu).
export const isAwaitingPayment = (o) => ['PENDING_PAYMENT', 'PARTIALLY_PAID_RECEIVABLE'].includes(o?.backendStatus) && !isPaid(o);

// Kiểm tra đơn hàng thanh toán bằng Chuyển khoản QR (VietQR) -> Thợ tuyệt đối KHÔNG được thu tiền mặt
export const isQRPayment = (o) => {
  if (!o) return false;
  if (o.qrPaymentRequested || o.paymentMethod === 'vietqr') return true;
  return /vietqr|qr|chuyển khoản|chuyen khoan|ngân hàng|mbbank/i.test(String(o.payment || ''));
};
const techCodeOf = (p) => (p.techProfile || TECH_ME).code;
const declinedFor = (p, techCode) => {
  const map = p.declinedByTech || {};
  if (map[techCode]?.length) return map[techCode];
  // tương thích dữ liệu cũ (declined global) — chỉ áp cho đúng thợ đang xem
  if ((p.declined || []).length && techCode === techCodeOf(p)) return p.declined;
  return [];
};
const markDeclined = (p, techCode, orderCode) => {
  const prev = p.declinedByTech || {};
  return {
    declinedByTech: {
      ...prev,
      [techCode]: [...new Set([...(prev[techCode] || declinedFor(p, techCode)), orderCode])],
    },
  };
};
const clearDeclined = (p, techCode, orderCode) => {
  const prev = p.declinedByTech || {};
  return {
    declinedByTech: {
      ...prev,
      [techCode]: (prev[techCode] || declinedFor(p, techCode)).filter((c) => c !== orderCode),
    },
  };
};
// Ngày hẹn dạng YYYY-MM-DD (đơn cũ không có dateKey thì đọc dd/mm trong nhãn)
export const dateKeyOf = (o) => {
  if (o.dateKey) return o.dateKey;
  const m = /(\d{2})\/(\d{2})/.exec(o.dateLabel || '');
  const d = new Date(o.createdAt || Date.now());
  if (m) return `${d.getFullYear()}-${m[2]}-${m[1]}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const todayKey = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
// orders: danh sách tất cả đơn — dùng để chặn gửi trùng yêu cầu bảo hành khi đã có đơn bảo hành đang xử lý
export const warrantyInfo = (o, orders = [], lifetimePoints = 0) => {
  // Hạn bảo hành do server tính theo hạng khách lúc đặt (warranty_days / warranty_end_date).
  const totalDays = o?.warrantyDays || tierOf(lifetimePoints || 0).cur.warrantyDays || 60;
  if (o.status === 'cancelled') return { ok: false, totalDays, text: 'Đơn đã huỷ nên không được bảo hành.' };
  if (o.kind === 'warranty') return { ok: false, totalDays, text: 'Đây là đơn bảo hành.' };
  const open = orders.find((x) => x.kind === 'warranty' && isActiveOrder(x)
    && (x.warrantyOf === o.code || (o.dbRequestId && String(x.originalRequestId) === String(o.dbRequestId))));
  if (open) return { ok: false, pending: true, totalDays, openCode: open.code, text: `Đã có yêu cầu bảo hành ${open.code} đang xử lý.` };
  const covered = o.items.filter((it) => ['clean', 'gas', 'repair', 'install'].includes(serviceKind(getService(it.id))));
  if (!covered.length) return { ok: false, totalDays, text: `Đơn này là gói dịch vụ định kỳ riêng, không thuộc diện bảo hành ${totalDays} ngày.` };
  if (o.status !== 'done') return { ok: false, pending: true, totalDays, text: `Bảo hành ${totalDays} ngày sẽ bắt đầu khi đơn hoàn thành.` };
  const endAt = o.warrantyEndAt || (o.doneAt + totalDays * DAY);
  const left = Math.ceil((endAt - Date.now()) / DAY);
  if (left <= 0) return { ok: false, totalDays, text: `Đơn đã hết thời hạn bảo hành ${totalDays} ngày.` };
  return {
    ok: true,
    totalDays,
    daysLeft: left,
    until: endAt,
    text: `Còn ${left}/${totalDays} ngày bảo hành (đến ${fmtDate(endAt)}).`,
  };
};

// ---------------------------------------------------------------------------
// State ban đầu + lưu trữ (localStorage trên web)
// ---------------------------------------------------------------------------
const KEY = 'tho-hrmss-state-v2';
// Hồ sơ thợ: giữ khu vực/chuyên môn đã lưu, cập nhật tên/SĐT từ tài khoản đăng nhập
const mergeTechProfile = (prev, account) => {
  const code = account.techCode || prev?.code || TECH_ME.code;
  const same = prev?.code === code ? prev : null;
  const rep = normalizeTechRep(same || prev || {});
  return {
    name: account.name || same?.name || TECH_ME.name,
    phone: account.phone || same?.phone || TECH_ME.phone,
    email: account.email || same?.email || '',
    dob: account.dob || same?.dob || '',
    code,
    rating: same?.rating ?? TECH_ME.rating,
    jobs: same?.jobs ?? 0,
    area: same?.area || TECH_ME.area,
    skills: same?.skills || [],
    reputation: rep.reputation,
    lockedUntil: rep.lockedUntil,
    violations: rep.violations,
    cancelAfterAcceptCount: rep.cancelAfterAcceptCount,
    lateCount: rep.lateCount,
  };
};

const CUSTOMER_SLICE_KEYS = [
  'addresses', 'selectedAddressId', 'cart', 'favorites',
  'notifications', 'points', 'lifetimePoints', 'pointHistory', 'myVouchers', 'searches',
];
const makeCustomerSlice = () => ({
  addresses: [],
  selectedAddressId: null,
  cart: [],
  favorites: [],
  notifications: [],
  points: 0,
  lifetimePoints: 0,
  pointHistory: [],
  myVouchers: [],
  searches: [],
});
const extractCustomerSlice = (state) => {
  const out = {};
  CUSTOMER_SLICE_KEYS.forEach((k) => { out[k] = state[k]; });
  return out;
};
const customerProfileKey = (acc) => {
  if (!acc || acc.role !== 'customer') return null;
  return acc.id || acc.username || acc.email || acc.phone || null;
};
const isOrderOfCustomer = (o, phone, accountId = null) => {
  if (accountId && o?.customerAccountId) {
    return o.customerAccountId === accountId;
  }
  if (!phone) return Boolean(accountId && o?.customerAccountId === accountId);
  const p = String(phone).trim();
  const op = String(o?.customerPhone || o?.address?.phone || '').trim();
  return !op || op === p;
};
// Khi đổi tài khoản khách hàng: lưu dữ liệu khách cũ vào customerProfiles[oldKey], nạp dữ liệu khách mới
const switchCustomerSlice = (prev, nextAccount) => {
  const profiles = { ...(prev.customerProfiles || {}) };
  const prevKey = customerProfileKey(prev.auth) || (prev.role === 'customer' ? prev.user?.phone : null);
  if (prevKey) {
    profiles[prevKey] = extractCustomerSlice(prev);
  }
  const nextKey = customerProfileKey(nextAccount);
  if (nextKey) {
    const rawLoaded = profiles[nextKey] || (nextAccount.phone ? profiles[nextAccount.phone] : null) || makeCustomerSlice();
    const loaded = {
      ...rawLoaded,
      notifications: rawLoaded.notifications || [],
      points: rawLoaded.points ?? 0,
      lifetimePoints: rawLoaded.lifetimePoints ?? 0,
      pointHistory: rawLoaded.pointHistory || [],
    };
    profiles[nextKey] = loaded;
    return { ...loaded, customerProfiles: profiles };
  }
  return { customerProfiles: profiles };
};

const makeInitial = () => ({
  user: { name: '', phone: '', email: '' },
  ...makeCustomerSlice(),
  orders: [],
  userReviews: {},
  customerProfiles: {},
  // Phía thợ
  role: 'customer', // 'customer' | 'tech'
  techNotifs: [],
  // Dữ liệu chung tải từ backend: mã công khai, lựa chọn đổi điểm, chính sách hệ thống, đánh giá theo dịch vụ.
  publicVouchers: [],
  redeemOptions: [],
  policy: null,
  serviceReviews: {},
  declined: [], // legacy — dùng declinedByTech theo mã thợ
  declinedByTech: {}, // { [techCode]: string[] }
  declineLog: [],
  techProfile: null,
  payoutHistory: [],
  tips: { customerHome: true, techJobs: true }, // gợi ý lần đầu
});

const storage = {
  load() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  save(s) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* bỏ qua */ }
  },
  clear() {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch (e) { /* bỏ qua */ }
  },
};

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [s, setS] = useState(() => {
    const saved = storage.load() || {};
    const session = getSession();
    const role = session?.role || saved.role || 'customer';
    const user = session
      ? { name: session.name || '', phone: session.phone || '', email: session.email || '' }
      : (saved.user || { name: '', phone: '', email: '' });
    // Bỏ dữ liệu mẫu đã lưu từ bản app cũ (đơn/địa chỉ/thông báo không có id backend, thiết bị giả).
    const fromBackend = (list, idKey) => (Array.isArray(list) ? list.filter((x) => x && x[idKey] != null) : []);
    const cleanOrders = (saved.orders || []).filter((o) => o && (o.dbRequestId != null || o.localOnly));
    const cleanAddresses = fromBackend(saved.addresses, 'dbAddressId');
    const cleanNotifs = fromBackend(saved.notifications, 'dbNotificationId');
    const cleanTechNotifs = fromBackend(saved.techNotifs, 'dbNotificationId');
    const { devices: _legacyDevices, ...savedRest } = saved;
    const baseState = {
      ...makeInitial(),
      ...savedRest,
      orders: cleanOrders,
      addresses: cleanAddresses,
      notifications: cleanNotifs,
      techNotifs: cleanTechNotifs,
      pointHistory: (saved.pointHistory || []).filter((h) => String(h?.id || '').startsWith('pt-db-')),
      myVouchers: (saved.myVouchers || []).filter((v) => v?.customerVoucherId != null),
      points: saved.points ?? 0,
      lifetimePoints: saved.lifetimePoints ?? 0,
      selectedAddressId: saved.selectedAddressId,
      role,
      user,
      auth: session,
      techProfile: session?.role === 'tech'
        ? mergeTechProfile(saved.techProfile, session)
        : (saved.techProfile || null),
    };
    const sessKey = customerProfileKey(session);
    if (sessKey) {
      const profiles = { ...(baseState.customerProfiles || {}) };
      if (profiles[sessKey] || (session.phone && profiles[session.phone])) {
        const rawSlice = profiles[sessKey] || profiles[session.phone];
        const existingSlice = {
          ...rawSlice,
          notifications: fromBackend(rawSlice.notifications, 'dbNotificationId'),
          pointHistory: (rawSlice.pointHistory || []).filter((h) => String(h?.id || '').startsWith('pt-db-')),
          addresses: fromBackend(rawSlice.addresses, 'dbAddressId'),
          myVouchers: (rawSlice.myVouchers || []).filter((v) => v?.customerVoucherId != null),
          points: rawSlice.points ?? 0,
          lifetimePoints: rawSlice.lifetimePoints ?? 0,
        };
        delete existingSlice.devices;
        profiles[sessKey] = existingSlice;
        return { ...baseState, ...existingSlice, customerProfiles: profiles };
      }
      const savedPhone = saved.user?.phone || cleanAddresses[0]?.phone;
      const slice = (session.phone && (!savedPhone || savedPhone === session.phone))
        ? extractCustomerSlice(baseState)
        : makeCustomerSlice();
      profiles[sessKey] = slice;
      return { ...baseState, ...slice, customerProfiles: profiles };
    }
    return baseState;
  });
  const up = (fn) => setS((prev) => {
    const patch = fn(prev) || {};
    const next = { ...prev, ...patch };
    const activeCustKey = customerProfileKey(next.auth);
    if (activeCustKey && !patch.customerProfiles) {
      next.customerProfiles = {
        ...(next.customerProfiles || {}),
        [activeCustKey]: extractCustomerSlice(next),
      };
    }
    return next;
  });
  // Chống vòng lặp sync 2 tab: merge từ storage ≠ payload đã ghi → save lại → tab kia merge lại…
  const lastWritten = useRef('');
  const skipSaveOnce = useRef(false);
  useEffect(() => {
    const { auth, ...rest } = s;
    const payload = { ...rest, role: auth?.role || rest.role };
    let raw;
    try { raw = JSON.stringify(payload); } catch (e) { return; }
    if (raw === lastWritten.current) return;
    if (skipSaveOnce.current) {
      skipSaveOnce.current = false;
      lastWritten.current = raw;
      return;
    }
    lastWritten.current = raw;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, raw);
    } catch (e) { /* quota / private mode */ }
  }, [s]);

  // Đồng bộ đơn hàng giữa tab Khách ↔ Thợ trên cùng trình duyệt
  // Ưu tiên bản đơn có lịch sử dài hơn / cập nhật gần hơn để không ghi đè tiến độ thợ
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const orderRank = (o) => {
      const hist = (o?.history || []).length;
      const last = (o?.history || []).reduce((m, h) => Math.max(m, h.at || 0), o?.updatedAt || 0);
      return hist * 1e13 + last;
    };
    const mergeOrders = (local = [], remote = []) => {
      const map = new Map();
      [...local, ...remote].forEach((o) => {
        if (!o?.code) return;
        const cur = map.get(o.code);
        if (!cur || orderRank(o) >= orderRank(cur)) map.set(o.code, o);
      });
      return [...map.values()].sort((a, b) => orderRank(b) - orderRank(a));
    };
    const mergeNotifs = (local = [], remote = []) => {
      const map = new Map();
      [...remote, ...local].forEach((n) => { if (n?.id) map.set(n.id, n); });
      return [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
    };
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      if (e.newValue === lastWritten.current) return;
      try {
        const incoming = JSON.parse(e.newValue);
        skipSaveOnce.current = true;
        lastWritten.current = e.newValue;
        setS((prev) => {
          const activeCustPhone = prev.auth?.role === 'customer' ? prev.auth.phone : null;
          const mergedProfiles = { ...(prev.customerProfiles || {}), ...(incoming.customerProfiles || {}) };
          const custSlice = (activeCustPhone && mergedProfiles[activeCustPhone])
            ? {
              ...mergedProfiles[activeCustPhone],
              notifications: mergeNotifs(prev.notifications, mergedProfiles[activeCustPhone].notifications),
            }
            : {};
          return {
            ...prev,
            ...incoming,
            ...custSlice,
            customerProfiles: mergedProfiles,
            orders: mergeOrders(prev.orders, incoming.orders),
            notifications: activeCustPhone
              ? (custSlice.notifications || mergeNotifs(prev.notifications, incoming.notifications))
              : mergeNotifs(prev.notifications, incoming.notifications),
            techNotifs: mergeNotifs(prev.techNotifs, incoming.techNotifs),
            auth: prev.auth,
            role: prev.auth?.role || incoming.role || prev.role,
            user: prev.auth
              ? { name: prev.auth.name || '', phone: prev.auth.phone || '', email: prev.auth.email || '' }
              : (incoming.user || prev.user),
            techProfile: prev.auth?.role === 'tech' ? prev.techProfile : (incoming.techProfile || null),
          };
        });
      } catch (err) { /* bỏ qua */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ------------------------- Điều hướng -------------------------
  const [tab, setTab] = useState(() => (s.auth?.role === 'tech' || s.role === 'tech' ? 'tech-jobs' : 'home'));
  const [stack, setStack] = useState([]); // màn hình phủ lên trên tab: [{ name, params, key }]
  // category: danh mục của tab Bảo dưỡng; kindCat: bộ lọc danh mục cho tab Lắp đặt / Sửa chữa / Trọn đời ('all' = tất cả)
  const [svc, setSvc] = useState({ tab: 'bao-duong', category: null, kindCat: 'all', sort: 'popular' });
  // Mã voucher được chọn ở "Quyền lợi" → tự áp dụng khi mở màn Xác nhận đặt lịch
  const [pendingVoucher, setPendingVoucher] = useState(null);
  // Thiết bị được chọn từ màn "Thiết bị của tôi" → tự gắn vào đơn khi đặt lịch
  const [actFilter, setActFilter] = useState('active');
  const [warrantyQuery, setWarrantyQuery] = useState('');
  const [warrantyNonce, setWarrantyNonce] = useState(0);

  const nav = {
    tab,
    stack,
    top: stack[stack.length - 1] || null,
    push: (name, params = {}) => setStack((st) => [...st, { name, params, key: uid() }]),
    replace: (name, params = {}) => setStack((st) => [...st.slice(0, -1), { name, params, key: uid() }]),
    back: () => setStack((st) => st.slice(0, -1)),
    popTo: (name) => setStack((st) => {
      const i = st.map((x) => x.name).lastIndexOf(name);
      return i >= 0 ? st.slice(0, i + 1) : st;
    }),
    reset: () => setStack([]),
    go: (t) => { setStack([]); setTab(t); },
    services: (serviceTab, category) => {
      setSvc((p) => {
        const t = serviceTab || p.tab;
        if (t === 'bao-duong') return { ...p, tab: t, category: category || p.category };
        return { ...p, tab: t, kindCat: category || 'all' };
      });
      setStack([]);
      setTab('services');
    },
    activity: (filter) => { if (filter) setActFilter(filter); setStack([]); setTab('activity'); },
    warranty: (query) => {
      setWarrantyQuery(query || '');
      setWarrantyNonce((n) => n + 1);
      setSvc((p) => ({ ...p, tab: 'bao-hanh' }));
      setStack([]);
      setTab('services');
    },
    open: (link) => {
      if (!link) return;
      if (link.tab) { nav.go(link.tab); return; }
      setStack((st) => [...st, { name: link.name, params: link.params || {}, key: uid() }]);
    },
  };

  const stackRef = useRef(stack);
  stackRef.current = stack;
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stackRef.current.length) { setStack((st) => st.slice(0, -1)); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  // ------------------------- Toast + Dialog -------------------------
  const [toastMsg, setToastMsg] = useState(null);
  const [dialogCfg, setDialogCfg] = useState(null);
  useEffect(() => {
    if (!toastMsg) return undefined;
    const t = setTimeout(() => setToastMsg(null), 2000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const ui = {
    toast: (text, icon = '✓', tone) => setToastMsg({ text, icon, tone, id: uid() }),
    toastMsg,
    dialog: (cfg) => setDialogCfg(cfg),
    dialogCfg,
    closeDialog: () => setDialogCfg(null),
    confirm: (title, message, onOk, okLabel = 'Đồng ý', danger = false) => setDialogCfg({
      title,
      message,
      danger,
      tone: danger ? 'danger' : undefined,
      fallbackTone: danger ? 'danger' : 'warning',
      actions: [
        { label: 'Huỷ', variant: 'ghost' },
        { label: okLabel, variant: danger ? 'danger' : 'auto', onPress: onOk },
      ],
    }),
    alert: (title, message, icon, tone) => setDialogCfg({
      title,
      message,
      icon,
      tone,
      fallbackTone: 'warning',
      actions: [{ label: 'Đã hiểu', variant: 'auto' }],
    }),
    call: () => setDialogCfg({
      icon: '📞',
      tone: 'info',
      fallbackTone: 'info',
      title: `Hotline ${HOTLINE}`,
      message: 'Tổng đài hỗ trợ Thợ Minh Đức hoạt động 7:30 – 22:00 mỗi ngày (miễn phí).',
      actions: [
        { label: 'Để sau', variant: 'ghost' },
        { label: 'Gọi ngay', variant: 'primary', onPress: () => Linking.openURL(`tel:${HOTLINE.replace(/\s/g, '')}`).catch(() => {}) },
      ],
    }),
  };

  // ------------------------- Nghiệp vụ -------------------------
  const pushNotif = (prev, n) => [{ id: uid(), at: Date.now(), read: false, ...n }, ...prev.notifications].slice(0, 50);
  const pushTech = (prev, n) => [{ id: uid(), at: Date.now(), read: false, ...n }, ...(prev.techNotifs || [])].slice(0, 50);
  const withStatus = (o, status, now, extra = {}) => ({ ...o, ...extra, status, history: [...o.history, { status, at: now }] });
  // Cập nhật 1 đơn + đẩy thông báo cho khách (đúng tài khoản đặt đơn) và/hoặc thợ
  const updateOrder = (code, fn) => up((p) => {
    const o = p.orders.find((x) => x.code === code);
    if (!o) return {};
    const r = fn(o, p) || {};
    const ownerPhone = o.customerPhone || o.address?.phone || null;
    const activeCustPhone = p.auth?.role === 'customer' ? p.auth.phone : null;
    const isActiveOwner = !ownerPhone || ownerPhone === activeCustPhone;
    const custNotif = r.customer ? { id: uid(), at: Date.now(), read: false, link: { name: 'order', params: { code } }, ...r.customer } : null;

    let nextProfiles = p.customerProfiles || {};
    if (ownerPhone && nextProfiles[ownerPhone]) {
      const curProf = nextProfiles[ownerPhone];
      const profPatch = {};
      if (custNotif) {
        profPatch.notifications = [custNotif, ...(curProf.notifications || [])].slice(0, 50);
      }
      if (r.customerProfilePatch) {
        Object.assign(profPatch, r.customerProfilePatch(curProf));
      }
      if (Object.keys(profPatch).length) {
        nextProfiles = { ...nextProfiles, [ownerPhone]: { ...curProf, ...profPatch } };
      }
    }

    return {
      orders: p.orders.map((x) => (x.code === code ? r.order || x : x)),
      ...(custNotif && isActiveOwner ? { notifications: [custNotif, ...p.notifications].slice(0, 50) } : {}),
      ...(r.tech ? { techNotifs: pushTech(p, { link: { name: 'tech-job', params: { code } }, ...r.tech }) } : {}),
      ...(isActiveOwner && r.extra ? r.extra : {}),
      ...(!isActiveOwner && r.extra?.techProfile ? { techProfile: r.extra.techProfile } : {}),
      customerProfiles: nextProfiles,
    };
  });
  const address = s.addresses.find((a) => a.id === s.selectedAddressId) || s.addresses.find((a) => a.isDefault) || s.addresses[0] || null;

  // Đồng bộ toàn bộ dữ liệu app từ backend: danh mục, chính sách, vật tư; khách: hồ sơ, địa chỉ, đơn, thông báo,
  // điểm, ví voucher; thợ: việc, hồ sơ, đánh giá, thông báo. App không còn dữ liệu mẫu: lỗi mạng thì giữ dữ liệu đã có.
  const okItems = (res) => (res?.ok && Array.isArray(res.data?.items) ? res.data.items : null);
  const syncFromBackend = async (overrideAccount = null) => {
    try {
      const [catRes, svcRes, cfgRes, matRes] = await Promise.all([
        hrmssApi.getServiceCategories(),
        hrmssApi.getServices(),
        hrmssApi.getPublicConfig(),
        hrmssApi.getPublicMaterials(),
      ]);
      const catItems = catRes.ok ? (Array.isArray(catRes.data?.items) ? catRes.data.items : (Array.isArray(catRes.data) ? catRes.data : null)) : null;
      if (catItems) syncCatalogFromBackend({ categories: catItems });
      if (svcRes.ok && Array.isArray(svcRes.items)) {
        syncCatalogFromBackend({ services: svcRes.items });
        // Giỏ hàng / yêu thích của bản cũ có mã dịch vụ mẫu: bỏ những món không còn trong danh mục.
        up((p) => ({
          cart: (p.cart || []).filter((it) => getService(it.id) && !getService(it.id).hidden),
          favorites: (p.favorites || []).filter((id) => getService(id) && !getService(id).hidden),
          catalogVersion: Date.now(),
        }));
        setSvc((p) => (p.category && CATEGORIES.some((c) => c.id === p.category) ? p : { ...p, category: (CATEGORIES.find((c) => SERVICES.some((x) => x.category === c.id)) || CATEGORIES[0])?.id || null }));
      }
      if (matRes.ok && Array.isArray(matRes.data?.items)) syncCatalogFromBackend({ materials: matRes.data.items });
      if (cfgRes.ok && cfgRes.data) {
        syncPolicyFromBackend(cfgRes.data);
        const tech = cfgRes.data.technician || {};
        const late = (cfgRes.data.lateness?.tiers || []).reduce((m, t) => ({ ...m, [t.tier]: t.max_minutes }), {});
        if (tech.max_active_jobs != null) TECH_POLICY.maxActiveJobs = Number(tech.max_active_jobs);
        if (tech.free_release_minutes != null) TECH_POLICY.freeCancelMs = Number(tech.free_release_minutes) * 60000;
        if (tech.near_slot_minutes != null) TECH_POLICY.nearSlotMs = Number(tech.near_slot_minutes) * 60000;
        if (late.ok != null) TECH_POLICY.lateGraceMin = Number(late.ok);
        if (late.soft != null) TECH_POLICY.lateMidMin = Number(late.soft);
        if (late.mid != null) TECH_POLICY.lateSevereMin = Number(late.mid);
        up(() => ({ policy: cfgRes.data }));
      }
    } catch (e) { /* mất mạng: giữ dữ liệu cũ */ }

    const acc = overrideAccount || s.auth;
    if (!acc || !authTokens.get()) return;

    if (acc.role === 'customer') {
      try {
        const [meRes, addrRes, reqRes, verRes, notifRes, loyaltyRes, walletRes, catalogRes] = await Promise.all([
          hrmssApi.getMe(),
          hrmssApi.getCustomerAddresses(),
          hrmssApi.getCustomerRequests('ALL'),
          hrmssApi.getEmailVerificationStatus(),
          hrmssApi.getNotifications(),
          hrmssApi.getLoyalty(),
          hrmssApi.getVoucherWallet('AVAILABLE'),
          hrmssApi.getVoucherCatalog(),
        ]);
        const serverProfile = (meRes.ok && meRes.data?.profile) ? meRes.data.profile : null;
        const serverAccount = (meRes.ok && meRes.data?.account) ? meRes.data.account : null;
        const serverName = serverProfile?.full_name || serverAccount?.username || acc.name;
        const serverPhone = serverProfile?.phone || '';
        const serverEmail = serverAccount?.email || acc.email;

        const remoteAddrs = okItems(addrRes) ? addrRes.data.items.map(mapBackendAddressToApp).filter(Boolean) : null;
        // Thông tin thợ thật của các đơn đã có thợ (tên, SĐT, điểm): GET /customer/requests/:id/tracking.
        const rawRequests = okItems(reqRes);
        if (rawRequests) {
          const needTech = rawRequests.filter((r) => r.request_status !== 'RECEIVED' && !String(r.request_status || '').startsWith('CANCELLED')).slice(0, 20);
          // Hoá đơn thật (tiền phải trả, đã trả, giảm giá, phí kiểm tra): GET /customer/requests/:id/bill.
          const needBill = rawRequests.filter((r) => r.request_status !== 'RECEIVED').slice(0, 20);
          const [trackings, bills] = await Promise.all([
            Promise.all(needTech.map((r) => hrmssApi.getRequestTracking(r.request_id).catch(() => null))),
            Promise.all(needBill.map((r) => hrmssApi.getBill(r.request_id).catch(() => null))),
          ]);
          needTech.forEach((r, i) => {
            const t = trackings[i];
            if (t?.ok && t.data?.technician) r.technician = t.data.technician;
            if (t?.ok && t.data?.journey) r.journey = t.data.journey;
          });
          needBill.forEach((r, i) => { if (bills[i]?.ok && bills[i].data?.bill) r.bill = bills[i].data; });
        }
        const remoteOrders = rawRequests
          ? rawRequests.map((r) => mapBackendCustomerRequestToOrder(r, serverPhone || acc.phone)).filter(Boolean)
          : null;
        const remoteEmailVerified = verRes.ok && verRes.data
          ? Boolean(verRes.data.email_verified)
          : null;
        const loyalty = loyaltyRes.ok ? loyaltyRes.data : null;
        const wallet = okItems(walletRes);
        const catalog = catalogRes.ok ? catalogRes.data : null;

        up((p) => {
          const nextAddresses = remoteAddrs !== null ? remoteAddrs : p.addresses;
          const defaultAddr = nextAddresses.find((x) => x.isDefault) || nextAddresses[0] || null;
          const nextSelectedId = nextAddresses.some((x) => x.id === p.selectedAddressId)
            ? p.selectedAddressId
            : (defaultAddr?.id || null);
          const remoteWithAcc = remoteOrders
            ? remoteOrders.map((o) => ({ ...o, customerAccountId: acc.id || o.customerAccountId || null }))
            : null;
          const nextOrders = remoteWithAcc ? mergeBackendOrdersWithLocal(p.orders, remoteWithAcc) : p.orders;
          const notifItems = okItems(notifRes);
          const nextAuth = p.auth
            ? upsertBackendAccount({
                ...p.auth,
                name: serverName,
                phone: serverPhone,
                email: serverEmail,
                emailVerified: remoteEmailVerified !== null ? remoteEmailVerified : p.auth.emailVerified,
              })
            : p.auth;
          return {
            user: {
              ...(p.user || {}),
              name: serverName,
              phone: serverPhone,
              email: serverEmail,
            },
            ...(nextAuth ? { auth: nextAuth } : {}),
            addresses: nextAddresses,
            selectedAddressId: nextSelectedId,
            orders: nextOrders,
            ...(notifItems ? {
              notifications: notifItems
                .map((n) => mapBackendNotification(n, nextOrders, 'order'))
                .filter((n) => n && (!p.notifClearedAt || n.at > p.notifClearedAt)),
            } : {}),
            ...(loyalty ? {
              points: Number(loyalty.points) || 0,
              lifetimePoints: Number(loyalty.lifetime_points) || 0,
              pointHistory: (loyalty.history || []).map(mapPointHistory).filter(Boolean),
            } : {}),
            ...(wallet ? { myVouchers: wallet.map(mapWalletVoucher).filter(Boolean) } : {}),
            ...(catalog ? {
              publicVouchers: (catalog.public_vouchers || []).map(mapPublicVoucher).filter(Boolean),
              redeemOptions: (catalog.redeem_options || []).map(mapRedeemOption).filter(Boolean),
            } : {}),
          };
        });
      } catch (e) { /* bỏ qua */ }
    } else if (acc.role === 'tech') {
      try {
        const [jobsRes, openRes, techMatRes, notifRes, profRes, reviewRes] = await Promise.all([
          hrmssApi.getTechnicianJobs('ALL'),
          hrmssApi.getTechnicianOpenRequests(),
          hrmssApi.getTechnicianMaterials(),
          hrmssApi.getNotifications(),
          hrmssApi.getTechnicianProfile(),
          hrmssApi.getTechnicianReviews(),
        ]);
        if (okItems(techMatRes)) syncCatalogFromBackend({ materials: techMatRes.data.items });
        const summary = reviewRes.ok ? reviewRes.data?.summary : null;
        const specialtyInfo = profRes.ok ? readTechnicianSpecialties(profRes.data) : null;
        // Ảnh minh chứng của các việc đang làm: GET /uploads?job_id= (bỏ ảnh đã gắn vào bước thực hiện).
        const activeJobIds = (jobsRes.ok && Array.isArray(jobsRes.data?.items) ? jobsRes.data.items : [])
          .filter((j) => j.assignment_status === 'ACTIVE' && j.assignment_id)
          .map((j) => String(j.assignment_id))
          .slice(0, 10);
        const [photoLists, jobBills] = await Promise.all([
          Promise.all(activeJobIds.map((id) => hrmssApi.listJobPhotos(id).catch(() => null))),
          // Hoá đơn của việc (tiền mặt cần thu, giảm giá): GET /technician/jobs/:id/bill.
          Promise.all(activeJobIds.map((id) => hrmssApi.getTechnicianJobBill(id).catch(() => null))),
        ]);
        const billByJob = new Map();
        activeJobIds.forEach((id, i) => { if (jobBills[i]?.ok && jobBills[i].data?.bill) billByJob.set(id, jobBills[i].data); });
        const evidenceByJob = new Map();
        activeJobIds.forEach((id, i) => {
          const res = photoLists[i];
          const rows = res?.ok ? (res.data?.items || res.data?.attachments || (Array.isArray(res.data) ? res.data : [])) : null;
          if (rows) evidenceByJob.set(id, rows.filter((r) => !r.procedure_step_id).map(mapBackendPhotoToEvidence));
        });
        up((p) => {
          const base = p.techProfile || mergeTechProfile(null, acc);
          const techProf = {
            ...base,
            ...(profRes.ok ? { area: profRes.data?.work_area || '' } : {}),
            specialtiesAvailable: Boolean(specialtyInfo?.available),
            specialties: specialtyInfo?.specialties || [],
            specialtyCategoryIds: specialtyInfo?.categoryIds || [],
            acceptsAllCategories: specialtyInfo?.acceptsAllCategories || false,
            ...(summary ? {
              rating: summary.rating_average,
              ratingCount: summary.rating_count,
              satisfactionPercent: summary.satisfaction_percent,
            } : {}),
            reviews: reviewRes.ok ? (reviewRes.data?.items || []) : (base.reviews || []),
          };
          const assignedOrders = (jobsRes.ok && Array.isArray(jobsRes.data?.items))
            ? jobsRes.data.items.map((j) => {
                const b = billByJob.get(String(j.assignment_id));
                const o = mapBackendTechJobToOrder(b ? { ...j, bill: b } : j, techProf);
                const ev = evidenceByJob.get(String(j.assignment_id));
                return o && ev ? { ...o, evidence: ev } : o;
              }).filter(Boolean)
            : [];
          const assignedCodes = new Set(assignedOrders.map((o) => o.code));
          const openOrders = (openRes.ok && Array.isArray(openRes.data?.items))
            ? openRes.data.items
                .map(mapBackendOpenRequestToOrder)
                .filter((o) => o && !assignedCodes.has(o.code))
            : [];
          const remoteOrders = [...assignedOrders, ...openOrders];
          const nextOrders = mergeBackendOrdersWithLocal(p.orders, remoteOrders);
          const completedJobsCount = assignedOrders.filter((o) => o.status === 'done').length;
          const notifItems = okItems(notifRes);
          return {
            orders: nextOrders,
            techProfile: { ...techProf, jobs: completedJobsCount },
            ...(notifItems ? {
              techNotifs: notifItems
                .map((n) => mapBackendNotification(n, nextOrders, 'tech-job'))
                .filter((n) => n && (!p.techNotifClearedAt || n.at > p.techNotifClearedAt)),
            } : {}),
          };
        });
      } catch (e) { /* bỏ qua */ }
    }
  };

  // Mô tả + các bước thực hiện chuẩn của một dịch vụ (màn chi tiết dịch vụ).
  const loadServiceDetail = async (serviceDbId) => {
    if (!serviceDbId) return null;
    const [det, proc] = await Promise.all([
      hrmssApi.getServiceDetail(serviceDbId).catch(() => null),
      hrmssApi.getServiceProcedure(serviceDbId).catch(() => null),
    ]);
    if (!det?.ok && !proc?.ok) return null;
    const info = {
      description: det?.ok ? (det.data?.service?.description || '') : '',
      bookingCount: det?.ok ? (det.data?.service?.booking_count ?? null) : null,
      steps: proc?.ok ? (proc.data?.steps || []) : null,
      at: Date.now(),
    };
    up((p) => ({ serviceDetails: { ...(p.serviceDetails || {}), [serviceDbId]: info } }));
    return info;
  };

  // Điểm + nhận xét của khách cho một dịch vụ (màn chi tiết dịch vụ). Lưu theo dbId để không gọi lại liên tục.
  const loadServiceReviews = async (serviceDbId) => {
    if (!serviceDbId) return null;
    const res = await hrmssApi.getServiceReviews(serviceDbId, { limit: 5 }).catch(() => null);
    if (!res?.ok) return null;
    up((p) => ({ serviceReviews: { ...(p.serviceReviews || {}), [serviceDbId]: { ...res.data, at: Date.now() } } }));
    return res.data;
  };

  // Dựng tài khoản app từ phản hồi đăng nhập / làm mới phiên của backend ({ account }) + hồ sơ (/auth/me).
  const buildBackendAccount = async (data) => {
    const roleCode = String(data.role || data.account?.role?.role_code || 'CUSTOMER').toUpperCase();
    const isTech = roleCode === 'TECHNICIAN' || roleCode === 'TECH';
    const account = {
      id: `be-${data.user_id || data.account?.user_id}`,
      role: isTech ? 'tech' : 'customer',
      name: data.account?.username || '',
      phone: '',
      email: data.account?.email || '',
    };
    try {
      const [meRes, verRes, infoRes] = await Promise.all([
        hrmssApi.getMe(), hrmssApi.getEmailVerificationStatus(), hrmssApi.getUserProfile().catch(() => null),
      ]);
      if (meRes.ok && meRes.data) {
        account.name = meRes.data.profile?.full_name || meRes.data.account?.username || account.name;
        account.phone = meRes.data.profile?.phone || '';
        account.email = meRes.data.account?.email || account.email;
      }
      // Ngày sinh: GET /users/me -> profile.dateOfBirth (YYYY-MM-DD).
      const info = infoRes?.ok ? (infoRes.data?.user || infoRes.data) : null;
      account.dob = isoToDob(info?.profile?.dateOfBirth);
      if (verRes.ok && verRes.data) account.emailVerified = Boolean(verRes.data.email_verified);
    } catch (meErr) { /* hồ sơ lỗi: vẫn đăng nhập với thông tin tối thiểu */ }
    account.username = data.account?.username || '';
    if (isTech) account.techCode = account.username || account.id;
    return upsertBackendAccount(account);
  };

  useEffect(() => {
    (async () => {
      // Bản native lưu phiên trong SecureStore (sessionStorage/localStorage không có trên điện thoại):
      // mở lại app mà chưa có phiên trên máy -> dùng refresh token đã lưu để vào lại, không phải đăng nhập lại.
      if (!s.auth) {
        const resumed = await hrmssApi.resumeSession().catch(() => null);
        if (resumed?.ok && resumed.data?.account) {
          a.applyAuth(await buildBackendAccount(resumed.data));
          return; // applyAuth tự đồng bộ dữ liệu
        }
      }
      syncFromBackend(s.auth);
    })();
  }, []);

  // Thao tác ghi: gọi server trước. Lỗi -> báo (mã lỗi tiếng Việt nếu có) + tải lại dữ liệu thật, trả false.
  // Thành công -> báo toast + tải lại dữ liệu thật, trả true. Không tự sửa dữ liệu trên máy.
  const serverDone = (res, { title = 'Không thực hiện được', codes = {}, toast, icon = '✓' } = {}) => {
    if (!res?.ok) {
      ui.alert(title, codes[res?.code] || (res?.status > 0 ? res.message : networkError(res)), '⚠️');
      syncFromBackend();
      return false;
    }
    if (toast) ui.toast(toast, icon);
    syncFromBackend();
    return true;
  };
  const notSynced = (what = 'Việc này') => {
    ui.alert('Chưa đồng bộ', `${what} chưa có trên hệ thống. Kéo làm mới rồi thử lại.`, 'ℹ️');
    return false;
  };

  const a = {
    syncFromBackend,
    completeProcedureStep: async (code, step, { status = 'DONE', checkedItems, measurements, photoUris = [], note } = {}) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return { ok: false, error: 'Việc chưa đồng bộ với hệ thống.' };
      const photoIds = [];
      for (const uri of photoUris) {
        const up = await hrmssApi.uploadJobPhoto(o.dbAssignmentId, uri, step.step_no === 1 ? 'BEFORE_REPAIR' : 'AFTER_REPAIR');
        if (!up.ok) return { ok: false, error: up.code === 'FILE_TOO_LARGE' ? 'Ảnh quá lớn.' : (up.message || 'Không tải được ảnh.') };
        photoIds.push(up.data?.attachment?.attachment_id);
      }
      const body = { status };
      if (Array.isArray(checkedItems) && checkedItems.length) body.checked_items = checkedItems;
      if (measurements && Object.keys(measurements).length) body.measurements = measurements;
      if (photoIds.length) body.photo_ids = photoIds;
      if (note) body.note = note;
      const res = await hrmssApi.updateProcedureStep(o.dbAssignmentId, step.step_id, body);
      if (!res.ok) {
        const msg = {
          INVALID_VISIT_STATE: 'Bấm "Đã đến nơi" (check-in) trước khi làm các bước.',
          PHOTO_REQUIRED: 'Bước này cần ít nhất 1 ảnh.',
          MEASUREMENTS_REQUIRED: 'Nhập đủ các chỉ số đo của bước.',
          INVALID_PHOTO: 'Ảnh không thuộc việc này. Chụp lại ảnh.',
          STEP_REQUIRED: 'Bước bắt buộc, không bỏ qua được.',
          PROCEDURE_STEP_NOT_FOUND: 'Không tìm thấy bước này. Làm mới lại việc.',
        }[res.code];
        return { ok: false, code: res.code, error: msg || res.message || 'Không cập nhật được bước.' };
      }
      const proc = res.data?.job?.procedure;
      if (proc !== undefined) updateOrder(code, (ord) => ({ order: { ...ord, procedure: proc } }));
      return { ok: true };
    },
    loadServiceReviews,
    loadServiceDetail,
    // Giỏ hàng
    addToCart: (id, qty = 1, silent = false) => {
      up((p) => {
        const i = p.cart.findIndex((it) => it.id === id);
        const cart = i >= 0 ? p.cart.map((it, j) => (j === i ? { ...it, qty: it.qty + qty } : it)) : [...p.cart, { id, qty }];
        return { cart };
      });
      if (!silent) ui.toast('Đã thêm vào giỏ hàng', '🛒');
    },
    setCartQty: (id, qty) => up((p) => ({ cart: p.cart.map((it) => (it.id === id ? { ...it, qty: Math.max(1, qty) } : it)) })),
    removeFromCart: (id) => up((p) => ({ cart: p.cart.filter((it) => it.id !== id) })),
    clearCart: () => up(() => ({ cart: [] })),

    // Yêu thích
    toggleFav: (id) => {
      const on = s.favorites.includes(id);
      up((p) => ({ favorites: on ? p.favorites.filter((x) => x !== id) : [id, ...p.favorites] }));
      ui.toast(on ? 'Đã bỏ khỏi yêu thích' : 'Đã thêm vào yêu thích', on ? '♡' : '♥');
    },

    // Địa chỉ + hồ sơ (Ghi trực tiếp vào bảng hrmss.service_address trên PostgreSQL)
    // Lưu địa chỉ: gửi backend TRƯỚC (POST/PATCH /customer/addresses). address_text = số nhà + đường; ward_code = phường/xã
    // Hà Nội (backend tự ghép "…, Phường X, Thành phố Hà Nội"). Trả { ok, id } hoặc { ok:false, error }.
    saveAddress: async (addr) => {
      if (!authTokens.get()) return { ok: false, error: 'Vui lòng đăng nhập để lưu địa chỉ.' };
      const cleanPhone = String(addr.phone || s.user?.phone || '').replace(/\D/g, '');
      const existing = addr.id ? s.addresses.find((x) => x.id === addr.id) : null;
      const body = {
        address_text: String(addr.street || addr.full || '').trim(),
        ...(addr.wardCode ? { ward_code: Number(addr.wardCode) } : {}),
        contact_name: addr.name || s.user?.name || '',
        contact_phone: cleanPhone,
        is_default: Boolean(addr.isDefault),
      };
      const res = existing?.dbAddressId
        ? await hrmssApi.updateCustomerAddress(existing.dbAddressId, body)
        : await hrmssApi.createCustomerAddress(body);
      if (!res.ok) {
        const msg = {
          ADDRESS_OUTSIDE_SERVICE_AREA: 'Hiện chỉ phục vụ tại Hà Nội. Chọn phường/xã Hà Nội.',
          WARD_NOT_IN_SERVICE_AREA: 'Phường/xã không thuộc khu vực phục vụ.',
        }[res.code];
        return { ok: false, error: msg || (res.status > 0 ? res.message : networkError(res)) };
      }
      const saved = mapBackendAddressToApp(res.data?.address);
      if (!saved) return { ok: false, error: 'Không đọc được địa chỉ vừa lưu.' };
      up((p) => {
        let list = existing ? p.addresses.map((x) => (x.id === existing.id ? saved : x)) : [...p.addresses.filter((x) => x.id !== saved.id), saved];
        if (saved.isDefault) list = list.map((x) => ({ ...x, isDefault: x.id === saved.id }));
        return {
          addresses: list,
          selectedAddressId: saved.isDefault || !p.selectedAddressId ? saved.id : p.selectedAddressId,
          user: { ...p.user, name: p.user.name || saved.name, phone: p.user.phone || saved.phone },
        };
      });
      ui.toast('Đã lưu địa chỉ', '📍');
      return { ok: true, id: saved.id };
    },
    // Xóa địa chỉ: backend trước, thành công mới bỏ khỏi danh sách.
    deleteAddress: async (id) => {
      const addr = s.addresses.find((x) => x.id === id);
      if (addr?.dbAddressId) {
        const res = await hrmssApi.deleteCustomerAddress(addr.dbAddressId);
        if (!res.ok) { ui.alert('Không xóa được địa chỉ', res.status > 0 ? res.message : networkError(res), '📍'); return false; }
      }
      up((p) => {
        const list = p.addresses.filter((x) => x.id !== id);
        if (list.length && !list.some((x) => x.isDefault)) list[0] = { ...list[0], isDefault: true };
        return { addresses: list, selectedAddressId: p.selectedAddressId === id ? (list[0]?.id || null) : p.selectedAddressId };
      });
      return true;
    },
    selectAddress: (id) => up(() => ({ selectedAddressId: id })),
    // Hồ sơ khách: PATCH /auth/me/profile { full_name, phone } TRƯỚC; thành công mới cập nhật trên máy.
    // Email / ngày sinh backend chưa có trường sửa -> không đổi (email đổi qua tài khoản).
    updateUser: async (u) => {
      const body = {
        ...(u.name ? { full_name: String(u.name).trim() } : {}),
        ...(u.phone !== undefined ? { phone: u.phone ? String(u.phone) : null } : {}),
      };
      const fail = (res) => { ui.alert('Không lưu được', res.status > 0 ? res.message : networkError(res), '⚠️'); return false; };
      if (authTokens.get() && Object.keys(body).length) {
        const res = await hrmssApi.updateProfile(body);
        if (!res.ok) return fail(res);
      }
      if (authTokens.get() && u.dob !== undefined) {
        const res = await hrmssApi.updateMyInfo({ dateOfBirth: dobToIso(u.dob) });
        if (!res.ok) return fail(res);
      }
      up((p) => {
        const nextUser = { ...p.user, name: u.name ?? p.user.name, phone: u.phone ?? p.user.phone, dob: u.dob ?? p.user.dob };
        const nextAuth = p.auth
          ? upsertBackendAccount({ ...p.auth, name: nextUser.name ?? p.auth.name, phone: nextUser.phone ?? p.auth.phone, dob: nextUser.dob })
          : null;
        return { user: nextUser, ...(nextAuth ? { auth: nextAuth } : {}) };
      });
      ui.toast('Đã cập nhật thông tin');
      return true;
    },

    // Đơn hàng (Ghi trực tiếp vào bảng hrmss.service_request, service_request_service, repair_visit)
    // Đặt lịch: POST /customer/requests TRƯỚC; mã đơn, giá, trạng thái lấy từ server. Lỗi thì báo, không tạo đơn trên máy.
    placeOrder: async (payload) => {
      if (s.auth?.role === 'customer' && !s.auth.emailVerified) {
        ui.alert(
          'Chưa xác thực Email',
          `Vui lòng xác thực địa chỉ Email (${s.user?.email || s.auth?.email || ''}) bằng mã OTP 6 chữ số trước khi đặt lịch dịch vụ.`,
          '📧',
        );
        return null;
      }
      if (!authTokens.get()) { ui.alert('Chưa đăng nhập', 'Đăng nhập để đặt lịch.', '🔐'); return null; }
      if (!address?.dbAddressId) {
        ui.alert('Địa chỉ chưa lưu', 'Địa chỉ này chưa lưu lên hệ thống. Mở Sổ địa chỉ, lưu lại rồi đặt lịch.', '📍');
        return null;
      }
      const svc0 = getService(payload.items[0]?.id);
      const items = (payload.items || []).slice(0, 10).map((it) => ({
        service_id: resolveDbServiceId(it.id),
        quantity: Math.min(20, Math.max(1, Number(it.qty) || 1)),
      }));
      const method = PAYMENT_METHODS.find((m) => m.label === payload.payment)?.apiMethod || 'CASH';
      const res = await hrmssApi.createCustomerRequest({
        service_address_id: String(address.dbAddressId),
        preferred_time: buildPreferredTimeIso(payload.dateKey, payload.slot),
        problem_description: payload.note || svc0?.name || null,
        ...(payload.siteCondition?.id ? { site_condition: payload.siteCondition.id } : {}),
        preferred_payment_method: method,
        ...(payload.voucher?.code ? { voucher_code: payload.voucher.code } : {}),
        items,
      });
      if (!res.ok || !res.data?.request) {
        const msg = {
          VOUCHER_NOT_APPLICABLE: 'Mã giảm giá không dùng được cho đơn này.',
          VOUCHER_EXPIRED: 'Mã giảm giá đã hết hạn.',
          VOUCHER_NOT_AVAILABLE: 'Mã giảm giá đã hết lượt dùng.',
          VOUCHER_NOT_FOUND: 'Mã giảm giá không tồn tại.',
          ADDRESS_NOT_FOUND: 'Địa chỉ không còn trong sổ địa chỉ.',
          INVALID_SERVICE: 'Có dịch vụ đã ngừng phục vụ. Tải lại danh sách dịch vụ.',
          DUPLICATE_REQUEST: 'Bạn đã có đơn trùng dịch vụ và khung giờ này.',
        }[res.code];
        ui.alert('Chưa đặt được lịch', msg || (res.status > 0 ? res.message : networkError(res)), '⚠️');
        return null;
      }
      const dbReq = res.data.request;
      const created = mapBackendCustomerRequestToOrder(dbReq, address?.phone || '');
      // Ảnh khách đính kèm: POST /uploads (request_id). Lỗi tải ảnh không làm hỏng đơn đã tạo.
      const pics = (payload.attachments || []).filter((x) => x?.uri).slice(0, 5);
      if (pics.length) {
        Promise.all(pics.map((x) => hrmssApi.uploadRequestPhoto(dbReq.request_id, x.uri).catch(() => null)))
          .then((rs) => { if (rs.some((r) => !r?.ok)) ui.toast('Một số ảnh chưa tải lên được', '⚠️'); });
      }
      up((p) => ({
        orders: created ? [{ ...created, customerAccountId: s.auth?.id || null }, ...p.orders.filter((x) => x.code !== created.code)] : p.orders,
        cart: payload.fromCart ? p.cart.filter((c) => !payload.items.some((it) => it.id === c.id)) : p.cart,
      }));
      syncFromBackend();
      return dbReq.request_code;
    },

    // ------------------------- PHÍA THỢ -------------------------
    // Nhận việc được giao (ghi trực tiếp vào bảng hrmss.technician_assignment & hrmss.service_request)
    // Nhận việc: với đơn ở chợ việc, gọi backend TRƯỚC (POST /technician/jobs/open-requests/:id/accept); chỉ khi
    // backend nhận mới đổi trạng thái trên máy. Đơn hệ thống/văn phòng đã gán (có dbAssignmentId) thì chỉ xác nhận trên máy.
    acceptJob: async (code) => {
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0 || o0.status !== 'pending') {
        ui.alert('Không nhận được', 'Việc không còn ở trạng thái chờ nhận.', 'ℹ️');
        return false;
      }
      let acceptedAssignmentId = o0.dbAssignmentId || null;
      if (!acceptedAssignmentId) {
        if (!authTokens.get() || !o0.dbRequestId) {
          ui.alert('Không nhận được', 'Việc này chưa đồng bộ với hệ thống. Kéo làm mới danh sách việc rồi thử lại.', 'ℹ️');
          return false;
        }
        const res = await hrmssApi.acceptTechnicianOpenRequest(o0.dbRequestId);
        if (!res.ok) {
          const msg = {
            TOO_MANY_ACTIVE_JOBS: `Bạn đang giữ tối đa ${TECH_POLICY.maxActiveJobs} việc. Hoàn thành hoặc trả việc trước khi nhận thêm.`,
            SPECIALTY_MISMATCH: 'Việc này không thuộc chuyên môn của bạn.',
            NOT_ACCEPTING_JOBS: 'Tài khoản đang tạm ngưng nhận việc. Liên hệ điều phối để mở lại.',
            REQUEST_NOT_AVAILABLE: 'Việc đã có thợ khác nhận hoặc không còn chờ nhận.',
          }[res.code];
          ui.alert('Không nhận được', msg || (res.status > 0 ? res.message : networkError(res)), 'ℹ️');
          syncFromBackend();
          return false;
        }
        acceptedAssignmentId = res.data?.job?.assignment_id || null;
      }
      let result = 'missing';
      let targetOrder = null;
      up((p) => {
        const tech0 = p.techProfile || TECH_ME;
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status !== 'pending') { result = 'bad'; return {}; }
        const tech = { ...normalizeTechRep(tech0), ...tech0 };
        const now = Date.now();
        result = 'ok';
        targetOrder = o;
        return {
          orders: p.orders.map((x) => (x.code === code
            ? withStatus(o, 'confirmed', now, { tech: { ...tech }, dispatchNote: null, acceptedAt: now, dbAssignmentId: acceptedAssignmentId || o.dbAssignmentId })
            : x)),
          notifications: pushNotif(p, {
            icon: '👷',
            title: `Thợ ${tech.name} đã nhận đơn ${code}`,
            body: 'Thợ sẽ gọi cho bạn trước khi đến.',
            link: { name: 'order', params: { code } },
          }),
          ...clearDeclined(p, tech0.code, code),
        };
      });
      void targetOrder;
      if (result !== 'ok') {
        ui.alert('Không nhận được', 'Việc không còn ở trạng thái chờ nhận.', 'ℹ️');
        return false;
      }
      ui.toast('Đã nhận việc', '👍');
      syncFromBackend();
      return true;
    },
    // Từ chối việc chưa nhận → không phạt uy tín (chỉ ẩn với đúng thợ này)
    // Từ chối việc chưa nhận (không phạt): việc ở chợ việc -> POST /open-requests/:id/decline;
    // việc hệ thống đã gán cho mình -> trả việc (POST /technician/jobs/:id/release) để backend gán thợ khác.
    declineJob: async (code, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== 'pending') return false;
      if (!authTokens.get() || !o.dbRequestId) return notSynced();
      const why = String(reason || 'Thợ bỏ qua việc').slice(0, 500);
      const res = o.dbAssignmentId
        ? await hrmssApi.releaseTechnicianJob(o.dbAssignmentId, why.length >= 3 ? why : 'Thợ từ chối việc')
        : await hrmssApi.declineTechnicianOpenRequest(o.dbRequestId, why);
      if (!res.ok) return serverDone(res, { title: 'Không từ chối được' });
      up((p) => ({ orders: p.orders.filter((x) => x.code !== code) }));
      return serverDone(res, { toast: 'Đã chuyển việc cho điều phối' });
    },
    // Trả việc sau khi đã nhận — phạt uy tín theo mức (cửa sổ 15 phút / sát giờ / đang đến / đang sửa)
    // Trả việc: POST /technician/jobs/:id/release { reason } TRƯỚC. Backend ghi mức trả việc, tự phát voucher xin lỗi cho
    // khách (nếu đã đi / sát giờ) và tự gán thợ khác. Thành công mới bỏ việc khỏi danh sách của thợ.
    releaseJob: async (code, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || !['confirmed', 'onway', 'diagnosing', 'quoted', 'repairing'].includes(o.status)) {
        ui.alert('Không trả việc được', 'Chỉ trả được việc đang phụ trách (chưa hoàn thành).', 'ℹ️');
        return { ok: false };
      }
      if (!authTokens.get() || !o.dbAssignmentId) {
        ui.alert('Không trả việc được', 'Việc này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.', 'ℹ️');
        return { ok: false };
      }
      const res = await hrmssApi.releaseTechnicianJob(o.dbAssignmentId, String(reason || '').trim() || 'Thợ trả việc');
      if (!res.ok) {
        ui.alert('Không trả việc được', res.status > 0 ? res.message : networkError(res), 'ℹ️');
        return { ok: false };
      }
      up((p) => ({ orders: p.orders.filter((x) => x.code !== code) }));
      const rel = res.data?.release || {};
      ui.toast(rel.reassigned ? 'Đã trả việc · Hệ thống đã gán thợ khác' : 'Đã trả việc cho điều phối', '↩️');
      syncFromBackend();
      return { ok: true, release: rel };
    },
    // Nhắc khách duyệt báo giá đang chờ
    // Nhắc khách duyệt báo giá: POST /technician/jobs/:id/remind-quote (server chống gửi dồn 10 phút).
    remindQuote: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.remindQuotation(o.dbAssignmentId);
      return serverDone(res, {
        title: 'Không gửi được',
        codes: {
          NO_PENDING_QUOTATION: 'Chỉ nhắc được khi đơn đang chờ khách duyệt báo giá.',
          REMIND_TOO_SOON: 'Bạn vừa nhắc khách. Vui lòng đợi ít phút rồi nhắc lại.',
        },
        toast: 'Đã gửi nhắc cho khách',
        icon: '📨',
      });
    },
    // Hồ sơ thợ: tên/SĐT -> PATCH /auth/me/profile; khu vực -> PATCH /technician/profile. Gọi server TRƯỚC.
    // Chuyên môn do admin gán: bỏ qua nếu màn hình nào đó vẫn gửi lên.
    updateTechProfile: async (input) => {
      const { skills: _ignoredSkills, specialties: _ignoredSpecs, specialtyCategoryIds: _ignoredIds, ...patch } = input || {};
      if (!authTokens.get()) return notSynced('Hồ sơ');
      const fail = (res) => { ui.alert('Không lưu được hồ sơ', res.status > 0 ? res.message : networkError(res), '⚠️'); return false; };
      if (patch.name || patch.phone !== undefined) {
        const res = await hrmssApi.updateProfile({
          ...(patch.name ? { full_name: patch.name } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
        });
        if (!res.ok) return fail(res);
      }
      if (patch.area !== undefined) {
        const res = await hrmssApi.updateTechnicianWorkArea(patch.area || null);
        if (!res.ok) return fail(res);
      }
      if (patch.dob !== undefined) {
        const res = await hrmssApi.updateMyInfo({ dateOfBirth: dobToIso(patch.dob) });
        if (!res.ok) return fail(res);
      }
      up((p) => {
        const base = p.techProfile || TECH_ME;
        return {
          techProfile: { ...base, ...patch, ...normalizeTechRep({ ...base, ...patch }) },
          user: {
            ...p.user,
            name: patch.name != null ? patch.name : p.user.name,
            phone: patch.phone != null ? patch.phone : p.user.phone,
            dob: patch.dob != null ? patch.dob : p.user.dob,
          },
        };
      });
      ui.toast('Đã cập nhật hồ sơ thợ');
      return true;
    },
    // Xuất phát: PATCH /technician/jobs/:id/travel (backend báo khách "thợ đang đến"), rồi gửi vị trí GPS thật nếu có.
    startTravel: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== 'confirmed') { ui.alert('Không cập nhật được', 'Chỉ bấm “Đang đến” khi đã nhận việc.', 'ℹ️'); return false; }
      if (o.quote && !o.quote.approved) { ui.alert('Chờ khách đồng ý', 'Khách hàng chưa đồng ý báo giá trên ứng dụng. Thợ chỉ xuất phát sau khi khách đồng ý.', '⏳'); return false; }
      if (!authTokens.get() || !o.dbAssignmentId) { ui.alert('Không cập nhật được', 'Việc này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.', 'ℹ️'); return false; }
      const res = await hrmssApi.travelTechnicianJob(o.dbAssignmentId);
      if (!res.ok) { ui.alert('Không cập nhật được', res.status > 0 ? res.message : networkError(res), '⚠️'); syncFromBackend(); return false; }
      const now = Date.now();
      updateOrder(code, (ord) => ({ order: withStatus(ord, 'onway', now, { travelStartedAt: now, tracking: { updatedAt: now, label: 'Thợ vừa xuất phát' } }) }));
      getCheckInLocation().then((loc) => {
        if (loc) hrmssApi.updateTechnicianLocation({ latitude: loc.lat, longitude: loc.lng, location_accuracy: loc.accuracy, location_sharing_enabled: true }).catch(() => {});
      });
      ui.toast('Đã báo khách: đang di chuyển', '🛵');
      return true;
    },
    // Đang đến: thợ gửi vị trí GPS thật lên server; khách đọc vị trí thật từ GET /customer/requests/:id/tracking.
    tickTracking: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== 'onway' || !authTokens.get()) return;
      if (s.auth?.role === 'tech') {
        const loc = await getCheckInLocation();
        if (loc) {
          hrmssApi.updateTechnicianLocation({ latitude: loc.lat, longitude: loc.lng, location_accuracy: loc.accuracy, location_sharing_enabled: true }).catch(() => {});
          updateOrder(code, (ord) => ({ order: { ...ord, tracking: { ...(ord.tracking || {}), lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, updatedAt: Date.now(), label: 'Đang chia sẻ vị trí với khách' } } }));
        }
        return;
      }
      if (!o.dbRequestId) return;
      const res = await hrmssApi.getRequestTracking(o.dbRequestId);
      if (!res.ok) return;
      const loc = res.data?.location;
      updateOrder(code, (ord) => ({
        order: {
          ...ord,
          tracking: loc
            ? { lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy, updatedAt: loc.recorded_at ? new Date(loc.recorded_at).getTime() : Date.now(), label: 'Vị trí thợ trên đường tới' }
            : { ...(ord.tracking || {}), label: 'Thợ đang di chuyển (chưa có vị trí mới)' },
        },
      }));
      if (res.data?.journey?.arrived_at) syncFromBackend();
    },
    // Check-in: PATCH /technician/jobs/:id/arrive với GPS thật. Backend kiểm tra bán kính, tính trễ, phát voucher bồi thường.
    arrive: async (code, checkIn = null) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== 'onway') { ui.alert('Không check-in được', 'Chỉ check-in khi đang ở trạng thái “Đang đến”.', 'ℹ️'); return false; }
      if (!checkIn || checkIn.lat == null || checkIn.lng == null) {
        ui.alert('Chưa lấy được vị trí', 'Bật định vị (GPS) và cho phép ứng dụng truy cập vị trí rồi check-in lại.', '📍');
        return false;
      }
      if (!authTokens.get() || !o.dbAssignmentId) { ui.alert('Không check-in được', 'Việc này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.', 'ℹ️'); return false; }
      const res = await hrmssApi.arriveTechnicianJob(o.dbAssignmentId, { latitude: checkIn.lat, longitude: checkIn.lng, location_accuracy: checkIn.accuracy });
      if (!res.ok) {
        const msg = {
          TOO_FAR_FROM_CUSTOMER: res.message || 'Bạn đang ở quá xa địa chỉ khách. Đến đúng địa chỉ rồi check-in lại.',
          TRAVEL_NOT_STARTED: 'Bấm “Bắt đầu di chuyển” trước khi check-in.',
          ALREADY_ARRIVED: 'Việc này đã check-in rồi.',
        }[res.code];
        ui.alert('Không check-in được', msg || (res.status > 0 ? res.message : networkError(res)), '📍');
        syncFromBackend();
        return false;
      }
      const lateness = res.data?.lateness || {};
      const now = Date.now();
      const checkInPayload = { lat: checkIn.lat, lng: checkIn.lng, accuracy: checkIn.accuracy, label: checkIn.label || 'Đã xác thực vị trí GPS tại điểm hẹn', at: now };
      updateOrder(code, (ord) => ({
        order: withStatus(ord, 'diagnosing', now, {
          arrivedAt: now,
          checkIn: checkInPayload,
          lateCompensation: lateness.tier && lateness.tier !== 'ok' ? { minutesLate: lateness.minutes_late, tier: lateness.tier, voucherIssued: Boolean(lateness.compensation_voucher_issued), at: now } : null,
          tracking: { ...(ord.tracking || {}), updatedAt: now, label: 'Đã check-in tại nhà khách', lat: checkIn.lat, lng: checkIn.lng },
        }),
      }));
      syncFromBackend();
      if (lateness.tier && lateness.tier !== 'ok') {
        ui.alert(`Check-in muộn ${lateness.minutes_late} phút`,
          lateness.compensation_voucher_issued ? 'Hệ thống đã phát voucher bồi thường cho khách theo chính sách đúng giờ.' : 'Lần sau vui lòng đến đúng khung giờ hẹn.', '⏰');
      } else ui.toast('Đã check-in GPS tại nhà khách', '📍');
      return true;
    },
    // Khách yêu cầu / chuyển đổi sang thanh toán Chuyển khoản QR (VietQR) -> Khoá quyền thu tiền mặt của Thợ
    // Khách đổi sang chuyển khoản VietQR: PATCH /customer/requests/:id/payment-method (thợ sẽ không thu tiền mặt).
    switchToQRPayment: async (code) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || !authTokens.get()) return notSynced('Đơn này');
      const res = await hrmssApi.setPaymentMethod(o.dbRequestId, 'BANK_TRANSFER');
      if (res.ok) updateOrder(code, (x) => ({ order: { ...x, payment: 'Chuyển khoản VietQR', paymentMethod: 'vietqr', qrPaymentRequested: true } }));
      return serverDone(res, {
        title: 'Không đổi được',
        codes: { PAYMENT_IN_PROGRESS: 'Đang có một giao dịch chuyển khoản chờ xác nhận.', REQUEST_CLOSED: 'Đơn đã huỷ.' },
        toast: 'Đã chuyển sang VietQR · Thợ không thu tiền mặt',
        icon: '🏦',
      });
    },
    // Thanh toán:
    //  - 'webhook': VietQRPay đã thấy hóa đơn PAID trên server (SePay báo) -> chỉ tải lại dữ liệu thật.
    //  - 'manual': khách xác nhận đã trả TIỀN MẶT -> POST /customer/requests/:id/payments/confirm { method: CASH }.
    confirmPayment: async (code, mode = 'manual') => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || !authTokens.get()) return notSynced('Đơn này');
      if (mode === 'webhook' || isQRPayment(o)) {
        if (mode === 'webhook') ui.toast('Đã nhận thanh toán chuyển khoản', '✅');
        else ui.alert('Chờ ngân hàng xác nhận', 'Chuyển khoản được hệ thống tự xác nhận khi tiền về. Vui lòng đợi ít phút.', '🏦');
        syncFromBackend();
        return mode === 'webhook';
      }
      const res = await hrmssApi.confirmCashPayment(o.dbRequestId);
      return serverDone(res, {
        title: 'Không xác nhận được',
        codes: {
          NOT_PAYABLE_YET: 'Đơn chưa đến bước thanh toán.',
          NOTHING_TO_PAY: 'Đơn không còn khoản nào phải trả.',
          ALREADY_PAID: 'Đơn đã được thanh toán.',
          PAYMENT_IN_PROGRESS: 'Đang có giao dịch chuyển khoản chờ xác nhận.',
          BANK_TRANSFER_AUTO_CONFIRMED: 'Chuyển khoản được hệ thống tự xác nhận khi tiền về.',
        },
        toast: 'Đã ghi nhận thanh toán tiền mặt',
        icon: '✅',
      });
    },
    dismissTip: (key) => up((p) => ({ tips: { ...(p.tips || {}), [key]: false } })),
    // Mở lại form báo giá để sửa / thêm phát sinh: chỉ là chế độ màn hình trên máy (không đổi dữ liệu server).
    // Đồng bộ giữ chế độ này tới khi thợ gửi báo giá mới (POST /technician/jobs/:id/quotation qua submitQuote).
    reopenQuote: (code) => {
      const now = Date.now();
      let ok = false;
      updateOrder(code, (o) => {
        if (!['quoted', 'repairing'].includes(o.status)) return {};
        ok = true;
        const isOnSite = Boolean(o.arrivedAt || o.checkIn || o.history?.some((h) => h.status === 'diagnosing'));
        return {
          order: withStatus(o, isOnSite ? 'diagnosing' : 'confirmed', now, {
            quote: o.quote ? { ...o.quote, revisionRequested: true } : null,
            quoteEditing: true,
            quoteEditingFrom: o.quote?.dbQuotationId || null,
          }),
        };
      });
      if (ok) ui.toast('Mở lại báo giá để điều chỉnh phát sinh', '✏️');
    },
    // Lập chẩn đoán / báo giá:
    //  - Trước khi xuất phát (confirmed): gửi báo giá trên app, khách đồng ý thì thợ mới đi. Khách huỷ -> 0đ.
    //  - Sau khi kiểm tra tại nhà (diagnosing): gửi báo giá hiện trường. Khách huỷ -> mất phí kiểm tra 100k.
    // Lập chẩn đoán / báo giá: gửi server TRƯỚC (đang ở nhà khách: start + diagnosis rồi quotation).
    // Trạng thái, tổng tiền, thông báo cho khách đều do server tạo; app tải lại sau khi gửi.
    submitQuote: async (code, { diagnosis, symptoms, recommendation, lines }) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || !['diagnosing', 'confirmed', 'quoted', 'repairing'].includes(o.status)) {
        ui.alert('Không gửi được', 'Chỉ gửi báo giá khi đã nhận việc hoặc đang kiểm tra thiết bị.', 'ℹ️');
        return false;
      }
      if (!authTokens.get() || !o.dbAssignmentId) return notSynced();
      if (!Array.isArray(lines) || !lines.length) { ui.alert('Thiếu hạng mục', 'Thêm ít nhất 1 hạng mục vào báo giá.', '🧾'); return false; }
      const aid = o.dbAssignmentId;
      const isPre = o.status === 'confirmed';
      if (!isPre) {
        const findings = (diagnosis && String(diagnosis).trim().length >= 5) ? String(diagnosis).trim() : 'Đã kiểm tra thực tế thiết bị tại nhà khách hàng';
        await hrmssApi.startTechnicianJob(aid).catch(() => null); // đã bắt đầu rồi thì server trả lỗi, bỏ qua
        const dRes = await hrmssApi.submitDiagnosis(aid, {
          symptoms: symptoms || null, findings, repair_recommendation: recommendation || null, needs_quotation: true,
        });
        if (!dRes.ok) return serverDone(dRes, { title: 'Không lưu được chẩn đoán' });
      }
      const items = lines.map((l) => (l.type === 'part'
        ? {
            item_type: 'MATERIAL',
            ...(l.isCustom ? { external_purchase: true } : { material_id: resolveDbMaterialId(l.matId, l.name) }),
            description_snapshot: l.name || 'Linh kiện vật tư',
            quantity: Math.max(1, Number(l.qty) || 1),
            unit_price: Math.max(0, Number(l.price) || 0),
          }
        : {
            item_type: 'SERVICE',
            description_snapshot: l.name || 'Dịch vụ sửa chữa & bảo dưỡng',
            quantity: Math.max(1, Number(l.qty) || 1),
            unit_price: Math.max(0, Number(l.price) || 0),
          }));
      const qRes = await hrmssApi.submitQuotation(aid, {
        quotation_type: o.quote && (o.quote.approved || o.status === 'repairing') ? 'SUPPLEMENTAL' : 'INITIAL',
        items,
      });
      return serverDone(qRes, {
        title: 'Không gửi được báo giá',
        codes: { QUOTATION_PENDING: 'Đang có báo giá chờ khách duyệt.', INVALID_VISIT_STATE: 'Việc chưa ở bước báo giá.', JOB_NOT_ACTIVE: 'Việc không còn được giao cho bạn.' },
        toast: 'Đã gửi báo giá cho khách',
        icon: '🧾',
      });
    },
    // Khách duyệt / yêu cầu sửa báo giá / từ chối & huỷ đơn (Ghi vào hrmss.quotation & service_request)
    // - Nếu thợ chưa đến nhà: huỷ miễn phí 100%. Khách đồng ý thì thợ mới đi.
    // - Chỉ khi thợ đã đến kiểm tra báo giá tại nhà mà khách huỷ thì mới thu phí kiểm tra (100.000đ).
    // Khách duyệt / yêu cầu sửa / từ chối báo giá: POST /customer/requests/:id/quotation-decision.
    // Phí kiểm tra, hoàn voucher, huỷ đơn do server quyết định; app tải lại sau đó.
    respondQuote: async (code, decision, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.quote) return false;
      if (!o.dbRequestId || !authTokens.get()) return notSynced('Đơn này');
      const approve = decision === true || decision === 'approve';
      const res = await hrmssApi.decideQuotation(o.dbRequestId, {
        decision: approve ? 'APPROVED' : (decision === 'revise' ? 'REVISE' : 'REJECTED'),
        rejection_reason: reason || null,
      });
      return serverDone(res, {
        title: 'Không gửi được',
        codes: { NO_PENDING_QUOTATION: 'Báo giá này không còn chờ duyệt.' },
        toast: approve ? 'Đã duyệt báo giá' : (decision === 'revise' ? 'Đã gửi yêu cầu báo giá lại cho thợ' : 'Đã từ chối báo giá'),
        icon: approve ? '✅' : '🔄',
      });
    },
    // Thợ quét / xác thực mã QR của khách hàng tại nhà
    // Tiến độ: POST /technician/jobs/:id/progress (server lưu + báo khách).
    addProgress: async (code, { note, percent }) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.addJobProgress(o.dbAssignmentId, {
        progress_percent: percent != null && percent !== '' ? Math.max(0, Math.min(100, Math.round(Number(percent)))) : undefined,
        note: note ? String(note).trim() : undefined,
      });
      return serverDone(res, { title: 'Không cập nhật được tiến độ', toast: 'Đã cập nhật tiến độ', icon: '📈' });
    },
    // Vật tư: sửa số lượng / xoá theo usage_id trên server (PATCH / DELETE /technician/jobs/:id/materials/:usageId).
    setMaterialQty: async (code, id, qty) => {
      const o = s.orders.find((x) => x.code === code);
      const m = (o?.materials || []).find((x) => x.id === id);
      if (!o?.dbAssignmentId || !m?.dbUsageId || !authTokens.get()) return notSynced('Vật tư này');
      const res = await hrmssApi.updateMaterialUsage(o.dbAssignmentId, m.dbUsageId, Math.max(1, Number(qty) || 1));
      return serverDone(res, { title: 'Không sửa được vật tư', codes: { MATERIAL_USAGE_NOT_FOUND: 'Vật tư này không còn trong việc.' } });
    },
    addMaterial: async (code, mat) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.recordMaterialUsage(o.dbAssignmentId, {
        material_id: resolveDbMaterialId(mat.dbId || mat.id, mat.name),
        used_quantity: 1,
      });
      return serverDone(res, {
        title: 'Không thêm được vật tư',
        codes: { MATERIAL_NOT_FOUND: 'Vật tư không có trong kho của hệ thống.' },
        toast: 'Đã thêm vật tư',
        icon: '🔩',
      });
    },
    removeMaterial: async (code, id) => {
      const o = s.orders.find((x) => x.code === code);
      const m = (o?.materials || []).find((x) => x.id === id);
      if (!o?.dbAssignmentId || !m?.dbUsageId || !authTokens.get()) return notSynced('Vật tư này');
      const res = await hrmssApi.deleteMaterialUsage(o.dbAssignmentId, m.dbUsageId);
      return serverDone(res, { title: 'Không xoá được vật tư', toast: 'Đã xoá vật tư', icon: '🗑️' });
    },
    // Ảnh minh chứng: lưu trên server (POST /uploads job_id + evidence_type; PATCH / DELETE /uploads/:id).
    addEvidence: async (code, { uri, stage, note }) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const type = ({ diagnosis: 'PROBLEM_PHOTO', before: 'BEFORE_REPAIR', after: 'AFTER_REPAIR' })[stage] || 'AFTER_REPAIR';
      const res = await hrmssApi.uploadJobPhoto(o.dbAssignmentId, uri, type, null, note || null);
      return serverDone(res, {
        title: 'Không tải được ảnh',
        codes: { INVALID_PHOTO: 'Ảnh không hợp lệ (chỉ nhận JPG, PNG, WEBP).' },
        toast: stage === 'diagnosis' ? 'Đã thêm ảnh chẩn đoán' : 'Đã thêm ảnh minh chứng',
        icon: '📷',
      });
    },
    removeEvidence: async (code, id) => {
      const o = s.orders.find((x) => x.code === code);
      const e = (o?.evidence || []).find((x) => x.id === id);
      if (!e?.dbAttachmentId || !authTokens.get()) return notSynced('Ảnh này');
      const res = await hrmssApi.deletePhoto(e.dbAttachmentId);
      return serverDone(res, { title: 'Không xoá được ảnh', toast: 'Đã xoá ảnh', icon: '🗑️' });
    },
    updateEvidenceNote: async (code, id, note) => {
      const o = s.orders.find((x) => x.code === code);
      const e = (o?.evidence || []).find((x) => x.id === id);
      if (!e?.dbAttachmentId || !authTokens.get()) return notSynced('Ảnh này');
      const res = await hrmssApi.updatePhotoNote(e.dbAttachmentId, note);
      return serverDone(res, { title: 'Không lưu được ghi chú ảnh' });
    },
    // Biên lai linh kiện mua ngoài: tải ảnh (POST /uploads, DOCUMENT) rồi gắn vào dòng báo giá
    // (PATCH /technician/jobs/:id/quotation-items/:itemId/receipt). Thiếu biên lai thì backend không cho nộp hoàn thành.
    uploadPartReceipt: async (code, itemId, uri) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !itemId || !authTokens.get()) return notSynced();
      const up1 = await hrmssApi.uploadJobPhoto(o.dbAssignmentId, uri, 'DOCUMENT', null, 'Biên lai linh kiện mua ngoài');
      const attId = up1.data?.attachment?.attachment_id;
      if (!up1.ok || !attId) return serverDone(up1, { title: 'Không tải được ảnh biên lai' });
      const res = await hrmssApi.attachPartReceipt(o.dbAssignmentId, itemId, attId);
      return serverDone(res, {
        title: 'Không gắn được biên lai',
        codes: { INVALID_VISIT_STATE: 'Check-in tại nhà khách trước khi gắn biên lai.', NOT_EXTERNAL_PURCHASE: 'Dòng này không phải linh kiện mua ngoài.' },
        toast: 'Đã gắn biên lai',
        icon: '🧾',
      });
    },
    // Nhật ký sửa chữa: ghi chú gửi qua POST /technician/jobs/:id/progress (chỉ note).
    addRepairNote: async (code, text) => {
      const note = String(text || '').trim();
      if (!note) { ui.alert('Thiếu nội dung', 'Nhập ghi chú công việc đã làm.', '📝'); return false; }
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.addJobProgress(o.dbAssignmentId, { note });
      return serverDone(res, { title: 'Không lưu được ghi chú', toast: 'Đã lưu ghi chú sửa chữa', icon: '📝' });
    },
    // Khách sửa đơn còn chờ: PATCH /customer/requests/:id; ảnh mới tải lên POST /uploads (request_id).
    updatePendingRequest: async (code, patch) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbRequestId || !authTokens.get()) return notSynced('Đơn này');
      const body = {
        ...(patch.dateKey && patch.slot ? { preferred_time: buildPreferredTimeIso(patch.dateKey, patch.slot) } : {}),
        ...(patch.note != null ? { problem_description: String(patch.note).slice(0, 1000) || null } : {}),
      };
      const res = await hrmssApi.updateCustomerRequest(o.dbRequestId, body);
      if (res.ok) {
        const fresh = (patch.attachments || []).filter((x) => x?.uri && !x.dbAttachmentId).slice(0, 5);
        if (fresh.length) {
          const rs = await Promise.all(fresh.map((x) => hrmssApi.uploadRequestPhoto(o.dbRequestId, x.uri).catch(() => null)));
          if (rs.some((r) => !r?.ok)) ui.toast('Một số ảnh chưa tải lên được', '⚠️');
        }
      }
      return serverDone(res, {
        title: 'Không sửa được',
        codes: { CANNOT_EDIT: 'Chỉ sửa được khi đơn còn chờ thợ.', EDIT_TOO_LATE: 'Đã quá thời gian được sửa đơn.' },
        toast: 'Đã cập nhật yêu cầu',
        icon: '✏️',
      });
    },
    // Mật khẩu: backend kiểm tra (8-64 ký tự). Lỗi trả { ok:false, error }.
    changePassword: async ({ currentPassword, newPassword }) => {
      if (!s.auth?.id || !authTokens.get()) return { ok: false, error: 'Chưa đăng nhập.' };
      if (String(newPassword || '').length < 8) return { ok: false, error: 'Mật khẩu mới phải có từ 8 đến 64 ký tự.' };
      const res = await hrmssApi.changePassword({ currentPassword, newPassword });
      if (!res.ok) {
        return { ok: false, error: res.code === 'INVALID_CURRENT_PASSWORD' || res.status === 401 ? 'Mật khẩu hiện tại không đúng.' : (res.message || 'Không đổi được mật khẩu.') };
      }
      ui.toast('Đã đổi mật khẩu', '🔐');
      return { ok: true };
    },
    // Quên mật khẩu bước 1: backend gửi mã OTP 6 số tới email của tài khoản (hiệu lực 10 phút).
    requestPasswordReset: async ({ identifier }) => {
      const id = String(identifier || '').trim();
      if (!id) return { ok: false, error: 'Vui lòng nhập email hoặc tên đăng nhập.' };
      const res = await hrmssApi.forgotPassword(id);
      if (!res.ok) return { ok: false, error: res.status > 0 ? (res.message || 'Không gửi được mã.') : 'Không kết nối được máy chủ.' };
      return { ok: true };
    },
    // Bước 2: đặt mật khẩu mới bằng mã OTP.
    resetPassword: async ({ identifier, otp, newPassword }) => {
      if (!/^\d{6}$/.test(String(otp || '').trim())) return { ok: false, error: 'Mã xác nhận gồm đúng 6 chữ số.' };
      if (String(newPassword || '').length < 8) return { ok: false, error: 'Mật khẩu mới phải có từ 8 đến 64 ký tự.' };
      const res = await hrmssApi.resetPassword({ identifier: String(identifier || '').trim(), otp, newPassword });
      if (!res.ok) return { ok: false, error: res.status > 0 ? (res.message || 'Mã không đúng hoặc đã hết hạn.') : 'Không kết nối được máy chủ.' };
      ui.toast('Đã đặt lại mật khẩu. Hãy đăng nhập lại.', '🔐');
      return { ok: true };
    },
    // Biên bản hoàn thành → chuyển sang Chờ văn phòng duyệt nghiệm thu
    // Nộp biên bản: gửi backend TRƯỚC (PATCH /technician/jobs/:id/complete). Backend từ chối (vd. chưa xong các bước
    // bắt buộc -> 409 PROCEDURE_INCOMPLETE) thì báo thợ và KHÔNG đổi trạng thái trên máy. Trả true khi nộp được.
    completeJob: async (code, { summary, paid, safetyChecklist, customerSignature }) => {
      const now = Date.now();
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0 || o0.status !== 'repairing') {
        ui.alert('Không hoàn thành được', 'Chỉ hoàn thành khi đang ở trạng thái sửa chữa.', 'ℹ️');
        return false;
      }
      if (!authTokens.get() || !o0.dbAssignmentId) {
        ui.alert('Chưa nộp được biên bản', 'Việc này chưa đồng bộ với hệ thống. Kéo làm mới danh sách việc rồi thử lại.', 'ℹ️');
        return false;
      }
      const cleanSummary = (summary && String(summary).trim().length >= 5)
        ? String(summary).trim()
        : 'Đã hoàn thành sửa chữa & bảo dưỡng thiết bị theo quy trình chuẩn.';
      const res = await hrmssApi.completeTechnicianJob(o0.dbAssignmentId, {
        work_performed: cleanSummary,
        testing_result: Array.isArray(safetyChecklist) && safetyChecklist.length > 0
          ? safetyChecklist.join('; ')
          : 'Đã vận hành chạy thử thiết bị ổn định (≥15 phút)',
        handover_result: paid
          ? 'Đã thu tiền dịch vụ, bàn giao thiết bị và kích hoạt bảo hành điện tử'
          : 'Đã bàn giao thiết bị cho khách hàng và kích hoạt bảo hành điện tử',
        cash_collected: Boolean(paid) && !isQRPayment(o0),
      });
      if (!res.ok) {
        if (res.code === 'PROCEDURE_INCOMPLETE') {
          const missing = (res.errors || []).map((e) => `• ${e.message}`).join('\n');
          ui.alert('Chưa xong các bước thực hiện', `Đánh dấu xong các bước bắt buộc trong thẻ "Các bước thực hiện" rồi nộp lại.${missing ? `\n\n${missing}` : ''}`, '📋');
        } else if (res.code === 'RECEIPT_REQUIRED') {
          const missing = (res.errors || []).map((e) => `• ${e.message}`).join('\n');
          ui.alert('Thiếu biên lai linh kiện', `Gắn ảnh biên lai cho từng linh kiện mua ngoài (thẻ "Biên lai linh kiện mua ngoài") rồi nộp lại.${missing ? `\n\n${missing}` : ''}`, '🧾');
        } else {
          const msg = { CUSTOMER_PAYS_BY_QR: 'Khách trả bằng chuyển khoản VietQR, thợ không thu tiền mặt.' }[res.code];
          ui.alert('Chưa nộp được biên bản', msg || (res.status > 0 ? (res.message || 'Vui lòng thử lại.') : networkError(res)), '⚠️');
        }
        return false;
      }
      // Trạng thái, điểm thưởng, bảo hành do server xử lý; app chỉ lưu chữ ký / checklist vừa nhập rồi tải lại.
      updateOrder(code, (o) => ({
        order: {
          ...o,
          report: {
            ...(o.report || {}),
            summary: cleanSummary,
            at: now,
            safetyChecklist: safetyChecklist || [],
            customerSignature: customerSignature || null,
          },
        },
      }));
      ui.toast(Boolean(paid) && !isQRPayment(o0) ? 'Đã nộp biên bản · Chờ Văn phòng nghiệm thu' : 'Đã nộp biên bản · Chờ khách kiểm tra & thanh toán', '🏢');
      syncFromBackend();
      return true;
    },
    // Thợ kết luận ngoài bảo hành: POST /technician/jobs/:id/out-of-warranty (đơn chuyển sang sửa có phí).
    rejectWarrantyAsOutOfWarranty: async (code, reason) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const r = reason || 'Hư hỏng do rơi vỡ/ngoại lực tác động, không thuộc phạm vi bảo hành.';
      const res = await hrmssApi.markOutOfWarranty(o.dbAssignmentId, r);
      return serverDone(res, {
        title: 'Không cập nhật được',
        codes: { NOT_WARRANTY_REQUEST: 'Đơn này không phải đơn bảo hành.', ALREADY_OUT_OF_WARRANTY: 'Đơn đã được ghi nhận ngoài bảo hành.' },
        toast: 'Đã ghi nhận ngoài bảo hành · Chuyển sang báo giá',
        icon: '📋',
      });
    },
    // Hẹn tái khám: POST /technician/jobs/:id/follow-up (văn phòng xếp lịch).
    requestFollowUp: async (code, reason, remainingWork) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o?.dbAssignmentId || !authTokens.get()) return notSynced();
      const res = await hrmssApi.requestJobFollowUp(o.dbAssignmentId, reason || 'Chờ linh kiện phụ tùng', remainingWork || null);
      return serverDone(res, { title: 'Không gửi được', toast: 'Đã ghi nhận yêu cầu hẹn tái khám', icon: '📅' });
    },
    readTechNotif: (id) => {
      const n = (s.techNotifs || []).find((x) => x.id === id);
      if (n?.dbNotificationId && !n.read) hrmssApi.markNotificationRead(n.dbNotificationId).catch(() => {});
      up((p) => ({ techNotifs: p.techNotifs.map((x) => (x.id === id ? { ...x, read: true } : x)) }));
    },
    readAllTech: () => {
      hrmssApi.markAllNotificationsRead().catch(() => {});
      up((p) => ({ techNotifs: p.techNotifs.map((n) => ({ ...n, read: true })) }));
    },
    clearAllTechNotifs: () => {
      // Backend không xóa thông báo: đánh dấu đã đọc và ẩn các thông báo tới thời điểm này.
      hrmssApi.markAllNotificationsRead().catch(() => {});
      up(() => ({ techNotifs: [], techNotifClearedAt: Date.now() }));
      ui.toast('Đã dọn sạch thông báo');
    },
    // Đăng nhập / Đăng ký — phân quyền & tách biệt dữ liệu theo tài khoản
    applyAuth: (account, link) => {
      up((p) => ({
        ...switchCustomerSlice(p, account),
        auth: account,
        role: account.role,
        user: {
          name: account.name || '',
          phone: account.phone || '',
          email: account.email || '',
        },
        techProfile: account.role === 'tech' ? mergeTechProfile(p.techProfile, account) : p.techProfile,
      }));
      setStack(link ? [{ name: link.name, params: link.params || {}, key: uid() }] : []);
      setTab(account.role === 'tech' ? 'tech-jobs' : 'home');
      syncFromBackend(account);
    },
    login: async (payload) => {
      let backendAccount = null;
      try {
        const beRes = await hrmssApi.login({
          identifier: payload.identifier || payload.phone,
          password: payload.password,
        });
        if (beRes.ok && beRes.data) {
          backendAccount = await buildBackendAccount(beRes.data);
        } else {
          return {
            ok: false,
            error: authErrorMessage(beRes, 'login'),
          };
        }
      } catch (e) {
        return { ok: false, error: authErrorMessage({ status: 0 }, 'login') };
      }

      const res = { ok: true, account: backendAccount };
      up((p) => ({
        ...switchCustomerSlice(p, res.account),
        auth: res.account,
        role: res.account.role,
        user: {
          name: res.account.name || '',
          username: res.account.username || '',
          email: res.account.email || '',
          phone: res.account.phone || '',
        },
        techProfile: res.account.role === 'tech' ? mergeTechProfile(p.techProfile, res.account) : p.techProfile,
      }));
      setStack([]);
      setTab(res.account.role === 'tech' ? 'tech-jobs' : 'home');
      await syncFromBackend(res.account);
      ui.toast(res.account.role === 'tech' ? 'Đăng nhập app Thợ thành công' : 'Đăng nhập thành công', '👋');
      return res;
    },
    register: async (payload) => {
      const cleanName = String(payload.name || '').trim();
      const cleanEmail = String(payload.email || '').trim().toLowerCase();
      const cleanUsername = String(payload.username || '').trim().toLowerCase().replace(/\s+/g, '');
      const cleanPhone = String(payload.phone || '').replace(/\D/g, '');
      const cleanAddress = String(payload.address || '').trim();
      const pw = String(payload.password || '');

      if (cleanName.length < 2) {
        return { ok: false, error: 'Vui lòng nhập họ và tên (tối thiểu 2 ký tự).' };
      }
      if (!cleanUsername) {
        return { ok: false, error: 'Vui lòng nhập Tên đăng nhập (Username).' };
      }
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { ok: false, error: 'Vui lòng nhập địa chỉ Email hợp lệ.' };
      }
      if (pw.length < 8) {
        return { ok: false, error: 'Mật khẩu phải có từ 8 đến 64 ký tự (theo chuẩn bảo mật máy chủ).' };
      }

      let backendAccount = null;
      try {
        const beRes = await hrmssApi.register({
          username: cleanUsername,
          email: cleanEmail,
          password: pw,
          confirm_password: pw,
          full_name: cleanName,
          ...(cleanAddress ? { address: cleanAddress } : {}),
          ...(cleanPhone ? { phone: cleanPhone } : {}),
        });
        if (!beRes.ok) {
          if (beRes.status > 0) {
            return { ok: false, error: authErrorMessage(beRes, 'register') };
          }
        } else {
          const createdUser = beRes.data?.account;
          const loginRes = await hrmssApi.login({ identifier: cleanUsername, password: pw });
          const userId = loginRes.data?.user_id || createdUser?.user_id || Date.now();
          const roleCode = String(loginRes.data?.role || createdUser?.role?.role_code || 'CUSTOMER').toUpperCase();
          const isTech = roleCode === 'TECHNICIAN' || roleCode === 'TECH' || payload.role === 'tech';
          backendAccount = upsertBackendAccount({
            id: `be-${userId}`,
            role: isTech ? 'tech' : 'customer',
            username: cleanUsername,
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            emailVerified: false,
            ...(isTech ? { techCode: cleanUsername } : {}),
          });
        }
      } catch (e) {
        return { ok: false, error: authErrorMessage({ status: 0 }, 'register') };
      }
      if (!backendAccount) {
        return { ok: false, error: authErrorMessage({ status: 0 }, 'register') };
      }
      const res = { ok: true, account: backendAccount };
      up((p) => ({
        ...switchCustomerSlice(p, res.account),
        auth: res.account,
        role: res.account.role,
        user: {
          name: res.account.name || '',
          username: res.account.username || '',
          email: res.account.email || '',
          phone: res.account.phone || '',
        },
        techProfile: res.account.role === 'tech' ? mergeTechProfile(p.techProfile, res.account) : p.techProfile,
      }));
      setStack([]);
      setTab(res.account.role === 'tech' ? 'tech-jobs' : 'home');
      await syncFromBackend(res.account);
      ui.toast(res.account.role === 'tech' ? 'Tạo tài khoản Thợ thành công' : 'Tạo tài khoản thành công', '🎉');
      return res;
    },
    sendEmailOtp: async () => {
      const targetEmail = s.user?.email || s.auth?.email || '';
      if (!targetEmail) {
        return { ok: false, error: 'Tài khoản chưa có địa chỉ Email. Vui lòng cập nhật Email trong Thông tin cá nhân.' };
      }
      if (authTokens.get()) {
        const res = await hrmssApi.sendEmailVerificationOtp();
        if (res.ok && res.data) {
          if (res.data.email_verified) {
            up((p) => ({
              auth: p.auth ? upsertBackendAccount({ ...p.auth, emailVerified: true }) : p.auth,
            }));
            ui.toast('Email của bạn đã được xác thực!', '✅');
            return { ok: true, alreadyVerified: true };
          }
          up((p) => ({
            notifications: pushNotif(p, {
              icon: '📧',
              title: 'Mã xác thực Email đã được gửi',
              body: `Hệ thống vừa gửi mã xác thực 6 chữ số tới ${res.data.email || targetEmail} (hiệu lực 5 phút). Vui lòng kiểm tra hộp thư.`,
            }),
          }));
          ui.toast(`Đã gửi mã xác thực tới ${res.data.email || targetEmail}`, '📧');
          return { ok: true, email: res.data.email || targetEmail };
        }
        return { ok: false, error: res.message || 'Không thể gửi mã OTP. Vui lòng thử lại.' };
      }
      return { ok: false, error: 'Vui lòng đăng nhập lại để nhận mã xác thực email.' };
    },
    verifyEmailOtp: async (otpInput) => {
      const cleanOtp = String(otpInput || '').replace(/\D/g, '').trim();
      if (cleanOtp.length !== 6) {
        return { ok: false, error: 'Vui lòng nhập đủ 6 chữ số của mã xác thực OTP.' };
      }
      if (!authTokens.get()) return { ok: false, error: 'Vui lòng đăng nhập lại để xác thực email.' };
      const res = await hrmssApi.verifyEmailOtp(cleanOtp);
      if (!res.ok) {
        return { ok: false, error: res.message || 'Mã xác thực OTP không chính xác.' };
      }
      up((p) => {
        const nextAuth = p.auth ? upsertBackendAccount({ ...p.auth, emailVerified: true }) : p.auth;
        return {
          ...(nextAuth ? { auth: nextAuth } : {}),
          pendingEmailOtp: null,
          notifications: pushNotif(p, {
            icon: '✅',
            title: 'Đã xác thực Email thành công',
            body: `Địa chỉ ${p.user?.email || p.auth?.email || ''} đã được xác thực. Bạn có thể đặt lịch dịch vụ ngay!`,
          }),
        };
      });
      ui.toast('Xác thực Email thành công!', '✅');
      return { ok: true };
    },
    // Chuyển màn hình theo phân quyền tài khoản đang đăng nhập
    setRole: (role, link) => {
      if (!s.auth) {
        ui.alert('Cần đăng nhập', 'Hãy đăng nhập bằng tài khoản Khách hàng hoặc Thợ để tiếp tục.', '🔐');
        return;
      }
      if (s.auth.role !== role) {
        ui.alert(
          'Sai phân quyền',
          role === 'tech'
            ? 'Tài khoản hiện tại là Khách hàng. Đăng xuất rồi đăng nhập bằng tài khoản Kỹ thuật viên.'
            : 'Tài khoản hiện tại là Thợ. Đăng xuất rồi đăng nhập bằng tài khoản Khách hàng.',
          '🚫',
        );
        return;
      }
      setStack(link ? [{ name: link.name, params: link.params || {}, key: uid() }] : []);
      setTab(role === 'tech' ? 'tech-jobs' : 'home');
    },

    // Hủy đơn: gửi backend TRƯỚC (PATCH /customer/requests/:id/cancel); backend từ chối thì giữ nguyên đơn và báo lý do.
    cancelOrder: async (code, reason) => {
      const now = Date.now();
      const cur = s.orders.find((x) => x.code === code);
      if (!cur || !['pending', 'confirmed'].includes(cur.status)) {
        ui.alert('Không huỷ được', 'Chỉ huỷ khi thợ chưa bắt đầu di chuyển. Sau đó vui lòng gọi hotline.', 'ℹ️');
        return false;
      }
      const cancelCheck = getCancellationWindowStatus(cur, now);
      if (!cancelCheck.allowed) {
        ui.alert(
          'Không thể huỷ đơn',
          cancelCheck.reason || 'Không thể huỷ đơn khi còn dưới 1 tiếng trước giờ hẹn với thợ. Vui lòng gọi Hotline 1900 6868.',
          '⚠️'
        );
        return false;
      }
      if (!authTokens.get() || !cur.dbRequestId) {
        ui.alert('Không huỷ được', 'Đơn này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.', 'ℹ️');
        return false;
      }
      const res = await hrmssApi.cancelCustomerRequest(cur.dbRequestId, reason || 'Khách hàng hủy đơn qua ứng dụng');
      if (!res.ok) {
        const msg = {
          CANCEL_TOO_LATE: 'Còn dưới 1 giờ tới giờ hẹn nên không tự huỷ được. Vui lòng gọi hotline.',
          CANNOT_CANCEL: 'Thợ đã bắt đầu di chuyển / đang làm, không tự huỷ được nữa. Vui lòng gọi hotline.',
        }[res.code];
        ui.alert('Không huỷ được', msg || (res.status > 0 ? res.message : networkError(res)), '⚠️');
        syncFromBackend();
        return false;
      }
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || !['pending', 'confirmed'].includes(o.status)) return {};
        const refund = o?.voucher?.wallet ? [o.voucher, ...p.myVouchers] : p.myVouchers;
        return {
          orders: p.orders.map((x) => (x.code === code ? { ...x, status: 'cancelled', cancelReason: reason, history: [...x.history, { status: 'cancelled', at: now }] } : x)),
          myVouchers: refund,
          notifications: pushNotif(p, { icon: '✖️', title: `Đã huỷ đơn ${code}`, body: reason || 'Bạn đã huỷ đơn.', link: { name: 'order', params: { code } } }),
          techNotifs: pushTech(p, { icon: '✖️', title: `Khách đã huỷ đơn ${code}`, body: reason || '', link: { name: 'tech-job', params: { code } } }),
        };
      });
      ui.toast('Đã huỷ đơn hàng');
      syncFromBackend();
      return true;
    },
    // Đánh giá: POST /customer/requests/:id/review. Điểm thưởng, điểm TB của thợ do server tính; app tải lại.
    rateOrder: async (code, stars, text) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== 'done' || o.rating) return false;
      if (!o.dbRequestId || !authTokens.get()) return notSynced('Đơn này');
      const res = await hrmssApi.reviewCustomerRequest(o.dbRequestId, {
        rating: stars, review_text: text || null, punctuality_rating: stars, attitude_rating: stars, expertise_rating: stars,
      });
      if (res.ok) updateOrder(code, (x) => ({ order: { ...x, rating: { stars, text } } }));
      return serverDone(res, {
        title: 'Không gửi được đánh giá',
        codes: { REVIEW_ALREADY_EXISTS: 'Bạn đã đánh giá đơn này.', REQUEST_NOT_COMPLETED: 'Chỉ đánh giá được đơn đã hoàn thành.' },
        toast: 'Cảm ơn bạn đã đánh giá!',
        icon: '⭐',
      });
    },
    // Yêu cầu bảo hành: backend tạo đơn bảo hành (WARRANTY_PENDING), văn phòng thẩm định trên web.
    // Trả mã đơn bảo hành mới (để mở màn đơn), lỗi thì báo và trả null.
    requestWarranty: async (code, note) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o) return null;
      const info = warrantyInfo(o, s.orders, s.lifetimePoints);
      if (!info.ok) {
        ui.alert('Không thể gửi yêu cầu', info.text, '🛡️');
        return info.openCode || null;
      }
      if (!authTokens.get() || !o.dbRequestId) {
        ui.alert('Chưa gửi được yêu cầu', 'Đơn này chưa đồng bộ với hệ thống. Kéo làm mới rồi thử lại.', '🛡️');
        return null;
      }
      const res = await hrmssApi.requestWarranty(o.dbRequestId, note || null);
      if (!res.ok) {
        const msg = {
          WARRANTY_NOT_STARTED: 'Bảo hành chỉ bắt đầu khi đơn đã hoàn thành.',
          WARRANTY_EXPIRED: 'Đơn đã hết thời hạn bảo hành.',
          WARRANTY_ALREADY_OPEN: 'Đơn này đang có một yêu cầu bảo hành chưa xử lý xong.',
        }[res.code];
        ui.alert('Không thể gửi yêu cầu', msg || (res.status > 0 ? res.message : networkError(res)), '🛡️');
        return null;
      }
      const created = mapBackendCustomerRequestToOrder(res.data?.request, o.customerPhone);
      if (created) {
        up((p) => ({ orders: [{ ...created, warrantyOf: code, customerAccountId: o.customerAccountId || p.auth?.id || null }, ...p.orders.filter((x) => x.code !== created.code)] }));
      }
      ui.toast('Đã gửi yêu cầu bảo hành · Chờ Văn phòng thẩm định', '🛡️');
      syncFromBackend();
      return created?.code || null;
    },

    // Điểm thưởng
    redeem: async (optId) => {
      const opt = (s.redeemOptions || []).find((x) => x.id === String(optId));
      if (!opt) return false;
      if (s.points < opt.cost) { ui.alert('Chưa đủ điểm', `Bạn cần ${opt.cost} điểm, hiện có ${s.points} điểm. Hoàn thành đơn hoặc đánh giá để tích thêm điểm.`, '🎯'); return false; }
      const res = await hrmssApi.redeemVoucher(opt.id);
      if (!res.ok) {
        ui.alert('Chưa đổi được điểm', res.code === 'INSUFFICIENT_POINTS' ? 'Số điểm hiện có không đủ để đổi ưu đãi này.' : (res.message || 'Vui lòng thử lại.'), '🎯');
        return false;
      }
      const v = mapWalletVoucher(res.data?.voucher);
      up((p) => ({
        points: res.data?.points ?? p.points,
        myVouchers: v ? [v, ...p.myVouchers.filter((x) => x.code !== v.code)] : p.myVouchers,
      }));
      ui.toast(v ? `Đã nhận voucher ${v.code}` : 'Đổi điểm thành công', '🎁');
      syncFromBackend();
      return true;
    },

    // Thông báo
    readNotif: (id) => {
      const n = s.notifications.find((x) => x.id === id);
      if (n?.dbNotificationId && !n.read) hrmssApi.markNotificationRead(n.dbNotificationId).catch(() => {});
      up((p) => ({ notifications: p.notifications.map((x) => (x.id === id ? { ...x, read: true } : x)) }));
    },
    readAll: () => {
      hrmssApi.markAllNotificationsRead().catch(() => {});
      up((p) => ({ notifications: p.notifications.map((n) => ({ ...n, read: true })) }));
    },
    clearAllNotifs: () => {
      hrmssApi.markAllNotificationsRead().catch(() => {});
      up(() => ({ notifications: [], notifClearedAt: Date.now() }));
      ui.toast('Đã dọn sạch thông báo');
    },

    // Tìm kiếm
    addSearch: (q) => { const t = q.trim(); if (!t) return; up((p) => ({ searches: [t, ...p.searches.filter((x) => x !== t)].slice(0, 8) })); },
    clearSearches: () => up(() => ({ searches: [] })),

    logout: () => {
      hrmssApi.logout();
      clearSession();
      up((p) => ({ ...switchCustomerSlice(p, null), auth: null, role: 'customer', techProfile: null }));
      setStack([]);
      setTab('home');
      ui.toast('Đã đăng xuất');
    },
    // Xoá tài khoản: DELETE /auth/me (cần mật khẩu). Server xoá xong mới xoá dữ liệu trên máy.
    deleteAccount: async (password) => {
      if (!password) { ui.alert('Thiếu mật khẩu', 'Nhập mật khẩu để xác nhận xoá tài khoản.', '🔐'); return false; }
      const res = await hrmssApi.deleteMyAccount(password);
      if (!res.ok) {
        const msg = {
          UNAUTHENTICATED: 'Mật khẩu không đúng.',
          HAS_OPEN_REQUESTS: 'Bạn còn đơn đang xử lý. Hoàn thành hoặc huỷ các đơn đó trước khi xoá tài khoản.',
        }[res.code];
        ui.alert('Không xoá được tài khoản', msg || (res.status > 0 ? res.message : networkError(res)), '⚠️');
        return false;
      }
      const currentId = s.auth?.id;
      if (currentId) deleteAccountById(currentId);
      hrmssApi.logout();
      clearSession();
      up((p) => ({
        ...switchCustomerSlice(p, null),
        auth: null,
        role: 'customer',
        techProfile: null,
        user: { name: '', phone: '', email: '' },
        cart: [],
      }));
      setStack([]);
      setTab('home');
      ui.toast('Đã xoá tài khoản', '🗑️');
      return true;
    },
    wipeLocalData: () => {
      hrmssApi.logout();
      clearSession();
      storage.clear();
      setS({ ...makeInitial(), auth: null });
      setStack([]);
      setTab('home');
      ui.toast('Đã xoá dữ liệu trên thiết bị');
    },
  };

  const myCode = s.techProfile?.code || TECH_ME.code;
  const techRep = normalizeTechRep(s.techProfile || {});
  const techLocked = isTechLocked(s.techProfile);
  const custPhone = s.auth?.role === 'customer' ? s.auth.phone : null;
  const custAccId = s.auth?.role === 'customer' ? s.auth.id : null;
  const visibleCustomerOrders = s.auth?.role === 'customer'
    ? s.orders.filter((o) => isOrderOfCustomer(o, custPhone, custAccId))
    : s.orders;
  const viewS = s.auth?.role === 'customer' ? { ...s, orders: visibleCustomerOrders } : s;
  const meTech = s.techProfile || TECH_ME;

  const derived = {
    address,
    cartCount: s.cart.reduce((sum, it) => sum + it.qty, 0),
    unread: s.notifications.filter((n) => !n.read).length,
    activeOrders: visibleCustomerOrders.filter(isActiveOrder),
    // Phía thợ
    techUnread: (s.techNotifs || []).filter((n) => !n.read).length,
    newJobs: s.orders
      .filter((o) => {
        if (o.status !== 'pending') return false;
        if (declinedFor(s, myCode).includes(o.code)) return false;
        return true;
      })
      .sort((a, b) => {
        const ma = matchJobForTech(a, meTech);
        const mb = matchJobForTech(b, meTech);
        if (mb.matchScore !== ma.matchScore) return mb.matchScore - ma.matchScore;
        return (b.createdAt || 0) - (a.createdAt || 0);
      }),
    myJobs: s.orders.filter((o) => o.tech?.code === myCode),
    workingJobs: s.orders.filter((o) => o.tech?.code === myCode && isActiveOrder(o)),
    declinedCodes: declinedFor(s, myCode),
    roleHint: urlRoleHint(),
    techReputation: techRep.reputation,
    techLocked,
    techLockReason: techLocked ? techLockReason(s.techProfile) : '',
    techViolations: techRep.violations,
  };

  const value = {
    s: viewS, a, nav, ui, d: derived,
    svc, setSvc, actFilter, setActFilter, warrantyQuery, setWarrantyQuery, warrantyNonce,
    pendingVoucher, setPendingVoucher,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
