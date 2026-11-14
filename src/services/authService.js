// Tài khoản + phiên đăng nhập trên máy (chỉ thông tin hiển thị công khai, KHÔNG lưu mật khẩu / token).
// - Web: accounts ở localStorage (dùng chung mọi tab), session ở sessionStorage (mỗi tab một phiên — Khách và Thợ có thể
//   mở song song). Đọc/ghi đồng bộ như trước.
// - Native (iOS/Android): cả hai lưu trong AsyncStorage (services/storage.js) để mở lại app vẫn còn phiên. API của file
//   này vẫn đồng bộ: dữ liệu được giữ trong bộ nhớ và ghi xuống AsyncStorage ở nền; app gọi hydrateAuthStore() một lần
//   lúc khởi động (trước khi đọc getSession()). Refresh token native nằm ở SecureStore (services/api.js).
import { IS_WEB_STORAGE, readJsonSync, readJson, writeJson, removeItem } from './storage';

const ACCOUNTS_KEY = 'tho-hrmss-accounts-v1';
const SESSION_KEY = 'tho-hrmss-session-v1';

// Bộ nhớ đệm cho native (web đọc thẳng từ localStorage/sessionStorage để thấy thay đổi của tab khác).
const cache = { accounts: null, session: null, accountsTouched: false, sessionTouched: false, hydrated: IS_WEB_STORAGE };

const readAccountsData = () => (IS_WEB_STORAGE ? readJsonSync(ACCOUNTS_KEY, 'local') : cache.accounts);
const writeAccountsData = (data) => {
  if (!IS_WEB_STORAGE) { cache.accounts = data; cache.accountsTouched = true; }
  writeJson(ACCOUNTS_KEY, data, 'local');
};
const readSessionData = () => (IS_WEB_STORAGE ? readJsonSync(SESSION_KEY, 'session') : cache.session);
const writeSessionData = (data) => {
  if (!IS_WEB_STORAGE) { cache.session = data; cache.sessionTouched = true; }
  if (data) writeJson(SESSION_KEY, data, 'session');
  else removeItem(SESSION_KEY, 'session');
};

/** Native: nạp tài khoản + phiên đã lưu từ AsyncStorage vào bộ nhớ. Web: không cần (đọc đồng bộ). */
export async function hydrateAuthStore() {
  if (IS_WEB_STORAGE || cache.hydrated) return;
  const [accounts, session] = await Promise.all([readJson(ACCOUNTS_KEY, 'local'), readJson(SESSION_KEY, 'session')]);
  // Không ghi đè thay đổi đã xảy ra trong lúc đang đọc (vd. đăng xuất / đăng nhập sớm).
  if (!cache.accountsTouched) cache.accounts = accounts;
  if (!cache.sessionTouched) cache.session = session;
  cache.hydrated = true;
}

export const isAuthStoreHydrated = () => cache.hydrated;

// Chỉ cho phép lưu các trường hiển thị công khai, loại bỏ hoàn toàn token/password/permissions
const sanitizeStoredAccount = (acc) => {
  // Chỉ giữ tài khoản đăng nhập qua backend (id "be-<user_id>"); tài khoản mẫu offline của bản cũ bị bỏ.
  if (!acc || !String(acc.id || '').startsWith('be-')) return null;
  return {
    id: String(acc.id || ''),
    role: acc.role === 'tech' ? 'tech' : 'customer',
    username: String(acc.username || ''),
    name: String(acc.name || ''),
    phone: String(acc.phone || ''),
    email: String(acc.email || ''),
    emailVerified: Boolean(acc.emailVerified),
    ...(acc.dob ? { dob: String(acc.dob) } : {}),
    ...(acc.techCode ? { techCode: String(acc.techCode) } : {}),
    createdAt: acc.createdAt || Date.now(),
  };
};

function loadAccounts() {
  const data = readAccountsData();
  if (data?.accounts?.length) {
    // Tự động làm sạch các trường nhạy cảm (backendToken, permissions) nếu phiên cũ lỡ lưu
    return data.accounts.map(sanitizeStoredAccount).filter(Boolean);
  }
  // Không còn tài khoản mẫu: chỉ lưu tài khoản đã đăng nhập qua backend (không lưu mật khẩu).
  return [];
}

function saveAccounts(accounts) {
  writeAccountsData({ accounts: accounts.map(sanitizeStoredAccount).filter(Boolean) });
}

export function upsertBackendAccount(account) {
  if (!account?.id) return account;
  const accounts = loadAccounts();
  const idx = accounts.findIndex(
    (a) => a.id === account.id
      || (account.username && a.username?.toLowerCase() === account.username.toLowerCase())
      || (account.email && a.email?.toLowerCase() === account.email.toLowerCase()),
  );
  // Tuyệt đối không lưu password, backendToken hay permissions của Backend
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
    dob: account.dob !== undefined ? account.dob : (idx >= 0 ? accounts[idx].dob : undefined),
    techCode: account.techCode,
    createdAt: idx >= 0 ? accounts[idx].createdAt : Date.now(),
  });
  if (!safeRecord) return account;
  const next = idx >= 0
    ? accounts.map((a, i) => (i === idx ? safeRecord : a))
    : [safeRecord, ...accounts];
  saveAccounts(next);
  setSession(safeRecord.id);
  return { ...safeRecord };
}

export function listAccounts() {
  return loadAccounts().map(({ password, ...rest }) => rest);
}

export function deleteAccountById(id) {
  if (!id) return false;
  const accounts = loadAccounts();
  const next = accounts.filter((a) => a.id !== id);
  saveAccounts(next);
  const cur = readSessionData();
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
  const session = readSessionData();
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
  writeSessionData(null);
}

export function setSession(accountId) {
  writeSessionData({ accountId, loggedAt: Date.now() });
}

export function urlRoleHint() {
  try {
    if (typeof window === 'undefined' || !window.location?.search) return null;
    const r = new URLSearchParams(window.location.search).get('role');
    return r === 'tech' || r === 'customer' ? r : null;
  } catch (e) { return null; }
}
