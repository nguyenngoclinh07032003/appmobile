import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform } from 'react-native';
import {
  getService, MAINT_MONTHS, TECH_ME, REDEEM_OPTIONS, formatVND, catLabel, HOTLINE, serviceKind, matchJobForTech,
} from './data';
export { matchJobForTech } from './data';
import {
  getSession, clearSession, loginAccount, registerAccount, urlRoleHint, resetPassword, changePassword, quickLoginRole,
} from './auth';
import {
  TECH_POLICY, normalizeTechRep, isTechLocked, techLockReason, assessCancelAfterAccept, assessLateness,
  applyTechPenalty, applyTechBonus, mintWalletVoucher, slotStartTs,
} from './techPolicy';
import { buildDemoScenario, DEMO_CODES } from './demoSeed';
import { advanceTracking } from './geo';
export {
  TECH_POLICY, isTechLocked, techLockReason, assessCancelAfterAccept, assessLateness,
  reputationTone, normalizeTechRep, slotStartTs,
} from './techPolicy';

// ---------------------------------------------------------------------------
// Tiện ích thời gian
// ---------------------------------------------------------------------------
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (ts) => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtDateTime = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
export const timeAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return fmtDate(ts);
};
const addMonths = (ts, m) => { const d = new Date(ts); d.setMonth(d.getMonth() + m); return d.getTime(); };
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Tình trạng bảo dưỡng của 1 thiết bị — dùng ở Trang chủ + Thiết bị
export const deviceStatus = (d) => {
  const months = MAINT_MONTHS[d.category] || 6;
  if (!d.lastService) {
    return { level: 'due', short: 'Nên bảo dưỡng', label: 'Chưa có lịch sử bảo dưỡng', progress: 1, months };
  }
  const next = addMonths(d.lastService, months);
  const total = next - d.lastService;
  const left = next - Date.now();
  const days = Math.ceil(left / DAY);
  const progress = Math.min(1, Math.max(0, 1 - left / total));
  if (days <= 0) return { level: 'overdue', short: 'Quá hạn', label: `Quá hạn ${-days} ngày`, progress: 1, next, months };
  if (days <= 30) return { level: 'soon', short: 'Sắp đến hạn', label: `Còn ${days} ngày đến hạn`, progress, next, months };
  return { level: 'ok', short: 'Tốt', label: `Lần tới: ${fmtDate(next)}`, progress, next, months };
};

export const LAST_SERVICE_OPTIONS = [
  { id: 'unknown', label: 'Chưa rõ', ago: null },
  { id: '1m', label: '1 tháng trước', ago: 1 },
  { id: '4m', label: '4 tháng trước', ago: 4 },
  { id: '7m', label: 'Hơn 6 tháng', ago: 7 },
];

