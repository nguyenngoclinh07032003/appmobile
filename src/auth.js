// Tài khoản + phiên đăng nhập (lưu trên trình duyệt)
// - accounts: localStorage (dùng chung mọi tab / thiết bị trình duyệt)
// - session: sessionStorage (mỗi tab một phiên — Khách và Thợ có thể mở song song)
// Xác thực thông qua Email hoặc Tên đăng nhập (Username)

import { TECH_ME } from './data';

const ACCOUNTS_KEY = 'tho-hrmss-accounts-v2';
const SESSION_KEY = 'tho-hrmss-session-v2';

const encode = (pw) => {
  try { return btoa(unescape(encodeURIComponent(`hrmss:${pw}`))); } catch (e) { return `hrmss:${pw}`; }
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

// Tài khoản khởi tạo mặc định (Email / Username)
const STARTER_ACCOUNTS = [
  {
    id: 'acc-cus-1',
    role: 'customer',
    username: 'khachhang',
    name: 'Nguyễn Minh Anh',
    email: 'khach@hrmss.vn',
    password: encode('123456'),
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: 'acc-tech-1',
    role: 'tech',
    username: 'thohrmss',
    name: TECH_ME.name,
    email: 'tho@hrmss.vn',
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

export function findAccountByUsername(username, role) {
  const u = String(username || '').trim().toLowerCase();
  return loadAccounts().find((a) => a.username && a.username.toLowerCase() === u && (!role || a.role === role)) || null;
}

export function findAccountByEmail(email, role) {
  const e = String(email || '').trim().toLowerCase();
  return loadAccounts().find((a) => a.email && a.email.toLowerCase() === e && (!role || a.role === role)) || null;
}

export function findAccountByIdentifier(identifier, role) {
  const raw = String(identifier || '').trim().toLowerCase();
  if (!raw) return null;
  const isEmail = raw.includes('@');
  const accounts = loadAccounts();

  if (isEmail) {
    return accounts.find((a) => a.email && a.email.toLowerCase() === raw && (!role || a.role === role))
      || accounts.find((a) => a.email && a.email.toLowerCase() === raw)
      || null;
  }
  return accounts.find((a) => a.username && a.username.toLowerCase() === raw && (!role || a.role === role))
    || accounts.find((a) => a.username && a.username.toLowerCase() === raw)
    || null;
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

// Đăng ký tài khoản mới bằng Email và Username (Không cần SĐT)
export function registerAccount({ role, name, username, email, password }) {
  const r = role === 'tech' ? 'tech' : 'customer';
  const n = String(name || '').trim();
  const rawUser = String(username || (email ? email.split('@')[0] : '')).trim().toLowerCase();
  const u = rawUser.replace(/[^a-z0-9_.-]/g, '');
  const e = String(email || '').trim().toLowerCase();
  const pw = String(password || '');

  if (!['customer', 'tech'].includes(r)) return { ok: false, error: 'Vai trò không hợp lệ.' };
  if (n.length < 2) return { ok: false, error: 'Vui lòng nhập họ và tên (ít nhất 2 ký tự).' };
  if (!u || u.length < 3) return { ok: false, error: 'Tên đăng nhập phải có ít nhất 3 ký tự (chữ, số hoặc dấu gạch).' };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(e)) {
    return { ok: false, error: 'Địa chỉ Email không đúng định dạng.' };
  }

  if (pw.length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };

  const accounts = loadAccounts();
  if (accounts.some((a) => a.username && a.username.toLowerCase() === u)) {
    return { ok: false, error: `Tên đăng nhập "${u}" đã có người sử dụng. Vui lòng chọn tên khác.` };
  }
  if (accounts.some((a) => a.email && a.email.toLowerCase() === e)) {
    return { ok: false, error: `Email "${e}" này đã được đăng ký tài khoản.` };
  }

  const account = {
    id: `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    role: r,
    name: n,
    username: u,
    email: e,
    password: encode(pw),
    createdAt: Date.now(),
    ...(r === 'tech' ? { techCode: `HRMSS${String(Math.floor(1000 + Math.random() * 9000))}` } : {}),
  };
  saveAccounts([...accounts, account]);
  setSession(account.id);
  const { password: _pw, ...safe } = account;
  return { ok: true, account: safe };
}

// Đăng nhập bằng Email hoặc Tên đăng nhập (Username)
export function loginAccount({ role, identifier, password }) {
  const rawInput = String(identifier || '').trim();
  const pw = String(password || '');

  if (!rawInput) {
    return { ok: false, error: 'Vui lòng nhập Email hoặc Tên đăng nhập.' };
  }

  const isEmail = rawInput.includes('@');
  if (isEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawInput)) {
      return { ok: false, error: 'Địa chỉ Email không đúng định dạng.' };
    }
  }

  if (!pw) return { ok: false, error: 'Vui lòng nhập mật khẩu.' };

  const accounts = loadAccounts();
  const lower = rawInput.toLowerCase();
  const account = isEmail
    ? accounts.find((a) => a.email && a.email.toLowerCase() === lower && (!role || a.role === role))
      || accounts.find((a) => a.email && a.email.toLowerCase() === lower)
    : accounts.find((a) => a.username && a.username.toLowerCase() === lower && (!role || a.role === role))
      || accounts.find((a) => a.username && a.username.toLowerCase() === lower);

  if (!account) {
    return {
      ok: false,
      error: `Tài khoản với ${isEmail ? 'Email' : 'Tên đăng nhập'} này không tồn tại. Hãy đăng ký tài khoản mới.`,
    };
  }

  if (!matchPw(account, pw)) return { ok: false, error: 'Mật khẩu không đúng. Vui lòng thử lại.' };

  setSession(account.id);
  const { password: _pw, ...safe } = account;
  return { ok: true, account: safe };
}

// Quên & đặt lại mật khẩu theo Email hoặc Tên đăng nhập
export function resetPassword({ role, identifier, newPassword }) {
  const raw = String(identifier || '').trim().toLowerCase();
  const pw = String(newPassword || '');

  if (!raw) return { ok: false, error: 'Vui lòng nhập Email hoặc Tên đăng nhập đã đăng ký.' };
  if (pw.length < 6) return { ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };

  const isEmail = raw.includes('@');
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => {
    if (role && a.role !== role) return false;
    if (isEmail) return a.email && a.email.toLowerCase() === raw;
    return a.username && a.username.toLowerCase() === raw;
  });

  if (idx < 0) {
    return {
      ok: false,
      error: `Không tìm thấy tài khoản với ${isEmail ? 'Email' : 'Tên đăng nhập'} này.`,
    };
  }
  const next = accounts.map((a, i) => (i === idx ? { ...a, password: encode(pw) } : a));
  saveAccounts(next);
  return { ok: true };
}

// Đổi mật khẩu khi đã đăng nhập
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

// Đăng nhập nhanh 1 chạm theo vai trò
export function quickLoginRole(role) {
  const r = role === 'tech' ? 'tech' : 'customer';
  const accounts = loadAccounts();
  let acc = accounts.find((a) => a.role === r);
  if (!acc) {
    acc = STARTER_ACCOUNTS.find((a) => a.role === r) || STARTER_ACCOUNTS[0];
    saveAccounts([...accounts, acc]);
  }
  setSession(acc.id);
  const { password: _pw, ...safe } = acc;
  return { ok: true, account: safe };
}
