// Tài khoản + phiên đăng nhập (lưu trên trình duyệt)
// - accounts: localStorage (dùng chung mọi tab / thiết bị trình duyệt)
// - session: sessionStorage (mỗi tab một phiên — Khách và Thợ có thể mở song song)

const ACCOUNTS_KEY = 'tho-hrmss-accounts-v1';
const SESSION_KEY = 'tho-hrmss-session-v1';


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

// Chỉ cho phép lưu các trường hiển thị công khai vào localStorage, loại bỏ hoàn toàn token/password/permissions
const sanitizeStoredAccount = (acc) => {
  // Chỉ giữ tài khoản đăng nhập qua backend (id "be-<user_id>"); tài khoản mẫu offline của bản cũ bị bỏ.
  if (!acc || !String(acc.id || "").startsWith("be-")) return null;
  return {
    id: String(acc.id || ''),
    role: acc.role === 'tech' ? 'tech' : 'customer',
    username: String(acc.username || ''),
    name: String(acc.name || ''),
    phone: String(acc.phone || ''),
    email: String(acc.email || ''),
    emailVerified: Boolean(acc.emailVerified),
    ...(acc.techCode ? { techCode: String(acc.techCode) } : {}),
    createdAt: acc.createdAt || Date.now(),
  };
};

function loadAccounts() {
  const data = readJson(ls(), ACCOUNTS_KEY);
  if (data?.accounts?.length) {
    // Tự động làm sạch các trường nhạy cảm (backendToken, permissions) nếu phiên cũ lỡ lưu
    return data.accounts.map(sanitizeStoredAccount).filter(Boolean);
  }
  // Không còn tài khoản mẫu: chỉ lưu tài khoản đã đăng nhập qua backend (không lưu mật khẩu).
  return [];
}

function saveAccounts(accounts) {
  writeJson(ls(), ACCOUNTS_KEY, { accounts: accounts.map(sanitizeStoredAccount).filter(Boolean) });
}

export function upsertBackendAccount(account) {
  if (!account?.id) return account;
  const accounts = loadAccounts();
  const idx = accounts.findIndex(
    (a) => a.id === account.id
      || (account.username && a.username?.toLowerCase() === account.username.toLowerCase())
      || (account.email && a.email?.toLowerCase() === account.email.toLowerCase()),
  );
  // Tuyệt đối không lưu password, backendToken hay permissions của Backend vào localStorage
  const safeRecord = sanitizeStoredAccount({
    id: account.id,
    role: account.role,
    username: account.username,
    name: account.name,
    phone: account.phone,
    email: account.email,
    emailVerified: account.emailVerified !== undefined
      ? Boolean(account.emailVerified)
      : (idx >= 0 ? Boolean(accounts[idx].emailVerified) : false),
    techCode: account.techCode,
    createdAt: idx >= 0 ? accounts[idx].createdAt : Date.now(),
  });
  const next = idx >= 0
    ? accounts.map((a, i) => (i === idx ? safeRecord : a))
    : [safeRecord, ...accounts];
  saveAccounts(next);
  setSession(safeRecord.id);
  const { password: _pw, ...publicDto } = safeRecord;
  return publicDto;
}

export function listAccounts() {
  return loadAccounts().map(({ password, ...rest }) => rest);
}

export function deleteAccountById(id) {
  if (!id) return false;
  const accounts = loadAccounts();
  const next = accounts.filter((a) => a.id !== id);
  saveAccounts(next);
  const cur = readJson(ss(), SESSION_KEY);
  if (cur?.accountId === id) {
    clearSession();
  }
  return true;
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
  const byUsername = accounts.find(
    (a) => a.username && a.username.toLowerCase() === raw.toLowerCase() && (!role || a.role === role),
  );
  if (byUsername) return byUsername;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
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

export function urlRoleHint() {
  try {
    if (typeof window === 'undefined') return null;
    const r = new URLSearchParams(window.location.search).get('role');
    return r === 'tech' || r === 'customer' ? r : null;
  } catch (e) { return null; }
}

