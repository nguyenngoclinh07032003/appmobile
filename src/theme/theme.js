import { Platform } from 'react-native';
import { C, CAT_TONE, toneOf, STATUS_META } from './colors';

export { C, CAT_TONE, toneOf, STATUS_META };

export const R = { sm: 12, md: 16, lg: 20, xl: 28, pill: 999 };

export const shadow = {
  sm: { boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.04), 0px 1px 2px rgba(15, 23, 42, 0.03)' },
  md: { boxShadow: '0px 4px 12px rgba(15, 23, 42, 0.07), 0px 2px 4px rgba(15, 23, 42, 0.04)' },
  lg: { boxShadow: '0px 12px 28px rgba(15, 23, 42, 0.11), 0px 4px 8px rgba(15, 23, 42, 0.05)' },
  primary: { boxShadow: '0px 2px 6px rgba(15, 23, 42, 0.08)' },
  gold: { boxShadow: '0px 2px 6px rgba(15, 23, 42, 0.08)' },
  success: { boxShadow: '0px 2px 6px rgba(15, 23, 42, 0.08)' },
  danger: { boxShadow: '0px 2px 6px rgba(15, 23, 42, 0.08)' },
};

// Gradient chỉ giữ cho header/hero thương hiệu; các nút giữ màu phẳng sắc nét
const wGrad = (css) => (Platform.OS === 'web' ? { backgroundImage: css } : {});
export const grad = {
  navyHero: wGrad('linear-gradient(135deg, #072E6E 0%, #0A3D8F 55%, #0062E0 100%)'),
  navyCard: wGrad('linear-gradient(135deg, #072E6E 0%, #0A3D8F 100%)'),
  primaryBtn: {},
  goldBtn: {},
  warningBtn: {},
  successBtn: {},
  dangerBtn: {},
};
