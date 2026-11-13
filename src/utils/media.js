import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

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

// Bản native (iOS / Android): expo-image-picker. Trả uri file:// (api.js tải lên dạng multipart { uri, name, type }).
// Ảnh nén 0.6 để tải nhanh và không vượt giới hạn dung lượng của backend.
const nativePick = async (fromCamera) => {
  try {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null; // không có quyền -> null (màn hình báo / thử cách khác)
    const opts = { mediaTypes: ['images'], quality: 0.6, allowsEditing: false, exif: false };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.length) return undefined;
    return res.assets[0].uri;
  } catch (e) {
    return null;
  }
};

/** Thư viện ảnh. Huỷ → undefined; không có quyền / không hỗ trợ → null */
export const pickImage = () => {
  if (Platform.OS === 'web') return pickWeb(false);
  return nativePick(false);
};

/** Ưu tiên camera sau. Desktop web vẫn mở chọn file. Không có quyền camera → null (màn hình chuyển sang chọn từ thư viện). */
export const pickCamera = () => {
  if (Platform.OS === 'web') return pickWeb('environment');
  return nativePick(true);
};
