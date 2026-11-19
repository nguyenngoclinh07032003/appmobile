// ESM loader CHỈ dùng cho kiểm thử Node (không ảnh hưởng app):
//  1) Specifier tương đối không có đuôi ('../constants/data') -> thử thêm '.js' rồi '/index.js'.
//  2) Stub các module native / mạng mà Node không chạy được (react-native, expo-*, AsyncStorage, socket.io,
//     và các service gọi mạng / storage của app) bằng module giả. Tên export được đọc từ chính câu import của
//     file cha, nên code thật của app (vd. AppContext.js) vẫn import được và các hàm thuần chạy nguyên bản.
//  3) AppContext.js có đúng 1 dòng JSX (<Ctx.Provider>) -> thay bằng React.createElement lúc nạp (không sửa file).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const STUB_PACKAGES = [
  /^react-native$/,
  /^react-native-/,
  /^@react-native-async-storage\//,
  /^expo($|-)/,
  /^@expo\//,
  /^socket\.io-client$/,
  /^lucide-react-native$/,
];
// Module của app gọi mạng / storage native: thay bằng stub khi được import (từ bất kỳ file nào).
const STUB_APP_FILES = [
  /[\\/]src[\\/]services[\\/](api|socketService|soundService|authService|storage)\.js$/,
  /[\\/]src[\\/]utils[\\/]geo\.js$/,
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const namesImportedFrom = (parentURL, specifier) => {
  const out = { names: new Set(), hasDefault: false };
  if (!parentURL || !parentURL.startsWith('file:')) return out;
  let src = '';
  try { src = readFileSync(fileURLToPath(parentURL), 'utf8'); } catch { return out; }
  const re = new RegExp(`(import|export)\\s+([^;]*?)\\s+from\\s+['"]${escapeRe(specifier)}['"]`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const clause = m[2].trim();
    const braces = /\{([\s\S]*?)\}/.exec(clause);
    if (braces) {
      braces[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((part) => {
        const name = part.split(/\s+as\s+/)[0].trim();
        if (name === 'default') out.hasDefault = true;
        else if (/^[A-Za-z_$][\w$]*$/.test(name)) out.names.add(name);
      });
    }
    const beforeBrace = clause.replace(/\{[\s\S]*?\}/, '').replace(/,/g, ' ').trim();
    if (m[1] === 'import' && beforeBrace && !beforeBrace.startsWith('*')) out.hasDefault = true;
    if (beforeBrace.startsWith('*')) out.hasDefault = true;
  }
  return out;
};

const stubUrl = (id, parentURL, specifier) => {
  const { names, hasDefault } = namesImportedFrom(parentURL, specifier);
  const q = new URLSearchParams({ id, names: [...names].join(','), d: hasDefault ? '1' : '0' });
  return `stubmod:${encodeURIComponent(id)}?${q.toString()}`;
};

const isFile = (p) => { try { return existsSync(p) && statSync(p).isFile(); } catch { return false; } };

export async function resolve(specifier, context, nextResolve) {
  if (STUB_PACKAGES.some((re) => re.test(specifier))) {
    return { url: stubUrl(specifier, context.parentURL, specifier), shortCircuit: true };
  }
  let resolvedUrl = null;
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!isFile(base)) {
      if (isFile(`${base}.js`)) resolvedUrl = pathToFileURL(`${base}.js`).href;
      else if (isFile(path.join(base, 'index.js'))) resolvedUrl = pathToFileURL(path.join(base, 'index.js')).href;
    }
  }
  const result = resolvedUrl ? { url: resolvedUrl, shortCircuit: true } : await nextResolve(specifier, context);
  if (result.url?.startsWith('file:')) {
    const p = fileURLToPath(result.url);
    if (STUB_APP_FILES.some((re) => re.test(p))) {
      return { url: stubUrl(path.basename(p), context.parentURL, specifier), shortCircuit: true };
    }
  }
  return result;
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('stubmod:')) {
    const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    const names = (q.get('names') || '').split(',').filter(Boolean);
    const lines = [
      // Proxy gọi được + truy cập thuộc tính nào cũng trả về chính nó (Platform.OS, hrmssApi.x(), ...).
      'const handler = { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : k === "OS" ? "test" : stub), apply: () => stub, construct: () => stub };',
      'const stub = new Proxy(function stub() {}, handler);',
      'export default stub;',
      ...names.map((n) => `export const ${n} = stub;`),
    ];
    return { format: 'module', source: lines.join('\n'), shortCircuit: true };
  }
  if (url.startsWith('file:') && /[\\/]src[\\/]context[\\/]AppContext\.js$/.test(fileURLToPath(url))) {
    let source = readFileSync(fileURLToPath(url), 'utf8');
    source = source.replace(
      /return\s*<Ctx\.Provider value=\{value\}>\{children\}<\/Ctx\.Provider>;/,
      'return React.createElement(Ctx.Provider, { value }, children);',
    );
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
