import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform } from 'react-native';
import {
  getService, TECH_ME, formatVND, catLabel, HOTLINE, serviceKind, matchJobForTech, CATEGORIES, SERVICES,
  tierOf, comboDiscountFor, syncCatalogFromBackend, syncPolicyFromBackend, resolveDbServiceId,
} from '../constants/data';
export { matchJobForTech, comboDiscountFor } from '../constants/data';
import {
  getSession, clearSession, urlRoleHint, setSession, upsertBackendAccount, deleteAccountById,
} from '../services/authService';
import { hrmssApi, authTokens } from '../services/api';
import { API_BASE_URL } from '../constants/config';
import { authErrorMessage } from '../utils/authErrorMessages';
import { readTechnicianSpecialties } from '../utils/techProfile';

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
} from '../services/syncService';
import {
  TECH_POLICY, normalizeTechRep, isTechLocked, techLockReason, assessCancelAfterAccept, assessLateness,
  applyTechPenalty, applyTechBonus, mintWalletVoucher, slotStartTs, getCancellationWindowStatus,
} from '../constants/techPolicy';
import { advanceTracking } from '../utils/geo';
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
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'onway', 'diagnosing', 'quoted', 'repairing', 'pending_review', 'warranty_pending', 'out_of_warranty'];
export const isActiveOrder = (o) => ACTIVE_STATUSES.includes(o.status);
// Giá trị dịch vụ khách đã đặt (sau giảm giá dịch vụ + combo, trước voucher)
export const bookedValue = (o) => (
  o.kind === 'warranty' ? 0 : Math.max(0, (o.goods || 0) - (o.productDiscount || 0) - (o.comboDiscount || 0))
);
/** Ưu đãi giảm giá vật tư/linh kiện phát sinh theo Hạng thành viên (Vàng -5%, Kim cương -10%) */
export const tierPartDiscountAmount = (o) => {
  const pct = Number(o?.tierPartDiscountPercent || 0);
  if (!pct || !o?.quote?.lines?.length) return 0;
  const partsSum = o.quote.lines
    .filter((l) => l.type === 'part')
    .reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  return Math.round((partsSum * pct) / 100);
};
/** Số tiền giảm do thợ đến muộn (theo % nhân công, có trần) */
export const lateDiscountAmount = (o) => {
  const lc = o?.lateCompensation;
  if (!lc?.percent) return 0;
  const labor = o.quote?.total != null ? o.quote.total : bookedValue(o);
  const raw = Math.round(Math.max(0, labor) * (lc.percent / 100));
  const cap = lc.maxDiscount != null ? lc.maxDiscount : (lc.percent >= 50 ? 200000 : 100000);
  return Math.min(raw, cap);
};
// Số tiền khách phải trả: đơn huỷ có phí kiểm tra -> phí kiểm tra; báo giá (nếu có) − ưu đãi vật tư theo hạng − voucher − bồi thường đến muộn
export const orderTotal = (o) => {
  if (o.kind === 'warranty' || o.kind === 'followup') return 0;
  if (o.status === 'cancelled') return o.inspectionFee || 0;
  if (o.quote && (o.quote.approved || o.status === 'quoted')) {
    const raw = o.quote.total - tierPartDiscountAmount(o) - (o.voucherDiscount || 0) - lateDiscountAmount(o);
    return Math.max(0, raw);
  }
  const base = o.finalTotal != null ? o.finalTotal : o.total;
  return Math.max(0, base - lateDiscountAmount(o));
};

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
  const totalDays = o?.warrantyDays || tierOf(lifetimePoints || 0).cur.warrantyDays || 60;
  if (o.status === 'cancelled') return { ok: false, totalDays, text: 'Đơn đã huỷ nên không được bảo hành.' };
  if (o.kind === 'warranty') return { ok: false, totalDays, text: 'Đây là đơn bảo hành.' };
  const open = orders.find((x) => x.kind === 'warranty' && x.warrantyOf === o.code && isActiveOrder(x));
  if (open) return { ok: false, pending: true, totalDays, openCode: open.code, text: `Đã có yêu cầu bảo hành ${open.code} đang xử lý.` };
  const covered = o.items.filter((it) => ['clean', 'gas', 'repair', 'install'].includes(serviceKind(getService(it.id))));
  if (!covered.length) return { ok: false, totalDays, text: `Đơn này là gói dịch vụ định kỳ riêng, không thuộc diện bảo hành ${totalDays} ngày.` };
  if (o.status !== 'done') return { ok: false, pending: true, totalDays, text: `Bảo hành ${totalDays} ngày sẽ bắt đầu khi đơn hoàn thành.` };
  const left = Math.ceil((o.doneAt + totalDays * DAY - Date.now()) / DAY);
  if (left <= 0) return { ok: false, totalDays, text: `Đơn đã hết thời hạn bảo hành ${totalDays} ngày.` };
  return {
    ok: true,
    totalDays,
    daysLeft: left,
    until: o.doneAt + totalDays * DAY,
    text: `Còn ${left}/${totalDays} ngày bảo hành (đến ${fmtDate(o.doneAt + totalDays * DAY)}).`,
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
    skills: same?.skills?.length ? same.skills : TECH_ME.skills,
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
  techOnline: true,
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
          const trackings = await Promise.all(needTech.map((r) => hrmssApi.getRequestTracking(r.request_id).catch(() => null)));
          needTech.forEach((r, i) => {
            const t = trackings[i];
            if (t?.ok && t.data?.technician) r.technician = t.data.technician;
          });
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
            ? jobsRes.data.items.map((j) => mapBackendTechJobToOrder(j, techProf)).filter(Boolean)
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
      const [meRes, verRes] = await Promise.all([hrmssApi.getMe(), hrmssApi.getEmailVerificationStatus()]);
      if (meRes.ok && meRes.data) {
        account.name = meRes.data.profile?.full_name || meRes.data.account?.username || account.name;
        account.phone = meRes.data.profile?.phone || '';
        account.email = meRes.data.account?.email || account.email;
      }
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
    saveAddress: (addr) => {
      const id = addr.id || uid();
      up((p) => {
        let list = addr.id ? p.addresses.map((x) => (x.id === id ? { ...addr, id } : x)) : [...p.addresses, { ...addr, id }];
        const makeDefault = addr.isDefault || list.length === 1;
        list = list.map((x) => ({ ...x, isDefault: makeDefault ? x.id === id : x.isDefault }));
        const user = {
          ...p.user,
          name: p.user.name || addr.name,
          phone: p.user.phone || addr.phone,
        };
        return { addresses: list, selectedAddressId: makeDefault || !p.selectedAddressId ? id : p.selectedAddressId, user };
      });
      if (authTokens.get() && !addr.dbAddressId) {
        const fullText = [addr.full, addr.area].filter(Boolean).join(', ');
        const cleanPhone = String(addr.phone || s.user?.phone || '').replace(/\D/g, '');
        if (fullText.length >= 5 && /^(0|\+84)[3|5|7|8|9][0-9]{8}$/.test(cleanPhone)) {
          hrmssApi.createCustomerAddress({
            address_text: fullText,
            contact_name: addr.name || s.user?.name || '',
            contact_phone: cleanPhone,
            is_default: Boolean(addr.isDefault),
          }).then((res) => {
            if (res.ok && res.data?.address) {
              const dbAddr = mapBackendAddressToApp(res.data.address);
              up((p) => ({
                addresses: p.addresses.map((x) => (x.id === id ? { ...x, dbAddressId: dbAddr.dbAddressId } : x)),
              }));
            }
          }).catch(() => {});
        }
      }
      ui.toast('Đã lưu địa chỉ', '📍');
      return id;
    },
    deleteAddress: (id) => up((p) => {
      const list = p.addresses.filter((x) => x.id !== id);
      if (list.length && !list.some((x) => x.isDefault)) list[0] = { ...list[0], isDefault: true };
      return { addresses: list, selectedAddressId: p.selectedAddressId === id ? (list[0]?.id || null) : p.selectedAddressId };
    }),
    selectAddress: (id) => up(() => ({ selectedAddressId: id })),
    updateUser: (u) => {
      up((p) => {
        const nextUser = { ...p.user, ...u };
        const nextAuth = p.auth
          ? upsertBackendAccount({
              ...p.auth,
              name: nextUser.name ?? p.auth.name,
              phone: nextUser.phone ?? p.auth.phone,
              email: nextUser.email ?? p.auth.email,
              dob: nextUser.dob ?? p.auth.dob,
            })
          : null;
        return { user: nextUser, ...(nextAuth ? { auth: nextAuth } : {}) };
      });
      if (authTokens.get()) {
        hrmssApi.updateProfile({
          ...(u.name ? { full_name: u.name } : {}),
          ...(u.phone !== undefined ? { phone: u.phone ? u.phone : null } : {}),
        }).catch(() => {});
      }
      ui.toast('Đã cập nhật thông tin');
    },

    // Đơn hàng (Ghi trực tiếp vào bảng hrmss.service_request, service_request_service, repair_visit)
    placeOrder: (payload) => {
      if (s.auth?.role === 'customer' && !s.auth.emailVerified) {
        ui.alert(
          'Chưa xác thực Email',
          `Vui lòng xác thực địa chỉ Email (${s.user?.email || s.auth?.email || ''}) bằng mã OTP 6 chữ số trước khi đặt lịch dịch vụ.`,
          '📧',
        );
        return null;
      }
      const code = `MD${String(Date.now()).slice(-6)}`;
      const now = Date.now();
      const customerPhone = s.auth?.phone || s.user?.phone || address?.phone || '';
      const curTier = tierOf(s.lifetimePoints || 0).cur;
      const order = {
        ...payload,
        code,
        kind: payload.kind || 'normal',
        customerPhone,
        customerAccountId: s.auth?.id || null,
        customerTier: curTier.id,
        customerTierLabel: curTier.label,
        warrantyDays: curTier.warrantyDays || 60,
        tierPartDiscountPercent: curTier.partDiscountPercent || 0,
        device: payload.device || null,
        siteCondition: payload.siteCondition || null,
        comboDiscount: payload.comboDiscount || 0,
        comboLabel: payload.comboLabel || '',
        address,
        status: 'pending',
        history: [{ status: 'pending', at: now }],
        createdAt: now,
        tech: null, // chưa có thợ — thợ nhận việc ở app Thợ
        rating: null,
      };
      const svc0 = getService(payload.items[0]?.id);
      const devNote = payload.device ? ` · ${catLabel(payload.device.category)}${payload.device.brand ? ` ${payload.device.brand}` : ''}` : '';
      up((p) => ({
        orders: [order, ...p.orders],
        cart: payload.fromCart ? p.cart.filter((c) => !payload.items.some((it) => it.id === c.id)) : p.cart,
        myVouchers: payload.voucher?.wallet ? p.myVouchers.filter((v) => v.code !== payload.voucher.code) : p.myVouchers,
        user: { ...p.user, name: p.user.name || address?.name || '', phone: p.user.phone || address?.phone || '' },
        notifications: pushNotif(p, {
          icon: '📅', title: `Đặt lịch thành công · ${code}`,
          body: `${payload.dateLabel} · ${payload.slot}${devNote}. Tổng ${formatVND(payload.total)}.`,
          link: { name: 'order', params: { code } },
        }),
        techNotifs: pushTech(p, {
          icon: '🆕', title: `Việc mới ${code} · ${svc0?.name || 'Dịch vụ'}`,
          body: `${payload.dateLabel} · ${payload.slot}${devNote} · ${address?.area || ''}`,
          link: { name: 'tech-job', params: { code } },
        }),
      }));

      if (authTokens.get()) {
        const cleanPhone = String(address?.phone || customerPhone || '').replace(/\D/g, '');
        const fullAddrText = [address?.full, address?.area].filter(Boolean).join(', ');
        const apiItems = [];
        (payload.items || []).forEach((it) => {
          const count = Math.max(1, Number(it.qty) || 1);
          const dbServiceId = resolveDbServiceId(it.id);
          for (let i = 0; i < count && apiItems.length < 10; i += 1) {
            apiItems.push({
              service_id: dbServiceId,
              notes: payload.note ? String(payload.note).slice(0, 450) : null,
            });
          }
        });
        const reqBody = {
          ...(address?.dbAddressId
            ? { service_address_id: String(address.dbAddressId) }
            : {
                new_address: {
                  address_text: fullAddrText,
                  contact_name: address?.name || s.user?.name || '',
                  contact_phone: cleanPhone,
                  is_default: true,
                },
              }),
          preferred_time: buildPreferredTimeIso(payload.dateKey, payload.slot),
          problem_description: payload.note || `${svc0?.name || 'Đặt lịch dịch vụ'}${devNote}`,
          items: apiItems,
        };
        if (apiItems.length > 0 && (address?.dbAddressId || (fullAddrText.length >= 5 && cleanPhone))) {
          hrmssApi.createCustomerRequest(reqBody).then((res) => {
            if (res.ok && res.data?.request) {
              const dbReq = res.data.request;
              up((p) => ({
                orders: p.orders.map((x) => (x.code === code
                  ? { ...x, dbRequestId: dbReq.request_id, backendCode: dbReq.request_code }
                  : x)),
              }));
            }
          }).catch(() => {});
        }
      }
      return code;
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
            NOT_ACCEPTING_JOBS: 'Bạn đang tắt nhận việc. Bật nhận việc rồi thử lại.',
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
    declineJob: (code, reason) => {
      updateOrder(code, (o, p) => {
        if (o.status !== 'pending') return {};
        const myCode = techCodeOf(p);
        return {
          order: { ...o, dispatchNote: o.workerCode ? o.dispatchNote : 'Đang điều phối thợ khác cho bạn' },
          customer: { icon: '🔄', title: `Đang tìm thợ khác cho đơn ${code}`, body: 'Một thợ gần bạn chưa nhận được việc, hệ thống tiếp tục điều phối.' },
          extra: {
            ...markDeclined(p, myCode, code),
            declineLog: [...(p.declineLog || []), { code, reason: reason || '', at: Date.now(), stage: 'pre_accept', by: myCode }],
          },
        };
      });
      ui.toast('Đã chuyển việc cho điều phối');
    },
    // Trả việc sau khi đã nhận — phạt uy tín theo mức (cửa sổ 15 phút / sát giờ / đang đến / đang sửa)
    releaseJob: (code, reason) => {
      let outcome = null;
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || !['confirmed', 'onway', 'diagnosing', 'quoted', 'repairing'].includes(o.status)) {
          outcome = { ok: false, error: 'Chỉ trả được việc đang phụ trách (chưa hoàn thành).' };
          return {};
        }
        const myCode = (p.techProfile || TECH_ME).code;
        if (o.tech?.code && o.tech.code !== myCode) {
          outcome = { ok: false, error: 'Đây không phải việc của bạn.' };
          return {};
        }
        const assess = assessCancelAfterAccept(o);
        const techNext = applyTechPenalty(p.techProfile || TECH_ME, {
          points: assess.points,
          lockMs: assess.lockMs,
          violation: {
            type: 'cancel_after_accept',
            code,
            reason: reason || '',
            tier: assess.tier,
            label: assess.label,
          },
        });
        const voucher = mintWalletVoucher(assess.voucher);
        const now = Date.now();
        outcome = { ok: true, assess, locked: isTechLocked(techNext), lockReason: techLockReason(techNext), techNext };
        return {
          techProfile: techNext,
          orders: p.orders.map((x) => (x.code === code
            ? {
              ...x,
              status: 'pending',
              tech: null,
              acceptedAt: null,
              workerCode: '', // mở lại cho thợ khác
              dispatchNote: 'Đang điều phối thợ khác cho bạn',
              releaseLog: [...(x.releaseLog || []), { at: now, reason: reason || '', tier: assess.tier, by: myCode }],
              history: [...x.history, { status: 'pending', at: now, note: 'released' }],
            }
            : x)),
          ...markDeclined(p, myCode, code),
          declineLog: [...(p.declineLog || []), { code, reason: reason || '', at: now, stage: 'after_accept', tier: assess.tier, by: myCode }],
          myVouchers: voucher ? [voucher, ...p.myVouchers] : p.myVouchers,
          notifications: pushNotif(p, {
            icon: '🔄',
            title: `Đang tìm thợ khác · ${code}`,
            body: assess.customerNote + (voucher ? ` Bạn nhận mã ${voucher.code}.` : ''),
            link: { name: 'order', params: { code } },
          }),
          techNotifs: pushTech(p, {
            icon: '↩️',
            title: `Đã trả việc · ${code}`,
            body: `${assess.label} · Hệ thống đã chuyển đơn cho điều phối viên.`,
            link: { name: 'tech-jobs' },
          }),
        };
      });
      if (!outcome?.ok) {
        ui.alert('Không trả việc được', outcome?.error || 'Thử lại sau.', 'ℹ️');
        return outcome;
      }
      ui.toast('Đã trả việc cho điều phối', '↩️');
      return outcome;
    },
    // Nhắc khách duyệt báo giá đang chờ
    remindQuote: (code) => {
      let ok = false;
      updateOrder(code, (o) => {
        if (o.status !== 'quoted' || !o.quote) return {};
        ok = true;
        return {
          order: { ...o, quote: { ...o.quote, remindedAt: Date.now() } },
          customer: {
            icon: '⏰',
            title: `Nhắc duyệt báo giá · ${code}`,
            body: `Thợ đang chờ bạn duyệt báo giá ${formatVND(o.quote.total)} để tiếp tục công việc.`,
          },
        };
      });
      if (ok) ui.toast('Đã gửi nhắc cho khách', '📨');
      else ui.alert('Không gửi được', 'Chỉ nhắc được khi đơn đang chờ duyệt báo giá.', 'ℹ️');
    },
    updateTechProfile: (patch) => {
      // Chuyên môn do backend cấp; không nhận cập nhật từ client.
      const { skills: _ignoredSkills, ...editablePatch } = patch || {};
      up((p) => {
        const base = p.techProfile || TECH_ME;
        const next = { ...base, ...editablePatch, ...normalizeTechRep({ ...base, ...editablePatch }) };
        return {
          techProfile: next,
          user: {
            ...p.user,
            name: editablePatch.name != null ? editablePatch.name : p.user.name,
            phone: editablePatch.phone != null ? editablePatch.phone : p.user.phone,
            dob: editablePatch.dob != null ? editablePatch.dob : p.user.dob,
            email: editablePatch.email != null ? editablePatch.email : p.user.email,
          },
        };
      });
      if (authTokens.get()) {
        if (editablePatch.area !== undefined) hrmssApi.updateTechnicianWorkArea(editablePatch.area || null).catch(() => {});
        if (editablePatch.name || editablePatch.phone !== undefined) {
          hrmssApi.updateProfile({
            ...(editablePatch.name ? { full_name: editablePatch.name } : {}),
            ...(editablePatch.phone !== undefined ? { phone: editablePatch.phone || null } : {}),
          }).catch(() => {});
        }
      }
      ui.toast('Đã cập nhật hồ sơ thợ');
    },
    startTravel: (code) => {
      const now = Date.now();
      let lateHint = '';
      let ok = false;
      let blockedReason = null;
      let travelCoords = null;
      updateOrder(code, (o) => {
        if (o.status !== 'confirmed') return {};
        if (o.quote && !o.quote.approved) {
          blockedReason = 'Khách hàng chưa đồng ý báo giá trên ứng dụng. Thợ chỉ xuất phát sau khi khách đồng ý.';
          return {};
        }
        ok = true;
        const start = slotStartTs(o);
        if (start != null && now > start + TECH_POLICY.lateGraceMin * 60000) {
          lateHint = `Bạn đã quá giờ hẹn ~${Math.floor((now - start) / 60000)} phút. Vui lòng liên hệ khách hàng và di chuyển khẩn trương.`;
        }
        const destLat = o.address?.lat ?? 21.036778;
        const destLng = o.address?.lng ?? 105.782374;
        const tracking = {
          progress: 0.08,
          lat: destLat + 0.018,
          lng: destLng - 0.012,
          etaMin: 22,
          updatedAt: now,
          label: 'Thợ vừa xuất phát',
        };
        travelCoords = { latitude: tracking.lat, longitude: tracking.lng, location_accuracy: 15, location_sharing_enabled: true };
        return {
          order: withStatus(o, 'onway', now, { travelStartedAt: now, tracking }),
          customer: { icon: '🛵', title: `Thợ đang đến · ${code}`, body: `Thợ ${o.tech?.name || ''} đang di chuyển tới địa chỉ của bạn. Mở đơn để theo dõi.` },
        };
      });
      if (blockedReason) { ui.alert('Chờ khách đồng ý', blockedReason, '⏳'); return; }
      if (!ok) { ui.alert('Không cập nhật được', 'Chỉ bấm “Đang đến” khi đã nhận việc.', 'ℹ️'); return; }
      if (authTokens.get() && travelCoords) {
        hrmssApi.updateTechnicianLocation(travelCoords).catch(() => {});
      }
      if (lateHint) ui.alert('Cảnh báo giờ hẹn', lateHint, '⏰');
      else ui.toast('Đã báo khách: đang di chuyển', '🛵');
    },
    tickTracking: (code) => {
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status !== 'onway') return {};
        const tracking = advanceTracking(o);
        if (!tracking) return {};
        const prev = o.tracking?.progress || 0;
        if (Math.abs((tracking.progress || 0) - prev) < 0.001) return {};
        return { orders: p.orders.map((x) => (x.code === code ? { ...x, tracking } : x)) };
      });
    },
    arrive: (code, checkIn = null) => {
      let lateInfo = null;
      let ok = false;
      let targetOrder = null;
      let checkInCoords = null;
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status !== 'onway') return {};
        ok = true;
        targetOrder = o;
        const now = Date.now();
        const late = assessLateness(o, now);
        lateInfo = late;
        let techProfile = p.techProfile || TECH_ME;
        let myVouchers = p.myVouchers;
        let voucher = null;
        if (late.tier !== 'ok' && late.points > 0) {
          techProfile = applyTechPenalty(techProfile, {
            points: late.points,
            lockMs: late.tier === 'severe' ? 4 * 60 * 60 * 1000 : 0,
            violation: {
              type: 'late_arrival',
              code,
              tier: late.tier,
              minutesLate: late.minutesLate,
              label: late.label,
            },
          });
        }
        if (late.voucher) {
          voucher = mintWalletVoucher(late.voucher);
          if (voucher) myVouchers = [voucher, ...myVouchers];
        }
        const lateCompensation = late.tier === 'ok' ? null : {
          minutesLate: late.minutesLate,
          tier: late.tier,
          percent: late.compensationPercent || 0,
          maxDiscount: late.voucher?.max || (late.compensationPercent >= 50 ? 200000 : late.compensationPercent ? 100000 : 0),
          voucherCode: voucher?.code || null,
          at: now,
        };
        const discPreview = lateCompensation?.percent
          ? Math.min(
            Math.round((o.quote?.total != null ? o.quote.total : bookedValue(o)) * (lateCompensation.percent / 100)),
            lateCompensation.maxDiscount,
          )
          : 0;
        const checkInPayload = checkIn ? {
          lat: checkIn.lat,
          lng: checkIn.lng,
          accuracy: checkIn.accuracy || 15,
          label: checkIn.label || 'Đã xác thực vị trí GPS tại điểm hẹn',
          at: now,
        } : { lat: 21.036778, lng: 105.782374, accuracy: 15, label: 'Đã xác thực vị trí GPS tại điểm hẹn', at: now };
        checkInCoords = {
          latitude: checkInPayload.lat || 21.036778,
          longitude: checkInPayload.lng || 105.782374,
          location_accuracy: checkInPayload.accuracy || 15,
          location_sharing_enabled: true,
        };
        const geoNote = ` (GPS ±${checkInPayload.accuracy || 15}m)`;
        const body = late.tier === 'ok'
          ? `Thợ đã check-in tại địa chỉ của bạn${geoNote}. Đang kiểm tra thiết bị.`
          : `Thợ đã đến (trễ ${late.minutesLate} phút)${geoNote}.${discPreview ? ` Giảm ${formatVND(discPreview)} phí nhân công.` : ''}${voucher ? ` Mã ${voucher.code} trong Quyền lợi.` : ''}`;
        return {
          techProfile,
          myVouchers,
          orders: p.orders.map((x) => (x.code === code
            ? withStatus(o, 'diagnosing', now, {
              arrivedAt: now,
              lateCompensation,
              checkIn: checkInPayload,
              tracking: { ...(o.tracking || {}), progress: 1, etaMin: 0, updatedAt: now, label: 'Đã check-in tại nhà khách', lat: checkInPayload.lat, lng: checkInPayload.lng },
            })
            : x)),
          notifications: pushNotif(p, {
            icon: late.tier === 'ok' ? '📍' : '⏰',
            title: late.tier === 'ok' ? `Thợ đã đến điểm hẹn · ${code}` : `Thợ đến muộn ${late.minutesLate} phút · ${code}`,
            body,
            link: { name: 'order', params: { code } },
          }),
          techNotifs: pushTech(p, {
            icon: late.tier === 'ok' ? '📍' : '⏰',
            title: late.tier === 'ok' ? `Check-in đúng giờ · ${code}` : `Check-in muộn ${late.minutesLate} phút · ${code}`,
            body: late.tier === 'ok' ? 'Đã xác thực vị trí GPS tại nhà khách. Bắt đầu kiểm tra thiết bị.' : late.label,
            link: { name: late.tier === 'ok' ? 'tech-job' : 'tech-account', params: { code } },
          }),
        };
      });
      if (!ok) { ui.alert('Không check-in được', 'Chỉ check-in khi đang ở trạng thái “Đang đến”.', 'ℹ️'); return; }
      if (authTokens.get()) {
        if (checkInCoords) hrmssApi.updateTechnicianLocation(checkInCoords).catch(() => {});
        if (targetOrder?.dbAssignmentId) {
          hrmssApi.startTechnicianJob(targetOrder.dbAssignmentId).catch(() => {});
        } else if (targetOrder?.dbRequestId) {
          hrmssApi.acceptTechnicianOpenRequest(targetOrder.dbRequestId).then((res) => {
            if (res.ok && res.data?.job?.assignment_id) {
              const aid = res.data.job.assignment_id;
              up((p) => ({ orders: p.orders.map((x) => (x.code === code ? { ...x, dbAssignmentId: aid } : x)) }));
              hrmssApi.startTechnicianJob(aid).catch(() => {});
            }
          }).catch(() => {});
        }
      }
      if (lateInfo && lateInfo.tier !== 'ok') {
        ui.alert(
          `Check-in muộn ${lateInfo.minutesLate} phút`,
          `${lateInfo.label}. Khách được áp dụng ưu đãi theo chính sách đúng giờ.`,
          '⏰',
        );
      } else ui.toast('Đã check-in GPS tại nhà khách', '📍');
    },
    // Khách yêu cầu / chuyển đổi sang thanh toán Chuyển khoản QR (VietQR) -> Khoá quyền thu tiền mặt của Thợ
    switchToQRPayment: (code) => {
      let ok = false;
      updateOrder(code, (o) => {
        if (!o || o.status === 'cancelled') return {};
        ok = true;
        return {
          order: {
            ...o,
            payment: 'Chuyển khoản VietQR (MBBank)',
            paymentMethod: 'vietqr',
            qrPaymentRequested: true,
            qrRequestedAt: Date.now(),
          },
          tech: {
            icon: '⚠️',
            title: `Khách chuyển khoản QR · Không thu tiền · ${code}`,
            body: `Khách yêu cầu chuyển khoản VietQR (${formatVND(orderTotal(o))}) trên App. Kỹ thuật viên tuyệt đối KHÔNG thu tiền mặt!`,
            link: { name: 'tech-job', params: { code } },
          },
          customer: {
            icon: '🏦',
            title: `Đã chuyển sang thanh toán VietQR · ${code}`,
            body: 'Đơn đã khoá thu tiền mặt phía thợ. Bạn vui lòng quét mã VietQR trên ứng dụng sau khi nghiệm thu.',
            link: { name: 'order', params: { code } },
          },
        };
      });
      if (ok) {
        ui.toast('Đã chuyển sang VietQR · Thợ không thu tiền mặt', '🏦', 'success');
      }
      return ok;
    },
    // Khách xác nhận đã thanh toán (sau khi hoàn thành hoặc khi đang nghiệm thu QR)
    confirmPayment: (code, mode = 'manual') => {
      let ok = false;
      let targetTotal = 0;
      updateOrder(code, (o) => {
        if (!['done', 'repairing', 'quoted', 'pending_review'].includes(o.status)) return {};
        ok = true;
        targetTotal = orderTotal(o);
        const isQR = mode === 'webhook' || isQRPayment(o);
        const report = {
          ...(o.report || {}),
          paid: true,
          paidAt: Date.now(),
          paidBy: mode === 'webhook' ? 'vietqr_webhook' : isQR ? 'customer_qr' : 'customer',
        };
        return {
          order: {
            ...o,
            ...(isQR ? { payment: 'Chuyển khoản VietQR (MBBank)', qrPaymentRequested: true } : {}),
            report,
          },
          tech: {
            icon: '✅',
            title: isQR ? `TingTing! Khách đã CK VietQR ${formatVND(targetTotal)} · ${code}` : `Khách xác nhận đã thanh toán · ${code}`,
            body: isQR
              ? `Hệ thống đã nhận đủ ${formatVND(targetTotal)} qua VietQR. Thợ KHÔNG thu tiền mặt — chiết khấu & hoàn ứng đã cộng vào Ví thợ!`
              : (o.payment || 'Đã thanh toán'),
            link: { name: 'tech-job', params: { code } },
          },
        };
      });
      if (ok) {
        if (mode === 'webhook') {
          ui.toast(`🔔 Webhook MBBank: Nhận ${formatVND(targetTotal)} · Gạch nợ thành công!`, '✅', 'success');
        } else {
          ui.toast('Đã ghi nhận thanh toán thành công', '✅', 'success');
        }
      } else {
        ui.alert('Không cập nhật được', 'Chỉ xác nhận thanh toán khi đơn đang thực hiện hoặc đã hoàn thành.', 'ℹ️');
      }
    },
    requestPayout: ({ amount, bankName, accountNumber, accountHolder }) => {
      const amt = parseInt(String(amount).replace(/[^0-9]/g, ''), 10);
      if (!amt || amt < 50000) {
        ui.alert('Số tiền không hợp lệ', 'Số tiền rút tối thiểu là 50.000đ.', '⚠️');
        return false;
      }
      if (!accountNumber || !bankName) {
        ui.alert('Thiếu thông tin', 'Vui lòng nhập đầy đủ ngân hàng và số tài khoản nhận tiền.', '⚠️');
        return false;
      }
      const entry = {
        id: uid(),
        amount: amt,
        bankName,
        accountNumber,
        accountHolder: accountHolder || 'KỸ THUẬT VIÊN',
        at: Date.now(),
        status: 'success',
      };
      up((p) => ({
        payoutHistory: [entry, ...(p.payoutHistory || [])],
        techNotifs: pushTech(p, {
          icon: '💸',
          title: `Lệnh rút tiền thành công · -${formatVND(amt)}`,
          body: `Đã chuyển ${formatVND(amt)} về ${bankName} (${accountNumber}). Tiền về tài khoản trong 30 giây.`,
        }),
      }));
      ui.toast(`Đã rút ${formatVND(amt)} về ${bankName}`, '💸');
      return true;
    },
    dismissTip: (key) => up((p) => ({ tips: { ...(p.tips || {}), [key]: false } })),
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
          }),
          tech: { icon: '✏️', title: `Điều chỉnh báo giá đơn ${code}`, body: 'Bạn có thể chỉnh sửa vật tư, dịch vụ và nhập chi phí phát sinh.' },
        };
      });
      if (ok) ui.toast('Mở lại báo giá để điều chỉnh phát sinh', '✏️');
    },
    // Lập chẩn đoán / báo giá:
    //  - Trước khi xuất phát (confirmed): gửi báo giá trên app, khách đồng ý thì thợ mới đi. Khách huỷ -> 0đ.
    //  - Sau khi kiểm tra tại nhà (diagnosing): gửi báo giá hiện trường. Khách huỷ -> mất phí kiểm tra 100k.
    submitQuote: (code, { diagnosis, symptoms, recommendation, lines }) => {
      const now = Date.now();
      const cleanLines = (lines || []).map((l) => ({ ...l, isCustom: Boolean(l.isCustom) }));
      const qTotal = cleanLines.reduce((sum, l) => sum + l.price * l.qty, 0);
      let ok = false;
      let targetOrder = null;
      let isPreVisitQuote = false;
      updateOrder(code, (o) => {
        if (!['diagnosing', 'confirmed', 'quoted', 'repairing'].includes(o.status)) return {};
        ok = true;
        targetOrder = o;
        const isPre = o.status === 'confirmed';
        isPreVisitQuote = isPre;
        const booked = bookedValue(o);
        const quote = {
          diagnosis: diagnosis || (isPre ? 'Báo giá sơ bộ trước khi xuất phát' : 'Đã kiểm tra thiết bị tại nhà'),
          symptoms: symptoms || '',
          recommendation: recommendation || '',
          lines: cleanLines,
          total: qTotal,
          booked,
          needsApproval: true,
          isPreVisit: isPre,
          at: now,
          approved: false,
        };
        const materials = cleanLines.filter((l) => l.type === 'part').map((l) => ({ id: uid(), matId: l.matId, name: l.name, unit: l.unit, qty: l.qty, price: l.price, isCustom: Boolean(l.isCustom) }));
        const tempOrder = { ...o, quote };
        const partDisc = tierPartDiscountAmount(tempOrder);

        return {
          order: withStatus(o, 'quoted', now, { quote, materials }),
          customer: {
            icon: '🧾',
            title: isPre ? `Báo giá cho đơn ${code}` : `Báo giá kiểm tra tại nhà cho đơn ${code}`,
            body: isPre
              ? `Tổng ${formatVND(qTotal)}. Vui lòng đồng ý để thợ xuất phát đến nhà bạn.`
              : `Tổng ${formatVND(qTotal - partDisc)}. Vui lòng duyệt để thợ bắt đầu thực hiện.`,
          },
        };
      });
      if (!ok) { ui.alert('Không gửi được', 'Chỉ gửi báo giá khi đã nhận việc hoặc đang kiểm tra thiết bị.', 'ℹ️'); return; }
      if (authTokens.get() && targetOrder?.dbAssignmentId) {
        const aid = targetOrder.dbAssignmentId;
        const cleanFindings = (diagnosis && String(diagnosis).trim().length >= 5)
          ? String(diagnosis).trim()
          : (isPreVisitQuote ? 'Báo giá sơ bộ trước khi xuất phát' : 'Đã kiểm tra thực tế thiết bị tại nhà khách hàng');
        (async () => {
          try {
            if (!isPreVisitQuote) {
              await hrmssApi.startTechnicianJob(aid).catch(() => {});
              await hrmssApi.submitDiagnosis(aid, {
                symptoms: symptoms || null,
                findings: cleanFindings,
                repair_recommendation: recommendation || null,
                needs_quotation: true,
              }).catch(() => {});
            }
            if (Array.isArray(lines) && lines.length > 0) {
              const quoteItems = lines.map((l) => {
                if (l.type === 'part') {
                  return {
                    item_type: 'MATERIAL',
                    material_id: resolveDbMaterialId(l.matId, l.name),
                    description_snapshot: l.name || 'Linh kiện vật tư',
                    quantity: Math.max(1, Number(l.qty) || 1),
                    unit_price: Math.max(0, Number(l.price) || 0),
                  };
                }
                return {
                  item_type: 'SERVICE',
                  description_snapshot: l.name || 'Dịch vụ sửa chữa & bảo dưỡng',
                  quantity: Math.max(1, Number(l.qty) || 1),
                  unit_price: Math.max(0, Number(l.price) || 0),
                };
              });
              await hrmssApi.submitQuotation(aid, {
                quotation_type: isPreVisitQuote ? 'INITIAL' : 'SUPPLEMENTAL',
                items: quoteItems,
              });
            }
          } catch (e) { /* bỏ qua */ }
        })();
      }
      ui.toast('Đã gửi báo giá cho khách', '🧾');
    },
    // Khách duyệt / yêu cầu sửa báo giá / từ chối & huỷ đơn (Ghi vào hrmss.quotation & service_request)
    // - Nếu thợ chưa đến nhà: huỷ miễn phí 100%. Khách đồng ý thì thợ mới đi.
    // - Chỉ khi thợ đã đến kiểm tra báo giá tại nhà mà khách huỷ thì mới thu phí kiểm tra (100.000đ).
    respondQuote: (code, decision, reason) => {
      const now = Date.now();
      let targetOrder = null;
      let appliedFee = 0;
      updateOrder(code, (o, p) => {
        if (!o.quote) return {};
        targetOrder = o;
        const isOnSite = Boolean(o.arrivedAt || o.checkIn || o.history?.some((h) => h.status === 'diagnosing'));
        if (decision === true || decision === 'approve') {
          const partDisc = tierPartDiscountAmount(o);
          const nextStatus = isOnSite ? 'repairing' : 'confirmed';
          return {
            order: withStatus(o, nextStatus, now, {
              quote: { ...o.quote, approved: true, revisionRequested: false, respondedAt: now },
              finalTotal: Math.max(0, o.quote.total - partDisc - (o.voucherDiscount || 0)),
            }),
            tech: {
              icon: '✅',
              title: `Khách đã duyệt báo giá · ${code}`,
              body: isOnSite
                ? `Tổng ${formatVND(o.quote.total - partDisc)}. Bắt đầu thực hiện sửa chữa.`
                : `Khách đã đồng ý báo giá ${formatVND(o.quote.total)}. Bạn có thể bắt đầu di chuyển đến nhà khách.`,
            },
          };
        }
        if (decision === 'revise') {
          return {
            order: withStatus(o, isOnSite ? 'diagnosing' : 'confirmed', now, {
              quote: {
                ...o.quote,
                approved: false,
                revisionRequested: true,
                rejectReason: reason || 'Khách yêu cầu điều chỉnh hạng mục / chi phí',
                respondedAt: now,
              },
            }),
            tech: {
              icon: '🔄',
              title: `Khách yêu cầu báo giá lại · ${code}`,
              body: reason || 'Vui lòng trao đổi với khách và gửi lại báo giá.',
            },
          };
        }
        // Khách từ chối báo giá & huỷ đơn: Miễn phí 100% kiểm tra tại nhà (0đ) theo chính sách Minh Đức
        const fee = 0;
        appliedFee = fee;
        return {
          order: withStatus(o, 'cancelled', now, {
            quote: { ...o.quote, approved: false, revisionRequested: false, rejectReason: reason, respondedAt: now },
            cancelReason: `Khách từ chối báo giá${reason ? `: ${reason}` : ''} (miễn phí 100%)`,
            inspectionFee: fee,
            total: fee,
          }),
          tech: {
            icon: '❌',
            title: `Khách từ chối báo giá · ${code}`,
            body: isOnSite
              ? 'Khách từ chối sau khi thợ đã đến kiểm tra. Đơn đã huỷ, không thu phí (chính sách miễn phí 100%).'
              : 'Khách từ chối báo giá trước khi xuất phát. Đơn đã huỷ, không thu phí.',
          },
          customer: {
            icon: '❌',
            title: `Đã từ chối báo giá & huỷ đơn · ${code}`,
            body: 'Đã huỷ đơn thành công. Bạn được miễn phí kiểm tra 100% (0đ) theo chính sách Minh Đức.',
          },
          extra: { myVouchers: o.voucher?.wallet ? [o.voucher, ...p.myVouchers] : p.myVouchers },
          customerProfilePatch: (prof) => ({
            myVouchers: o.voucher?.wallet ? [o.voucher, ...(prof.myVouchers || [])] : (prof.myVouchers || []),
          }),
        };
      });
      if (authTokens.get() && targetOrder?.dbRequestId && decision !== 'revise') {
        const isApprove = decision === true || decision === 'approve';
        hrmssApi.decideQuotation(targetOrder.dbRequestId, {
          decision: isApprove ? 'APPROVED' : 'REJECTED',
          rejection_reason: reason || null,
        }).catch(() => {});
      }
      if (decision === true || decision === 'approve') ui.toast('Đã duyệt báo giá', '✅');
      else if (decision === 'revise') ui.toast('Đã gửi yêu cầu báo giá lại cho thợ', '🔄');
      else ui.toast(appliedFee > 0 ? 'Đã từ chối (thu phí kiểm tra 100k)' : 'Đã huỷ đơn (miễn phí)', '✖️');
    },
    // Thợ quét / xác thực mã QR của khách hàng tại nhà
    verifyCustomerQR: (code, scannedInput = 'AUTO_SCAN') => {
      const now = Date.now();
      let resStatus = 'missing';
      updateOrder(code, (o, p) => {
        const custPhone = String(o.address?.phone || o.customerPhone || '').replace(/\D/g, '');
        const raw = String(scannedInput || '').trim();
        const isAuto = raw === 'AUTO_SCAN';
        const cleanDigits = raw.replace(/\D/g, '');
        const valid = isAuto
          || raw.toUpperCase().includes(`MINHDUC:${custPhone}`)
          || (custPhone && cleanDigits === custPhone)
          || (custPhone && cleanDigits.length >= 4 && custPhone.endsWith(cleanDigits));
        if (!valid) {
          resStatus = 'invalid';
          return {};
        }
        resStatus = 'ok';
        const myTechCode = (p.techProfile || TECH_ME).code;
        const boosted = o.qrVerified ? (p.techProfile || TECH_ME) : applyTechBonus(p.techProfile || TECH_ME, 1);
        return {
          order: {
            ...o,
            qrVerified: {
              at: now,
              by: myTechCode,
              phone: custPhone,
              qrCode: `MINHDUC:${custPhone || o.address?.name || code}`,
            },
          },
          customer: {
            icon: '🔳',
            title: `Đã xác thực QR khách hàng · ${code}`,
            body: `Thợ ${o.tech?.name || myTechCode} đã quét mã QR xác nhận phục vụ tại nhà bạn.`,
          },
          extra: { techProfile: boosted },
        };
      });
      if (resStatus === 'invalid') {
        ui.alert('Mã QR không khớp', 'Mã QR hoặc số điện thoại không khớp với khách hàng của đơn này.', '🔳');
        return false;
      }
      if (resStatus === 'ok') {
        ui.toast('Đã xác thực QR khách hàng · +1 uy tín', '🔳');
        return true;
      }
      return false;
    },
    addProgress: (code, { note, percent }) => {
      updateOrder(code, (o) => ({
        order: { ...o, progress: [...(o.progress || []), { id: uid(), note, percent, at: Date.now() }] },
        customer: { icon: '📈', title: `Tiến độ ${percent}% · ${code}`, body: note || 'Thợ vừa cập nhật tiến độ.' },
      }));
      ui.toast('Đã cập nhật tiến độ', '📈');
    },
    setMaterialQty: (code, id, qty) => updateOrder(code, (o) => ({
      order: { ...o, materials: (o.materials || []).map((m) => (m.id === id ? { ...m, qty: Math.max(1, qty) } : m)) },
    })),
    addMaterial: (code, mat) => {
      let targetOrder = null;
      updateOrder(code, (o) => {
        targetOrder = o;
        return {
          order: { ...o, materials: [...(o.materials || []), { id: uid(), matId: mat.id, name: mat.name, unit: mat.unit, qty: 1, price: mat.price }] },
          customer: { icon: '🔩', title: `Thợ ghi nhận vật tư · ${code}`, body: `${mat.name} · xem chi tiết đơn để theo dõi.` },
        };
      });
      if (authTokens.get() && targetOrder?.dbAssignmentId) {
        hrmssApi.recordMaterialUsage(targetOrder.dbAssignmentId, {
          material_id: resolveDbMaterialId(mat.dbId || mat.id, mat.name),
          used_quantity: 1,
          notes: `${mat.name} (${formatVND(mat.price)})`,
        }).catch(() => {});
      }
      ui.toast('Đã thêm vật tư', '🔩');
    },
    removeMaterial: (code, id) => updateOrder(code, (o) => ({ order: { ...o, materials: (o.materials || []).filter((m) => m.id !== id) } })),
    addEvidence: (code, { uri, stage, note }) => {
      const stageLabel = stage === 'diagnosis' ? 'chẩn đoán' : stage === 'before' ? 'trước khi làm' : 'sau khi làm';
      updateOrder(code, (o) => ({
        order: {
          ...o,
          evidence: [...(o.evidence || []), { id: uid(), uri, stage, note: note || '', at: Date.now() }],
        },
        customer: { icon: '📷', title: `Thợ thêm ảnh ${stageLabel} · ${code}`, body: note || 'Có ảnh minh chứng mới trên đơn của bạn.' },
      }));
      ui.toast(stage === 'diagnosis' ? 'Đã thêm ảnh chẩn đoán' : 'Đã thêm ảnh minh chứng', '📷');
    },
    removeEvidence: (code, id) => updateOrder(code, (o) => ({ order: { ...o, evidence: (o.evidence || []).filter((e) => e.id !== id) } })),
    updateEvidenceNote: (code, id, note) => updateOrder(code, (o) => ({
      order: { ...o, evidence: (o.evidence || []).map((e) => (e.id === id ? { ...e, note } : e)) },
    })),
    // Nhật ký sửa chữa của kỹ thuật viên
    addRepairNote: (code, text) => {
      const note = String(text || '').trim();
      if (!note) { ui.alert('Thiếu nội dung', 'Nhập ghi chú công việc đã làm.', '📝'); return; }
      updateOrder(code, (o) => ({
        order: { ...o, repairNotes: [...(o.repairNotes || []), { id: uid(), text: note, at: Date.now() }] },
        customer: { icon: '📝', title: `Thợ cập nhật ghi chú · ${code}`, body: note },
      }));
      ui.toast('Đã lưu ghi chú sửa chữa', '📝');
    },
    // Khách sửa yêu cầu khi đơn còn chờ thợ nhận
    updatePendingRequest: (code, patch) => {
      let ok = false;
      updateOrder(code, (o) => {
        if (o.status !== 'pending') return {};
        ok = true;
        return {
          order: {
            ...o,
            note: patch.note != null ? patch.note : o.note,
            slot: patch.slot || o.slot,
            dateLabel: patch.dateLabel || o.dateLabel,
            dateKey: patch.dateKey || o.dateKey,
            attachments: patch.attachments != null ? patch.attachments : (o.attachments || []),
          },
          tech: {
            icon: '✏️',
            title: `Khách cập nhật yêu cầu · ${code}`,
            body: `${patch.dateLabel || o.dateLabel} · ${patch.slot || o.slot}`,
          },
        };
      });
      if (ok) ui.toast('Đã cập nhật yêu cầu', '✏️');
      else ui.alert('Không sửa được', 'Chỉ sửa được khi đơn còn chờ thợ nhận.', 'ℹ️');
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
        } else {
          ui.alert('Chưa nộp được biên bản', res.status > 0 ? (res.message || 'Vui lòng thử lại.') : networkError(res), '⚠️');
        }
        return false;
      }
      const total = orderTotal(o0);
      const earned = o0.kind !== 'warranty' ? Math.max(1, Math.floor(total / 10000)) : 0;
      const ptEntry = earned ? { id: uid(), title: `Hoàn thành đơn ${code}`, delta: earned, at: now, orderCode: code } : null;
      const cats = new Set(o0.items.map((it) => getService(it.id)?.category));
      const onTimeBonus = !o0.lateCompensation || o0.lateCompensation.tier === 'soft' ? 2 : 1;
      updateOrder(code, (o, p) => {
        const boosted = applyTechBonus(p.techProfile || TECH_ME, onTimeBonus);
        const qrOrder = isQRPayment(o);
        const alreadyPaidByCustomer = Boolean(o.report?.paid);
        // Nếu khách chọn Chuyển khoản QR: Thợ KHÔNG được thu tiền mặt -> chỉ đánh dấu paid nếu khách đã quét QR trước đó
        const finalPaid = qrOrder ? alreadyPaidByCustomer : Boolean(paid);
        const finalPaidAt = qrOrder
          ? (o.report?.paidAt || null)
          : (finalPaid ? now : null);
        const finalPaidBy = qrOrder
          ? (o.report?.paidBy || null)
          : (finalPaid ? 'tech' : null);
        return {
          order: withStatus(o, 'pending_review', now, {
            pendingReviewAt: now,
            report: {
              ...(o.report || {}),
              summary,
              paid: finalPaid,
              at: now,
              tech: o.tech?.name,
              techCode: o.tech?.code,
              safetyChecklist: safetyChecklist || [],
              customerSignature: customerSignature || null,
              warrantyCertificateCode: `BH-${code}`,
              ...(finalPaid ? { paidAt: finalPaidAt, paidBy: finalPaidBy } : {}),
            },
          }),
          customer: {
            icon: '🏢',
            title: `Đơn ${code} đang chờ Văn phòng nghiệm thu`,
            body: `Kỹ thuật viên đã nộp biên bản & hình ảnh sau làm việc. Văn phòng Minh Đức đang đối soát kiểm tra chất lượng.`,
            link: { name: 'order', params: { code } },
          },
          tech: {
            icon: '⏳',
            title: `Đã nộp biên bản · Chờ Văn phòng nghiệm thu`,
            body: `Biên bản đã chuyển đến Văn phòng Minh Đức để đối soát và xác nhận hoàn tất.`,
            link: { name: 'tech-job', params: { code } },
          },
          extra: {
            points: p.points + earned,
            lifetimePoints: p.lifetimePoints + earned,
            pointHistory: ptEntry ? [ptEntry, ...(p.pointHistory || [])] : (p.pointHistory || []),
            techProfile: {
              ...boosted,
              jobs: (boosted.jobs || 0) + 1,
            },
          },
          customerProfilePatch: (prof) => ({
            points: (prof.points || 0) + earned,
            lifetimePoints: (prof.lifetimePoints || 0) + earned,
            pointHistory: ptEntry ? [ptEntry, ...(prof.pointHistory || [])] : (prof.pointHistory || []),
          }),
        };
      });
      ui.toast(Boolean(paid) && !isQRPayment(o0) ? 'Đã nộp biên bản · Chờ Văn phòng nghiệm thu' : 'Đã nộp biên bản · Chờ khách kiểm tra & thanh toán', '🏢');
      // Luồng backend: chờ khách thanh toán -> trả đủ -> văn phòng nghiệm thu trên web; app đọc trạng thái thật khi đồng bộ.
      syncFromBackend();
      return true;
    },
    // Văn phòng thẩm định duyệt hồ sơ bảo hành
    officeApproveWarranty: (code) => {
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0 || o0.status !== 'warranty_pending') return false;
      const now = Date.now();
      updateOrder(code, (o) => ({
        order: withStatus(o, 'pending', now, {
          warrantyApproved: true,
          warrantyApprovedAt: now,
        }),
        customer: {
          icon: '🛡️',
          title: `Văn phòng đã duyệt bảo hành ${code}`,
          body: `Hồ sơ hợp lệ theo bảo hành 60 ngày. Quản lý đang điều phối KTV tiếp nhận.`,
          link: { name: 'order', params: { code } },
        },
        tech: {
          icon: '🛡️',
          title: `Việc bảo hành mới ${code}`,
          body: `Văn phòng đã duyệt bảo hành cho đơn ${o.warrantyOf || ''} · ${o.address?.area || ''}`,
          link: { name: 'tech-job', params: { code } },
        },
      }));
      ui.toast('🏢 Văn phòng Minh Đức: Đã thẩm định hồ sơ bảo hành hợp lệ', '🛡️', 'success');
      return true;
    },
    // Thợ từ chối bảo hành tại nhà do lỗi ngoại lực/người dùng → chuyển sang báo giá có phí
    rejectWarrantyAsOutOfWarranty: (code, reason) => {
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0) return false;
      const now = Date.now();
      const r = reason || 'Hư hỏng do rơi vỡ/ngoại lực tác động, không thuộc phạm vi bảo hành 60 ngày.';
      updateOrder(code, (o) => ({
        order: withStatus(o, 'diagnosing', now, {
          outOfWarranty: true,
          outOfWarrantyReason: r,
          kind: 'repair',
          payment: 'Tiền mặt / VietQR',
        }),
        customer: {
          icon: '⚠️',
          title: `Thiết bị ngoài phạm vi bảo hành · ${code}`,
          body: `${r} Kỹ thuật viên sẽ lập báo giá sửa chữa chính thức cho bạn.`,
          link: { name: 'order', params: { code } },
        },
        tech: {
          icon: '📋',
          title: `Chuyển sang sửa chữa có phí · ${code}`,
          body: `Đã xác nhận ngoài phạm vi bảo hành. Vui lòng lập báo giá linh kiện/vật tư thay thế.`,
          link: { name: 'tech-job', params: { code } },
        },
      }));
      ui.toast('Đã ghi nhận ngoài bảo hành · Chuyển sang báo giá', '📋');
      return true;
    },
    // Yêu cầu hẹn tái khám khi chưa hoàn thành sửa chữa
    requestFollowUp: (code, reason) => {
      const now = Date.now();
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0) return false;
      const r = reason || 'Chờ linh kiện phụ tùng từ kho điều phối';
      updateOrder(code, (o) => ({
        order: {
          ...o,
          followUpRequested: true,
          followUpReason: r,
          followUpAt: now,
          history: [...o.history, { status: 'repairing', at: now, note: `Yêu cầu hẹn tái khám: ${r}` }],
        },
        customer: {
          icon: '📅',
          title: `Hẹn lịch tái khám đơn ${code}`,
          body: `KTV đã ghi nhận: "${r}". Quản lý đang xếp lịch hẹn tiếp theo cho bạn.`,
          link: { name: 'order', params: { code } },
        },
        tech: {
          icon: '📅',
          title: `Đã lưu yêu cầu tái khám đơn ${code}`,
          body: `Lý do: ${r}. Quản lý kỹ thuật Minh Đức đã nhận được thông tin để điều phối.`,
          link: { name: 'tech-job', params: { code } },
        },
      }));
      ui.toast('Đã ghi nhận yêu cầu hẹn tái khám', '📅', 'success');
      return true;
    },
    setTechOnline: (v) => {
      up(() => ({ techOnline: v }));
      ui.toast(v ? 'Bạn đang trực tuyến' : 'Đã tạm nghỉ nhận việc', v ? '🟢' : '⏸');
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
    rateOrder: (code, stars, text) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== 'done' || o.rating) return;
      const now = Date.now();
      const review = { name: s.user.name || o.address?.name || 'Khách hàng', date: fmtDate(now), stars, text, mine: true };
      const ptEntry = { id: uid(), title: `Đánh giá dịch vụ đơn ${code} (${stars}★)`, delta: 20, at: now, orderCode: code };
      up((p) => {
        const userReviews = { ...p.userReviews };
        o.items.forEach((it) => { userReviews[it.id] = [review, ...(userReviews[it.id] || [])]; });
        const nextOrders = p.orders.map((x) => (x.code === code ? { ...x, rating: { stars, text } } : x));
        let techProfile = p.techProfile;
        if (techProfile && o.tech?.code === techProfile.code) {
          const rated = nextOrders.filter((x) => x.tech?.code === techProfile.code && x.rating);
          const avg = rated.length
            ? Math.round((rated.reduce((sum, x) => sum + x.rating.stars, 0) / rated.length) * 10) / 10
            : stars;
          techProfile = { ...techProfile, rating: avg };
        }
        return {
          orders: nextOrders,
          userReviews,
          points: p.points + 20,
          lifetimePoints: p.lifetimePoints + 20,
          pointHistory: [ptEntry, ...(p.pointHistory || [])],
          techProfile,
          techNotifs: pushTech(p, { icon: '⭐', title: `Khách đánh giá ${stars}★ · ${code}`, body: text || 'Không có nhận xét.', link: { name: 'tech-job', params: { code } } }),
        };
      });
      if (authTokens.get() && o.dbRequestId) {
        hrmssApi.reviewCustomerRequest(o.dbRequestId, {
          rating: stars,
          review_text: text || 'Hài lòng với dịch vụ kỹ thuật viên Minh Đức.',
          punctuality_rating: stars,
          attitude_rating: stars,
          expertise_rating: stars,
        }).catch(() => {});
      }
      ui.toast('Cảm ơn bạn! +20 điểm', '⭐');
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
    deleteAccount: () => {
      const currentId = s.auth?.id;
      if (currentId) {
        deleteAccountById(currentId);
      }
      hrmssApi.logout();
      clearSession();
      up((p) => {
        const resetSlice = switchCustomerSlice(p, null);
        return {
          ...resetSlice,
          auth: null,
          role: 'customer',
          techProfile: null,
          user: { name: '', phone: '', email: '' },
          cart: [],
        };
      });
      setStack([]);
      setTab('home');
      ui.toast('Đã xoá tài khoản thành công', '🗑️');
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
