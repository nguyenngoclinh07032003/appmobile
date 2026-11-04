// Tài khoản + phiên đăng nhập (lưu trên trình duyệt)
// - accounts: localStorage (dùng chung mọi tab / thiết bị trình duyệt)
// - session: sessionStorage (mỗi tab một phiên — Khách và Thợ có thể mở song song)

import { TECH_ME } from './data';

const ACCOUNTS_KEY = 'tho-dmx-accounts-v1';
const SESSION_KEY = 'tho-dmx-session-v1';

const encode = (pw) => {
  try { return btoa(unescape(encodeURIComponent(`dmx:${pw}`))); } catch (e) { return `dmx:${pw}`; }
};
const matchPw = (account, pw) => account.password === encode(pw);

const readJson = (store, key) => {
  try {
    if (!store) return null;
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};
const writeJson = (store, key, value) => {
  try { if (store) store.setItem(key, JSON.stringify(value)); } catch (e) { /* bỏ qua */ }
};
const removeKey = (store, key) => {
  try { if (store) store.removeItem(key); } catch (e) { /* bỏ qua */ }
};

const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const ss = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null);

// Tài khoản khởi tạo khi chưa có dữ liệu (có thể đăng ký thêm tài khoản mới)
const STARTER_ACCOUNTS = [
  {
    id: 'acc-cus-1',
    role: 'customer',
    name: 'Nguyễn Minh Anh',
    phone: '0901234567',
    email: 'khach@thodmx.vn',
    password: encode('123456'),
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: 'acc-tech-1',
    role: 'tech',
    name: TECH_ME.name,
    phone: TECH_ME.phone,
    email: 'tho@thodmx.vn',
    password: encode('123456'),
    techCode: TECH_ME.code,
    createdAt: Date.now() - 86400000 * 90,
  },
];

function loadAccounts() {
  const data = readJson(ls(), ACCOUNTS_KEY);
  if (data?.accounts?.length) return data.accounts;
  writeJson(ls(), ACCOUNTS_KEY, { accounts: STARTER_ACCOUNTS });
  return STARTER_ACCOUNTS.map((a) => ({ ...a }));
}

function saveAccounts(accounts) {
  writeJson(ls(), ACCOUNTS_KEY, { accounts });
}

export function listAccounts() {
  return loadAccounts().map(({ password, ...rest }) => rest);
}

export function findAccountByPhone(phone, role) {
  const p = String(phone || '').replace(/\D/g, '');
  return loadAccounts().find((a) => a.phone === p && (!role || a.role === role)) || null;
}

export function getSession() {
  const session = readJson(ss(), SESSION_KEY);
  if (!session?.accountId) return null;
  const account = loadAccounts().find((a) => a.id === session.accountId);
  if (!account) {
    clearSession();
    return null;
  }
  const { password, ...safe } = account;
  return { ...safe, loggedAt: session.loggedAt };
}

export function clearSession() {
  removeKey(ss(), SESSION_KEY);
}

export function setSession(accountId) {
  writeJson(ss(), SESSION_KEY, { accountId, loggedAt: Date.now() });
}

export function registerAccount({ role, name, phone, email, password }) {
  const r = role === 'tech' ? 'tech' : 'customer';
  const p = String(phone || '').replace(/\D/g, '');
  const n = String(name || '').trim();
  const e = String(email || '').trim();
  const pw = String(password || '');

  if (!['customer', 'tech'].includes(r)) return { ok: false, error: 'Vai trò không hợp lệ.' };
  if (n.length < 2) return { ok: false, error: 'Vui lòng nhập họ tên (ít nhất 2 ký tự).' };
  if (p.length !== 10) return { ok: false, error: 'Số điện thoại phải có đúng 10 chữ số.' };
  if (pw.length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };

  const accounts = loadAccounts();
  if (accounts.some((a) => a.phone === p && a.role === r)) {
    return { ok: false, error: `Số điện thoại này đã đăng ký tài khoản ${r === 'tech' ? 'Thợ' : 'Khách hàng'}.` };
  }

  const account = {
    id: `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    role: r,
    name: n,
    phone: p,
    email: e,
    password: encode(pw),
    createdAt: Date.now(),
    ...(r === 'tech' ? { techCode: `TDMX${String(Math.floor(1000 + Math.random() * 9000))}` } : {}),
  };
  saveAccounts([...accounts, account]);
  setSession(account.id);
  const { password: _pw, ...safe } = account;
  return { ok: true, account: safe };
}

export function loginAccount({ role, phone, password }) {
  const r = role === 'tech' ? 'tech' : 'customer';
  const p = String(phone || '').replace(/\D/g, '');
  const pw = String(password || '');
  if (p.length !== 10) return { ok: false, error: 'Số điện thoại phải có đúng 10 chữ số.' };
  if (!pw) return { ok: false, error: 'Vui lòng nhập mật khẩu.' };

  const accounts = loadAccounts();
  const account = accounts.find((a) => a.phone === p);
  if (!account) return { ok: false, error: 'Tài khoản không tồn tại. Hãy đăng ký trước.' };
  if (account.role !== r) {
    return {
      ok: false,
      error: account.role === 'tech'
        ? 'Số này thuộc tài khoản Thợ. Hãy chọn đăng nhập Thợ.'
        : 'Số này thuộc tài khoản Khách hàng. Hãy chọn đăng nhập Khách hàng.',
    };
  }
  if (!matchPw(account, pw)) return { ok: false, error: 'Mật khẩu không đúng.' };

  setSession(account.id);
  const { password: _pw, ...safe } = account;
  return { ok: true, account: safe };
}

// SUC-004 / SUC-005 — quên & đặt lại mật khẩu theo SĐT + vai trò
export function resetPassword({ role, phone, newPassword }) {
  const r = role === 'tech' ? 'tech' : 'customer';
  const p = String(phone || '').replace(/\D/g, '');
  const pw = String(newPassword || '');
  if (p.length !== 10) return { ok: false, error: 'Số điện thoại phải có đúng 10 chữ số.' };
  if (pw.length < 6) return { ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.phone === p && a.role === r);
  if (idx < 0) return { ok: false, error: 'Không tìm thấy tài khoản với số điện thoại này.' };
  const next = accounts.map((a, i) => (i === idx ? { ...a, password: encode(pw) } : a));
  saveAccounts(next);
  return { ok: true };
}

// SUC-006 — đổi mật khẩu khi đã đăng nhập
export function changePassword({ accountId, currentPassword, newPassword }) {
  const cur = String(currentPassword || '');
  const pw = String(newPassword || '');
  if (!cur) return { ok: false, error: 'Vui lòng nhập mật khẩu hiện tại.' };
  if (pw.length < 6) return { ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx < 0) return { ok: false, error: 'Phiên đăng nhập không hợp lệ.' };
  if (!matchPw(accounts[idx], cur)) return { ok: false, error: 'Mật khẩu hiện tại không đúng.' };
  const next = accounts.map((a, i) => (i === idx ? { ...a, password: encode(pw) } : a));
  saveAccounts(next);
  return { ok: true };
}

export function urlRoleHint() {
  try {
    if (typeof window === 'undefined') return null;
    const r = new URLSearchParams(window.location.search).get('role');
    return r === 'tech' || r === 'customer' ? r : null;
  } catch (e) { return null; }
}
