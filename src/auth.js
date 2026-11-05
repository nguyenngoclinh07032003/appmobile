// Tài khoản + phiên đăng nhập (lưu trên trình duyệt)
// - accounts: localStorage (dùng chung mọi tab / thiết bị trình duyệt)
// - session: sessionStorage (mỗi tab một phiên — Khách và Thợ có thể mở song song)

import { TECH_ME } from './data';

const ACCOUNTS_KEY = 'tho-hrmss-accounts-v1';
const SESSION_KEY = 'tho-hrmss-session-v1';

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

// Tài khoản khởi tạo khi chưa có dữ liệu (có thể đăng ký thêm tài khoản mới)
const STARTER_ACCOUNTS = [
  {
    id: 'acc-cus-1',
    role: 'customer',
    name: 'Nguyễn Minh Anh',
    phone: '0901234567',
    email: 'khach@hrmss.vn',
    password: encode('123456'),
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: 'acc-tech-1',
    role: 'tech',
    name: TECH_ME.name,
    phone: TECH_ME.phone,
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

export function findAccountByPhone(phone, role) {
  const p = String(phone || '').replace(/\D/g, '');
  return loadAccounts().find((a) => a.phone === p && (!role || a.role === role)) || null;
}

export function findAccountByIdentifier(identifier, role) {
  const raw = String(identifier || '').trim();
  const isEmail = raw.includes('@');
  const accounts = loadAccounts();

  if (isEmail) {
    const e = raw.toLowerCase();
    return accounts.find((a) => a.email && a.email.toLowerCase() === e && (!role || a.role === role)) || null;
  }
  const digits = raw.replace(/\D/g, '');
  return accounts.find((a) => a.phone === digits && (!role || a.role === role)) || null;
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
  if (e && accounts.some((a) => a.email && a.email.toLowerCase() === e.toLowerCase() && a.role === r)) {
    return { ok: false, error: `Email này đã được sử dụng cho tài khoản ${r === 'tech' ? 'Thợ' : 'Khách hàng'}.` };
  }

  const account = {
    id: `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    role: r,
    name: n,
    phone: p,
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

export function loginAccount({ role, identifier, phone, password }) {
  const rawInput = String(identifier || phone || '').trim();
  const pw = String(password || '');

  if (!rawInput) {
    return { ok: false, error: 'Vui lòng nhập số điện thoại hoặc email.' };
  }

  const isEmail = rawInput.includes('@');
  let cleanPhone = '';

  if (isEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawInput)) {
      return { ok: false, error: 'Địa chỉ Email không đúng định dạng.' };
    }
  } else {
    cleanPhone = rawInput.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return { ok: false, error: 'Số điện thoại phải có đúng 10 chữ số.' };
    }
  }

  if (!pw) return { ok: false, error: 'Vui lòng nhập mật khẩu.' };

  const accounts = loadAccounts();
  // Nếu có truyền role cụ thể thì ưu tiên kiểm tra, nếu không thì tự nhận diện theo identifier
  const account = isEmail
    ? accounts.find((a) => a.email && a.email.toLowerCase() === rawInput.toLowerCase() && (!role || a.role === role))
      || accounts.find((a) => a.email && a.email.toLowerCase() === rawInput.toLowerCase())
    : accounts.find((a) => a.phone === cleanPhone && (!role || a.role === role))
      || accounts.find((a) => a.phone === cleanPhone);

  if (!account) {
    return {
      ok: false,
      error: `Tài khoản với ${isEmail ? 'Email' : 'Số điện thoại'} này không tồn tại. Hãy đăng ký tài khoản mới.`,
    };
  }

  if (!matchPw(account, pw)) return { ok: false, error: 'Mật khẩu không đúng. Vui lòng thử lại.' };

  setSession(account.id);
  const { password: _pw, ...safe } = account;
  return { ok: true, account: safe };
}

// Quên & đặt lại mật khẩu theo SĐT hoặc Email (tự động nhận diện tài khoản)
export function resetPassword({ role, identifier, phone, newPassword }) {
  const raw = String(identifier || phone || '').trim();
  const pw = String(newPassword || '');

  if (!raw) return { ok: false, error: 'Vui lòng nhập số điện thoại hoặc email đã đăng ký.' };
  if (pw.length < 6) return { ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };

  const isEmail = raw.includes('@');
  const cleanPhone = isEmail ? '' : raw.replace(/\D/g, '');

  if (!isEmail && cleanPhone.length !== 10) {
    return { ok: false, error: 'Số điện thoại phải có đúng 10 chữ số.' };
  }

  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => {
    if (role && a.role !== role) return false;
    if (isEmail) return a.email && a.email.toLowerCase() === raw.toLowerCase();
    return a.phone === cleanPhone;
  });

  if (idx < 0) {
    return {
      ok: false,
      error: `Không tìm thấy tài khoản với ${isEmail ? 'Email' : 'Số điện thoại'} này.`,
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

// Đăng nhập nhanh theo vai trò đã lưu trên thiết bị
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

