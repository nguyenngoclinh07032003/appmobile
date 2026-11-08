import { Platform } from 'react-native';

const compressWebFile = (f) => new Promise((resolve) => {
  const url = URL.createObjectURL(f);
  const img = new window.Image();
  img.onload = () => {
    const k = Math.min(1, 480 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL('image/jpeg', 0.7));
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
  img.src = url;
});

const pickWeb = (capture) => new Promise((resolve) => {
  if (typeof document === 'undefined') { resolve(null); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (capture) input.setAttribute('capture', capture); // environment | user — mở camera trên mobile web
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) { resolve(undefined); return; }
    resolve(await compressWebFile(f));
  };
  input.oncancel = () => resolve(undefined);
  input.click();
});

/** Thư viện ảnh (web). Huỷ → undefined; nền tảng chưa hỗ trợ → null */
export const pickImage = () => {
  if (Platform.OS === 'web') return pickWeb(false);
  // Nền tảng native khi chưa cấp quyền truy cập thư viện ảnh
  return Promise.resolve(null);
};

/** Ưu tiên camera sau (mobile web). Desktop vẫn mở chọn file. */
export const pickCamera = () => {
  if (Platform.OS === 'web') return pickWeb('environment');
  return Promise.resolve(null);
};