export const cartTotal = (items) => items.reduce((sum, it) => sum + (getService(it.id)?.price || 0) * it.qty, 0);
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'onway', 'diagnosing', 'quoted', 'repairing'];
export const isActiveOrder = (o) => ACTIVE_STATUSES.includes(o.status);
// Giá trị dịch vụ khách đã đặt (sau giảm giá dịch vụ, trước voucher)
export const bookedValue = (o) => (o.kind === 'warranty' ? 0 : (o.goods || 0) - (o.productDiscount || 0));
/** Số tiền giảm do thợ đến muộn (theo % nhân công, có trần) */
export const lateDiscountAmount = (o) => {
  const lc = o?.lateCompensation;
  if (!lc?.percent) return 0;
  const labor = o.quote?.total != null ? o.quote.total : bookedValue(o);
  const raw = Math.round(Math.max(0, labor) * (lc.percent / 100));
  const cap = lc.maxDiscount != null ? lc.maxDiscount : (lc.percent >= 50 ? 200000 : 100000);
  return Math.min(raw, cap);
};
// Số tiền khách phải trả: báo giá (nếu có) − voucher − bồi thường đến muộn
export const orderTotal = (o) => {
  const base = o.finalTotal != null ? o.finalTotal : o.total;
  return Math.max(0, base - lateDiscountAmount(o));
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
export const warrantyInfo = (o, orders = []) => {
  if (o.status === 'cancelled') return { ok: false, text: 'Đơn đã huỷ nên không được bảo hành.' };
  if (o.kind === 'warranty') return { ok: false, text: 'Đây là đơn bảo hành.' };
  const open = orders.find((x) => x.kind === 'warranty' && x.warrantyOf === o.code && isActiveOrder(x));
  if (open) return { ok: false, pending: true, openCode: open.code, text: `Đã có yêu cầu bảo hành ${open.code} đang xử lý.` };
  const covered = o.items.filter((it) => ['clean', 'gas'].includes(serviceKind(getService(it.id))));
  if (!covered.length) return { ok: false, text: 'Đơn này không thuộc diện bảo hành 60 ngày (chỉ áp dụng dịch vụ vệ sinh, nạp gas).' };
  if (o.status !== 'done') return { ok: false, pending: true, text: 'Bảo hành 60 ngày sẽ bắt đầu khi đơn hoàn thành.' };
  const left = Math.ceil((o.doneAt + 60 * DAY - Date.now()) / DAY);
  if (left <= 0) return { ok: false, text: 'Đơn đã hết thời hạn bảo hành 60 ngày.' };
  return { ok: true, daysLeft: left, until: o.doneAt + 60 * DAY, text: `Còn ${left} ngày bảo hành (đến ${fmtDate(o.doneAt + 60 * DAY)}).` };
};

// ---------------------------------------------------------------------------
// State ban đầu + lưu trữ (localStorage trên web)
// ---------------------------------------------------------------------------
const KEY = 'tho-dmx-state-v2';
const welcome = () => ({
  id: uid(), at: Date.now(), read: false, icon: '🎉',
  title: 'Chào mừng bạn đến với Thợ ĐMX',
  body: 'Nhập mã THO20 để được giảm 20.000đ cho đơn từ 150.000đ.',
  link: { name: 'rewards' },
});
// Hồ sơ thợ: giữ khu vực/chuyên môn đã lưu, cập nhật tên/SĐT từ tài khoản đăng nhập
const mergeTechProfile = (prev, account) => {
  const code = account.techCode || prev?.code || TECH_ME.code;
  const same = prev?.code === code ? prev : null;
  const rep = normalizeTechRep(same || prev || {});
  return {
    name: account.name || same?.name || TECH_ME.name,
    phone: account.phone || same?.phone || TECH_ME.phone,
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
  'addresses', 'selectedAddressId', 'cart', 'devices', 'favorites',
  'notifications', 'points', 'lifetimePoints', 'myVouchers', 'searches',
];
const makeCustomerSlice = () => ({
  addresses: [],
  selectedAddressId: null,
  cart: [],
  devices: [],
  favorites: [],
  notifications: [welcome()],
  points: 0,
  lifetimePoints: 0,
  myVouchers: [],
  searches: [],
});
const extractCustomerSlice = (state) => {
  const out = {};
  CUSTOMER_SLICE_KEYS.forEach((k) => { out[k] = state[k]; });
  return out;
};
const isOrderOfCustomer = (o, phone) => {
  if (!phone) return true;
  const p = String(phone).trim();
  const op = String(o?.customerPhone || o?.address?.phone || '').trim();
  return !op || op === p;
};
// Khi đổi tài khoản khách hàng: lưu dữ liệu khách cũ vào customerProfiles[oldPhone], nạp dữ liệu khách mới
const switchCustomerSlice = (prev, nextAccount) => {
  const profiles = { ...(prev.customerProfiles || {}) };
  const prevPhone = prev.auth?.role === 'customer' ? prev.auth.phone : (prev.role === 'customer' ? prev.user?.phone : null);
  if (prevPhone) {
    profiles[prevPhone] = extractCustomerSlice(prev);
  }
  if (nextAccount?.role === 'customer' && nextAccount.phone) {
    const loaded = profiles[nextAccount.phone] || makeCustomerSlice();
    profiles[nextAccount.phone] = loaded;
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
  declined: [], // legacy — dùng declinedByTech theo mã thợ
  declinedByTech: {}, // { [techCode]: string[] }
  declineLog: [],
  techOnline: true,
  techProfile: null,
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
    // Tự động loại bỏ dữ liệu demo cũ nếu từng được nạp trên trình duyệt
    const cleanOrders = (saved.orders || []).filter((o) => !o?.demo && !String(o?.code || '').startsWith('DMXDEMO'));
    const cleanDevices = (saved.devices || []).filter((d) => !d?.demo && d?.id !== 'demo-dev-ml');
    const cleanAddresses = (saved.addresses || []).filter((a) => a?.id !== 'demo-addr-hn');
    const baseState = {
      ...makeInitial(),
      ...saved,
      orders: cleanOrders,
      devices: cleanDevices,
      addresses: cleanAddresses,
      selectedAddressId: saved.selectedAddressId === 'demo-addr-hn' ? (cleanAddresses[0]?.id || null) : saved.selectedAddressId,
      role,
      user,
      auth: session,
      techProfile: session?.role === 'tech'
        ? mergeTechProfile(saved.techProfile, session)
        : (saved.techProfile || null),
    };
    if (session?.role === 'customer' && session.phone) {
      const profiles = { ...(baseState.customerProfiles || {}) };
      if (profiles[session.phone]) {
        return { ...baseState, ...profiles[session.phone], customerProfiles: profiles };
      }
      // Nếu tài khoản đang mở trùng với user đã lưu thì gán slice hiện tại cho tài khoản đó, ngược lại tạo mới
      const savedPhone = saved.user?.phone || cleanAddresses[0]?.phone;
      const slice = (!savedPhone || savedPhone === session.phone)
        ? extractCustomerSlice(baseState)
        : makeCustomerSlice();
      profiles[session.phone] = slice;
      return { ...baseState, ...slice, customerProfiles: profiles };
    }
    return baseState;
  });
  const up = (fn) => setS((prev) => {
    const patch = fn(prev) || {};
    const next = { ...prev, ...patch };
    const activeCustPhone = next.auth?.role === 'customer' ? next.auth.phone : null;
    if (activeCustPhone && !patch.customerProfiles) {
      next.customerProfiles = {
        ...(next.customerProfiles || {}),
        [activeCustPhone]: extractCustomerSlice(next),
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
  const [svc, setSvc] = useState({ tab: 'bao-duong', category: 'may-lanh', kindCat: 'all', sort: 'popular' });
  // Mã voucher được chọn ở "Quyền lợi" → tự áp dụng khi mở màn Xác nhận đặt lịch
  const [pendingVoucher, setPendingVoucher] = useState(null);
  // Thiết bị được chọn từ màn "Thiết bị của tôi" → tự gắn vào đơn khi đặt lịch
  const [pendingDeviceId, setPendingDeviceId] = useState(null);
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
    services: (serviceTab, category, deviceId = null) => {
      if (deviceId) setPendingDeviceId(deviceId);
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
    toast: (text, icon = '✓') => setToastMsg({ text, icon, id: uid() }),
    toastMsg,
    dialog: (cfg) => setDialogCfg(cfg),
    dialogCfg,
    closeDialog: () => setDialogCfg(null),
    confirm: (title, message, onOk, okLabel = 'Đồng ý', danger = false) => setDialogCfg({
      title, message,
      actions: [{ label: 'Huỷ', variant: 'ghost' }, { label: okLabel, variant: danger ? 'danger' : 'primary', onPress: onOk }],
    }),
    alert: (title, message, icon) => setDialogCfg({ title, message, icon, actions: [{ label: 'Đã hiểu', variant: 'primary' }] }),
    call: () => setDialogCfg({
      icon: '📞',
      title: `Hotline ${HOTLINE}`,
      message: 'Tổng đài hỗ trợ Thợ Điện Máy XANH hoạt động 7:30 – 22:00 mỗi ngày (miễn phí).',
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

  const a = {
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

    // Thiết bị
    addDevice: ({ category, brand, room, lastAgo }) => {
      const lastService = lastAgo ? addMonths(Date.now(), -lastAgo) : null;
      const d = { id: uid(), category, brand: brand.trim(), room: room?.trim() || '', lastService, createdAt: Date.now() };
      up((p) => ({
        devices: [...p.devices, d],
        notifications: pushNotif(p, {
          icon: '📺', title: `Đã thêm ${catLabel(category)}`,
          body: 'Thợ ĐMX sẽ nhắc bạn khi đến kỳ bảo dưỡng.', link: { tab: 'devices' },
        }),
      }));
      ui.toast('Đã lưu thiết bị');
    },
    updateDevice: (id, patch) => up((p) => ({ devices: p.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
    removeDevice: (id) => { up((p) => ({ devices: p.devices.filter((d) => d.id !== id) })); ui.toast('Đã xoá thiết bị'); },

    // Địa chỉ + hồ sơ
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
      ui.toast('Đã lưu địa chỉ', '📍');
      return id;
    },
    deleteAddress: (id) => up((p) => {
      const list = p.addresses.filter((x) => x.id !== id);
      if (list.length && !list.some((x) => x.isDefault)) list[0] = { ...list[0], isDefault: true };
      return { addresses: list, selectedAddressId: p.selectedAddressId === id ? (list[0]?.id || null) : p.selectedAddressId };
    }),
    selectAddress: (id) => up(() => ({ selectedAddressId: id })),
    updateUser: (u) => { up((p) => ({ user: { ...p.user, ...u } })); ui.toast('Đã cập nhật thông tin'); },

    // Đơn hàng
    placeOrder: (payload) => {
      const code = `DMX${String(Date.now()).slice(-6)}`;
      const now = Date.now();
      const customerPhone = s.auth?.phone || s.user?.phone || address?.phone || '';
      const order = {
        ...payload,
        code,
        kind: payload.kind || 'normal',
        customerPhone,
        customerAccountId: s.auth?.id || null,
        device: payload.device || null,
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
      return code;
    },

    // ------------------------- PHÍA THỢ -------------------------
    // Nhận việc được giao (chỉ khi đang trực tuyến + không bị khóa uy tín)
    acceptJob: (code) => {
      let result = 'missing';
      up((p) => {
        if (!p.techOnline) { result = 'offline'; return {}; }
        const tech0 = p.techProfile || TECH_ME;
        if (isTechLocked(tech0)) { result = 'locked'; return {}; }
        const activeCount = p.orders.filter((x) => x.tech?.code === (tech0.code || TECH_ME.code) && isActiveOrder(x)).length;
        if (activeCount >= TECH_POLICY.maxActiveJobs) { result = 'busy'; return {}; }
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status !== 'pending') { result = 'bad'; return {}; }
        const want = String(o.workerCode || '').trim().toUpperCase();
        const my = String(tech0.code || '').toUpperCase();
        if (want && want !== my) { result = 'not_assigned'; return {}; }
        const tech = { ...normalizeTechRep(tech0), ...tech0 };
        const now = Date.now();
        result = 'ok';
        return {
          orders: p.orders.map((x) => (x.code === code
            ? withStatus(o, 'confirmed', now, { tech: { ...tech }, dispatchNote: null, acceptedAt: now })
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
      if (result === 'offline') {
        ui.alert('Đang tạm nghỉ', 'Bật trực tuyến ở đầu trang Công việc để nhận việc mới.', '⏸');
        return;
      }
      if (result === 'locked') {
        ui.alert('Đang bị hạn chế nhận việc', techLockReason(s.techProfile) || 'Uy tín thợ đang thấp hoặc đang trong thời gian khóa.', '🚫');
        return;
      }
      if (result === 'busy') {
        ui.alert('Đã đủ việc đang làm', `Bạn đang giữ tối đa ${TECH_POLICY.maxActiveJobs} việc. Hoàn thành hoặc trả việc trước khi nhận thêm.`, '🧰');
        return;
      }
      if (result === 'not_assigned') {
        ui.alert('Việc đã chỉ định thợ khác', 'Khách đã chọn mã Thợ Now khác. Bạn không thể nhận việc này.', '🧑‍🔧');
        return;
      }
      if (result === 'ok') ui.toast('Đã nhận việc', '👍');
      else ui.alert('Không nhận được', 'Việc không còn ở trạng thái chờ nhận.', 'ℹ️');
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
            icon: assess.free ? '↩️' : '⚠️',
            title: assess.free ? `Đã trả việc ${code}` : `Trả việc · −${assess.points} uy tín · ${code}`,
            body: assess.label + (assess.lockMs ? ' · tạm hạn chế nhận việc mới.' : ''),
            link: { name: 'tech-account' },
          }),
        };
      });
      if (!outcome?.ok) {
        ui.alert('Không trả việc được', outcome?.error || 'Thử lại sau.', 'ℹ️');
        return outcome;
      }
      if (outcome.assess.free) ui.toast('Đã trả việc (miễn phạt)', '↩️');
      else {
        ui.alert(
          `Đã trừ ${outcome.assess.points} điểm uy tín`,
          `${outcome.assess.label}. ${outcome.locked ? (outcome.lockReason || 'Bạn tạm thời bị hạn chế nhận việc mới.') : 'Hạn chế hủy sát giờ để giữ uy tín.'}`,
          '⚠️',
        );
      }
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
      up((p) => {
        const base = p.techProfile || TECH_ME;
        const next = { ...base, ...patch, ...normalizeTechRep({ ...base, ...patch }) };
        return {
          techProfile: next,
          user: {
            ...p.user,
            name: patch.name != null ? patch.name : p.user.name,
            phone: patch.phone != null ? patch.phone : p.user.phone,
          },
        };
      });
      ui.toast('Đã cập nhật hồ sơ thợ');
    },
    startTravel: (code) => {
      const now = Date.now();
      let lateHint = '';
      let ok = false;
      updateOrder(code, (o) => {
        if (o.status !== 'confirmed') return {};
        ok = true;
        const start = slotStartTs(o);
        if (start != null && now > start + TECH_POLICY.lateGraceMin * 60000) {
          lateHint = `Bạn đã quá giờ hẹn ~${Math.floor((now - start) / 60000)} phút. Check-in muộn sẽ bị trừ uy tín.`;
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
        return {
          order: withStatus(o, 'onway', now, { travelStartedAt: now, tracking }),
          customer: { icon: '🛵', title: `Thợ đang đến · ${code}`, body: `Thợ ${o.tech?.name || ''} đang di chuyển tới địa chỉ của bạn. Mở đơn để theo dõi.` },
        };
      });
      if (!ok) { ui.alert('Không cập nhật được', 'Chỉ bấm “Đang đến” khi đã nhận việc.', 'ℹ️'); return; }
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
    sendOrderChat: (code, text, from) => {
      const msg = String(text || '').trim();
      if (!msg) return;
      const now = Date.now();
      const row = { id: uid(), from: from === 'tech' ? 'tech' : 'customer', text: msg.slice(0, 400), at: now };
      let ok = false;
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status === 'cancelled') return {};
        if (!o.tech && o.status === 'pending') return {};
        ok = true;
        const chat = [...(o.chat || []), row];
        const patch = { orders: p.orders.map((x) => (x.code === code ? { ...x, chat } : x)) };
        if (from === 'tech') {
          return {
            ...patch,
            notifications: pushNotif(p, {
              icon: '💬', title: `Thợ nhắn tin · ${code}`, body: msg.slice(0, 80),
              link: { name: 'order', params: { code } },
            }),
          };
        }
        return {
          ...patch,
          techNotifs: pushTech(p, {
            icon: '💬', title: `Khách nhắn tin · ${code}`, body: msg.slice(0, 80),
            link: { name: 'tech-job', params: { code } },
          }),
        };
      });
      if (!ok) ui.alert('Chưa gửi được', 'Chat khả dụng sau khi thợ nhận đơn.', '💬');
    },
    loadDemoScenario: () => {
      let summary = null;
      up((p) => {
        const built = buildDemoScenario(p);
        summary = built.summary;
        const { summary: _s, ...patch } = built;
        return {
          ...patch,
          notifications: pushNotif(p, {
            icon: '🎬',
            title: 'Đã nạp kịch bản demo',
            body: `Theo dõi ${DEMO_CODES.onway} · Duyệt báo giá ${DEMO_CODES.quoted} · Thanh toán ${DEMO_CODES.done}`,
            link: { name: 'order', params: { code: DEMO_CODES.onway } },
          }),
          techNotifs: pushTech(p, {
            icon: '🎬',
            title: 'Demo: việc mới + đang đến',
            body: `Nhận ${DEMO_CODES.pending} · Check-in ${DEMO_CODES.onway}`,
            link: { name: 'tech-job', params: { code: DEMO_CODES.pending } },
          }),
        };
      });
      ui.alert(
        'Kịch bản demo sẵn sàng',
        [
          `${DEMO_CODES.pending}: việc mới (thợ nhận)`,
          `${DEMO_CODES.onway}: đang đến + theo dõi GPS`,
          `${DEMO_CODES.quoted}: chờ khách duyệt báo giá`,
          `${DEMO_CODES.done}: hoàn thành + thanh toán QR`,
          '',
          'Mở 2 tab Khách + Thợ để demo đồng bộ.',
        ].join('\n'),
        '🎬',
      );
      return summary;
    },
    arrive: (code, checkIn = null) => {
      let lateInfo = null;
      let ok = false;
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status !== 'onway') return {};
        ok = true;
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
          accuracy: checkIn.accuracy,
          simulated: !!checkIn.simulated,
          label: checkIn.label || (checkIn.simulated ? 'Vị trí mô phỏng' : 'GPS thiết bị'),
          at: now,
        } : { simulated: true, label: 'Không có dữ liệu vị trí', at: now };
        const geoNote = checkInPayload.simulated
          ? ' (vị trí mô phỏng — trình duyệt không cấp GPS)'
          : ` (GPS ±${checkInPayload.accuracy || '?'}m)`;
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
            icon: late.tier === 'ok' ? '🔍' : '⏰',
            title: late.tier === 'ok' ? `Thợ đã đến · ${code}` : `Thợ đến muộn ${late.minutesLate} phút · ${code}`,
            body,
            link: { name: 'order', params: { code } },
          }),
          ...(late.tier !== 'ok' ? {
            techNotifs: pushTech(p, {
              icon: '⏰',
              title: `Check-in muộn · −${late.points} uy tín · ${code}`,
              body: late.label,
              link: { name: 'tech-account' },
            }),
          } : {}),
        };
      });
      if (!ok) { ui.alert('Không check-in được', 'Chỉ check-in khi đang ở trạng thái “Đang đến”.', 'ℹ️'); return; }
      if (lateInfo && lateInfo.tier !== 'ok') {
        ui.alert(
          `Check-in muộn · −${lateInfo.points} uy tín`,
          `${lateInfo.label}. Khách được bồi thường theo chính sách đúng giờ.`,
          '⏰',
        );
      } else ui.toast(checkIn?.simulated ? 'Check-in (vị trí mô phỏng)' : 'Đã check-in tại nhà khách', '📍');
    },
    // Khách xác nhận đã thanh toán (sau khi hoàn thành)
    confirmPayment: (code) => {
      let ok = false;
      updateOrder(code, (o) => {
        if (o.status !== 'done') return {};
        ok = true;
        const report = { ...(o.report || {}), paid: true, paidAt: Date.now(), paidBy: 'customer' };
        return {
          order: { ...o, report },
          tech: { icon: '💳', title: `Khách xác nhận đã thanh toán · ${code}`, body: o.payment || 'Đã thanh toán' },
        };
      });
      if (ok) ui.toast('Đã ghi nhận thanh toán', '💳');
      else ui.alert('Không cập nhật được', 'Chỉ xác nhận thanh toán khi đơn đã hoàn thành.', 'ℹ️');
    },
    dismissTip: (key) => up((p) => ({ tips: { ...(p.tips || {}), [key]: false } })),
    // SUC-042..045 + báo giá — chẩn đoán (triệu chứng / kết luận / đề xuất) rồi gửi báo giá
    submitQuote: (code, { diagnosis, symptoms, recommendation, lines }) => {
      const now = Date.now();
      const qTotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      let ok = false;
      updateOrder(code, (o) => {
        if (o.status !== 'diagnosing') return {};
        ok = true;
        const booked = bookedValue(o);
        const needsApproval = qTotal > booked;
        const quote = {
          diagnosis,
          symptoms: symptoms || '',
          recommendation: recommendation || '',
          lines,
          total: qTotal,
          booked,
          needsApproval,
          at: now,
          approved: !needsApproval,
        };
        const materials = lines.filter((l) => l.type === 'part').map((l) => ({ id: uid(), matId: l.matId, name: l.name, unit: l.unit, qty: l.qty }));
        if (needsApproval) {
          return {
            order: withStatus(o, 'quoted', now, { quote, materials }),
            customer: { icon: '🧾', title: `Báo giá mới cho đơn ${code}`, body: `Tổng ${formatVND(qTotal)} (phát sinh ${formatVND(qTotal - booked)}). Vui lòng duyệt để thợ bắt đầu.` },
          };
        }
        return {
          order: withStatus(o, 'repairing', now, { quote, materials, finalTotal: Math.max(0, qTotal - (o.voucherDiscount || 0)) }),
          customer: { icon: '🔧', title: `Thợ bắt đầu thực hiện · ${code}`, body: `Chẩn đoán: ${diagnosis || 'Đã kiểm tra'}. Không phát sinh chi phí.` },
        };
      });
      if (!ok) { ui.alert('Không gửi được', 'Chỉ gửi báo giá khi đang ở bước kiểm tra thiết bị.', 'ℹ️'); return; }
      ui.toast(qTotal > 0 ? 'Đã gửi chẩn đoán & báo giá' : 'Đã gửi chẩn đoán', '🧾');
    },
    // Khách duyệt / yêu cầu sửa báo giá / từ chối & huỷ đơn
    respondQuote: (code, decision, reason) => {
      const now = Date.now();
      updateOrder(code, (o, p) => {
        if (o.status !== 'quoted' || !o.quote) return {};
        if (decision === true || decision === 'approve') {
          return {
            order: withStatus(o, 'repairing', now, {
              quote: { ...o.quote, approved: true, revisionRequested: false, respondedAt: now },
              finalTotal: Math.max(0, o.quote.total - (o.voucherDiscount || 0)),
            }),
            tech: { icon: '✅', title: `Khách đã duyệt báo giá · ${code}`, body: `Tổng ${formatVND(o.quote.total)}. Bắt đầu thực hiện.` },
          };
        }
        if (decision === 'revise') {
          return {
            order: withStatus(o, 'diagnosing', now, {
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
        return {
          order: withStatus(o, 'cancelled', now, {
            quote: { ...o.quote, approved: false, revisionRequested: false, rejectReason: reason, respondedAt: now },
            cancelReason: `Khách từ chối báo giá${reason ? `: ${reason}` : ''}`,
          }),
          tech: { icon: '❌', title: `Khách từ chối báo giá · ${code}`, body: reason || 'Đơn đã kết thúc, không thu phí.' },
          extra: { myVouchers: o.voucher?.wallet ? [o.voucher, ...p.myVouchers] : p.myVouchers },
          customerProfilePatch: (prof) => ({
            myVouchers: o.voucher?.wallet ? [o.voucher, ...(prof.myVouchers || [])] : (prof.myVouchers || []),
          }),
        };
      });
      if (decision === true || decision === 'approve') ui.toast('Đã duyệt báo giá', '✅');
      else if (decision === 'revise') ui.toast('Đã gửi yêu cầu báo giá lại cho thợ', '🔄');
      else ui.toast('Đã từ chối báo giá & huỷ đơn', '✖️');
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
          || raw.toUpperCase().includes(`THODMX:${custPhone}`)
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
              qrCode: `THODMX:${custPhone || o.address?.name || code}`,
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
      updateOrder(code, (o) => ({
        order: { ...o, materials: [...(o.materials || []), { id: uid(), matId: mat.id, name: mat.name, unit: mat.unit, qty: 1, price: mat.price }] },
        customer: { icon: '🔩', title: `Thợ ghi nhận vật tư · ${code}`, body: `${mat.name} · xem chi tiết đơn để theo dõi.` },
      }));
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
    // SUC-061 — ghi chú sửa chữa (khác với % tiến độ)
    addRepairNote: (code, text) => {
      const note = String(text || '').trim();
      if (!note) { ui.alert('Thiếu nội dung', 'Nhập ghi chú công việc đã làm.', '📝'); return; }
      updateOrder(code, (o) => ({
        order: { ...o, repairNotes: [...(o.repairNotes || []), { id: uid(), text: note, at: Date.now() }] },
        customer: { icon: '📝', title: `Thợ cập nhật ghi chú · ${code}`, body: note },
      }));
      ui.toast('Đã lưu ghi chú sửa chữa', '📝');
    },
    // SUC-073..076 — tạo lịch tái khám / follow-up
    createFollowUp: (code, { reason, remaining, dateLabel, dateKey, slot }) => {
      const now = Date.now();
      let created = null;
      up((p) => {
        const o = p.orders.find((x) => x.code === code);
        if (!o || o.status !== 'done') return {};
        const fuCode = `FU${String(now).slice(-6)}`;
        created = fuCode;
        const follow = {
          ...o,
          code: fuCode,
          kind: 'followup',
          parentCode: code,
          status: 'confirmed',
          tech: o.tech,
          quote: null,
          progress: [],
          materials: [],
          evidence: [],
          repairNotes: [],
          report: null,
          rating: null,
          followUp: { reason, remaining, of: code },
          note: `Tái khám cho ${code}. ${remaining || ''}`.trim(),
          dateLabel,
          dateKey,
          slot,
          history: [{ status: 'confirmed', at: now }],
          createdAt: now,
          goods: 0,
          productDiscount: 0,
          voucherDiscount: 0,
          total: 0,
        };
        return {
          orders: [
            follow,
            ...p.orders.map((x) => (x.code === code ? { ...x, followUpCreated: fuCode } : x)),
          ],
          notifications: pushNotif(p, {
            icon: '🔄',
            title: `Đã hẹn tái khám · ${fuCode}`,
            body: `${dateLabel} · ${slot}. ${reason || ''}`.trim(),
            link: { name: 'order', params: { code: fuCode } },
          }),
          techNotifs: pushTech(p, {
            icon: '🔄',
            title: `Tái khám ${fuCode}`,
            body: `${dateLabel} · ${slot} · ${o.address?.area || ''}`,
            link: { name: 'tech-job', params: { code: fuCode } },
          }),
        };
      });
      if (created) ui.toast('Đã tạo lịch tái khám', '🔄');
      return created;
    },
    // SUC-019 — khách sửa yêu cầu khi còn chờ thợ nhận
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
    changePassword: (payload) => {
      if (!s.auth?.id) return { ok: false, error: 'Chưa đăng nhập.' };
      const res = changePassword({ accountId: s.auth.id, ...payload });
      if (res.ok) ui.toast('Đã đổi mật khẩu', '🔐');
      return res;
    },
    resetPassword: (payload) => {
      const res = resetPassword(payload);
      if (res.ok) ui.toast('Đã đặt lại mật khẩu. Hãy đăng nhập lại.', '🔐');
      return res;
    },
    // Biên bản hoàn thành → đơn hoàn tất, cộng điểm cho khách, cập nhật lịch bảo dưỡng đúng thiết bị
    completeJob: (code, { summary, paid }) => {
      const now = Date.now();
      const o0 = s.orders.find((x) => x.code === code);
      if (!o0 || o0.status !== 'repairing') {
        ui.alert('Không hoàn thành được', 'Chỉ hoàn thành khi đang ở trạng thái sửa chữa.', 'ℹ️');
        return;
      }
      const total = orderTotal(o0);
      const earned = o0.kind !== 'warranty' ? Math.max(1, Math.floor(total / 10000)) : 0;
      const cats = new Set(o0.items.map((it) => getService(it.id)?.category));
      const targetDeviceId = o0.device?.id || null;
      const updateDevList = (devs = []) => devs.map((dv) => {
        if (targetDeviceId) return dv.id === targetDeviceId ? { ...dv, lastService: now } : dv;
        return cats.has(dv.category) ? { ...dv, lastService: now } : dv;
      });
      const onTimeBonus = !o0.lateCompensation || o0.lateCompensation.tier === 'soft' ? 2 : 1;
      updateOrder(code, (o, p) => {
        const boosted = applyTechBonus(p.techProfile || TECH_ME, onTimeBonus);
        return {
          order: withStatus(o, 'done', now, {
            doneAt: now,
            report: {
              summary,
              paid: !!paid,
              at: now,
              tech: o.tech?.name,
              ...(paid ? { paidAt: now, paidBy: 'tech' } : {}),
            },
          }),
          customer: { icon: '✅', title: `Đơn ${code} đã hoàn thành`, body: earned ? `Bạn nhận được +${earned} điểm. Đánh giá để nhận thêm 20 điểm!` : 'Cảm ơn bạn đã sử dụng dịch vụ.' },
          extra: {
            devices: updateDevList(p.devices),
            points: p.points + earned,
            lifetimePoints: p.lifetimePoints + earned,
            techProfile: {
              ...boosted,
              jobs: (boosted.jobs || 0) + 1,
            },
          },
          customerProfilePatch: (prof) => ({
            devices: updateDevList(prof.devices || []),
            points: (prof.points || 0) + earned,
            lifetimePoints: (prof.lifetimePoints || 0) + earned,
          }),
        };
      });
      ui.toast(`Đã hoàn thành · +${onTimeBonus} uy tín`, '🎉');
    },
    setTechOnline: (v) => {
      if (v && isTechLocked(s.techProfile)) {
        ui.alert('Chưa thể trực tuyến', techLockReason(s.techProfile) || 'Uy tín đang bị hạn chế.', '🚫');
        return;
      }
      up(() => ({ techOnline: v }));
      ui.toast(v ? 'Bạn đang trực tuyến' : 'Đã tạm nghỉ nhận việc', v ? '🟢' : '⏸');
    },
    readTechNotif: (id) => up((p) => ({ techNotifs: p.techNotifs.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
    readAllTech: () => up((p) => ({ techNotifs: p.techNotifs.map((n) => ({ ...n, read: true })) })),
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
    },
    login: (payload) => {
      const res = loginAccount(payload);
      if (!res.ok) return res;
      up((p) => ({
        ...switchCustomerSlice(p, res.account),
        auth: res.account,
        role: res.account.role,
        user: {
          name: res.account.name || '',
          phone: res.account.phone || '',
          email: res.account.email || '',
        },
        techProfile: res.account.role === 'tech' ? mergeTechProfile(p.techProfile, res.account) : p.techProfile,
      }));
      setStack([]);
      setTab(res.account.role === 'tech' ? 'tech-jobs' : 'home');
      ui.toast(res.account.role === 'tech' ? 'Đăng nhập app Thợ thành công' : 'Đăng nhập thành công', '👋');
      return res;
    },
    register: (payload) => {
      const res = registerAccount(payload);
      if (!res.ok) return res;
      up((p) => ({
        ...switchCustomerSlice(p, res.account),
        auth: res.account,
        role: res.account.role,
        user: {
          name: res.account.name || '',
          phone: res.account.phone || '',
          email: res.account.email || '',
        },
        techProfile: res.account.role === 'tech' ? mergeTechProfile(p.techProfile, res.account) : p.techProfile,
      }));
      setStack([]);
      setTab(res.account.role === 'tech' ? 'tech-jobs' : 'home');
      ui.toast(res.account.role === 'tech' ? 'Tạo tài khoản Thợ thành công' : 'Tạo tài khoản thành công', '🎉');
      return res;
    },
    // Đăng nhập nhanh 1 chạm theo vai trò (Khách hàng / Kỹ thuật viên)
    quickLogin: (role, link) => {
      const res = quickLoginRole(role);
      if (!res?.ok) return res;
      const acc = res.account;
      up((p) => ({
        ...switchCustomerSlice(p, acc),
        auth: acc,
        role: acc.role,
        user: {
          name: acc.name || '',
          phone: acc.phone || '',
          email: acc.email || '',
        },
        techProfile: acc.role === 'tech' ? mergeTechProfile(p.techProfile, acc) : p.techProfile,
      }));
      setStack(link ? [{ name: link.name, params: link.params || {}, key: uid() }] : []);
      setTab(acc.role === 'tech' ? 'tech-jobs' : 'home');
      ui.toast(acc.role === 'tech' ? `Đã vào chế độ Thợ (${acc.name})` : `Đã vào chế độ Khách (${acc.name})`, acc.role === 'tech' ? '👷' : '🏠');
      return res;
    },
    // Giữ API cũ cho link demo: chỉ hoạt động nếu đã đăng nhập đúng vai trò
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

    cancelOrder: (code, reason) => {
      const now = Date.now();
      const cur = s.orders.find((x) => x.code === code);
      if (!cur || !['pending', 'confirmed'].includes(cur.status)) {
        ui.alert('Không huỷ được', 'Chỉ huỷ khi thợ chưa bắt đầu di chuyển. Sau đó vui lòng gọi hotline.', 'ℹ️');
        return;
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
    },
    rateOrder: (code, stars, text) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o || o.status !== 'done' || o.rating) return;
      const review = { name: s.user.name || o.address?.name || 'Khách hàng', date: fmtDate(Date.now()), stars, text, mine: true };
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
          techProfile,
          techNotifs: pushTech(p, { icon: '⭐', title: `Khách đánh giá ${stars}★ · ${code}`, body: text || 'Không có nhận xét.', link: { name: 'tech-job', params: { code } } }),
        };
      });
      ui.toast('Cảm ơn bạn! +20 điểm', '⭐');
    },
    requestWarranty: (code, note) => {
      const o = s.orders.find((x) => x.code === code);
      if (!o) return null;
      const info = warrantyInfo(o, s.orders);
      if (!info.ok) {
        ui.alert('Không thể gửi yêu cầu', info.text, '🛡️');
        return info.openCode || null;
      }
      const newCode = `BH${String(Date.now()).slice(-6)}`;
      const now = Date.now();
      const items = o.items.filter((it) => ['clean', 'gas'].includes(serviceKind(getService(it.id))));
      const order = {
        code: newCode,
        kind: 'warranty',
        warrantyOf: code,
        customerPhone: o.customerPhone || o.address?.phone || s.auth?.phone || '',
        customerAccountId: o.customerAccountId || s.auth?.id || null,
        device: o.device || null,
        items,
        goods: 0,
        productDiscount: 0,
        voucher: null,
        voucherDiscount: 0,
        total: 0,
        dateLabel: 'Thợ sẽ gọi hẹn giờ',
        slot: 'Trong 24h',
        payment: 'Miễn phí (bảo hành)',
        note: note || 'Yêu cầu bảo hành',
        workerCode: '',
        address: o.address,
        status: 'pending',
        history: [{ status: 'pending', at: now }],
        createdAt: now,
        tech: null,
        rating: null,
        dateKey: todayKey(),
      };
      up((p) => ({
        orders: [order, ...p.orders],
        notifications: pushNotif(p, { icon: '🛡️', title: `Đã gửi yêu cầu bảo hành ${newCode}`, body: `Cho đơn ${code}. Thợ sẽ liên hệ trong 24 giờ.`, link: { name: 'order', params: { code: newCode } } }),
        techNotifs: pushTech(p, { icon: '🛡️', title: `Việc bảo hành ${newCode}`, body: `Bảo hành cho đơn ${code} · ${o.address?.area || ''}`, link: { name: 'tech-job', params: { code: newCode } } }),
      }));
      return newCode;
    },

    // Điểm thưởng
    redeem: (optId) => {
      const opt = REDEEM_OPTIONS.find((x) => x.id === optId);
      if (!opt) return false;
      if (s.points < opt.cost) { ui.alert('Chưa đủ điểm', `Bạn cần ${opt.cost} điểm, hiện có ${s.points} điểm. Hoàn thành đơn hoặc đánh giá để tích thêm điểm.`, '🎯'); return false; }
      const { prefix, ...rest } = opt.voucher;
      const v = { ...rest, code: `${prefix}${Math.random().toString(36).slice(2, 6).toUpperCase()}`, wallet: true };
      up((p) => ({
        points: p.points - opt.cost,
        myVouchers: [v, ...p.myVouchers],
        notifications: pushNotif(p, { icon: '🎁', title: 'Đổi điểm thành công', body: `Mã ${v.code} đã vào ví voucher, dùng ở bước thanh toán.`, link: { name: 'rewards' } }),
      }));
      ui.toast(`Đã nhận voucher ${v.code}`, '🎁');
      return true;
    },

    // Thông báo
    readNotif: (id) => up((p) => ({ notifications: p.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
    readAll: () => up((p) => ({ notifications: p.notifications.map((n) => ({ ...n, read: true })) })),

    // Tìm kiếm
    addSearch: (q) => { const t = q.trim(); if (!t) return; up((p) => ({ searches: [t, ...p.searches.filter((x) => x !== t)].slice(0, 8) })); },
    clearSearches: () => up(() => ({ searches: [] })),

    logout: () => {
      clearSession();
      up((p) => ({ ...switchCustomerSlice(p, null), auth: null, role: 'customer', techProfile: null }));
      setStack([]);
      setTab('home');
      ui.toast('Đã đăng xuất');
    },
    wipeLocalData: () => {
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
  const visibleCustomerOrders = custPhone
    ? s.orders.filter((o) => isOrderOfCustomer(o, custPhone))
    : s.orders;
  const viewS = s.auth?.role === 'customer' ? { ...s, orders: visibleCustomerOrders } : s;
  const meTech = s.techProfile || TECH_ME;

  const derived = {
    address,
    cartCount: s.cart.reduce((sum, it) => sum + it.qty, 0),
    unread: s.notifications.filter((n) => !n.read).length,
    activeOrders: visibleCustomerOrders.filter(isActiveOrder),
    dueDevices: s.devices.filter((d) => deviceStatus(d).level !== 'ok'),
    // Phía thợ
    techUnread: (s.techNotifs || []).filter((n) => !n.read).length,
    newJobs: s.orders
      .filter((o) => {
        if (o.status !== 'pending') return false;
        if (declinedFor(s, myCode).includes(o.code)) return false;
        const want = String(o.workerCode || '').trim().toUpperCase();
        if (want && want !== String(myCode).toUpperCase()) return false;
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
    pendingVoucher, setPendingVoucher, pendingDeviceId, setPendingDeviceId,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
