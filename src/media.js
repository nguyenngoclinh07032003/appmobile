import { Platform } from 'react-native';

/** Chọn ảnh từ thiết bị (web: file input). Huỷ → undefined; nền tảng chưa hỗ trợ → null */
export const pickImage = () => new Promise((resolve) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') { resolve(null); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) { resolve(undefined); return; }
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
  };
  input.oncancel = () => resolve(undefined);
  input.click();
});
