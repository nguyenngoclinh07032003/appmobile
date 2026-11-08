import { Platform } from 'react-native';
import { C, CAT_TONE, toneOf, STATUS_META } from './colors';

export { C, CAT_TONE, toneOf, STATUS_META };

export const R = { sm: 12, md: 16, lg: 20, xl: 28 };

export const shadow = {
  sm: { boxShadow: '0px 2px 6px rgba(0, 98, 224, 0.04), 0px 1px 2px rgba(0, 98, 224, 0.03)' },
  md: { boxShadow: '0px 8px 20px rgba(0, 98, 224, 0.06), 0px 2px 6px rgba(0, 98, 224, 0.04)' },
  lg: { boxShadow: '0px 16px 38px rgba(0, 98, 224, 0.10), 0px 4px 10px rgba(0, 98, 224, 0.04)' },
  primary: { boxShadow: '0px 6px 18px rgba(0, 98, 224, 0.22)' },
  gold: { boxShadow: '0px 6px 18px rgba(0, 98, 224, 0.22)' },
};

// Gradient bề mặt (chạy mượt trên web, fallback màu đơn trên native)
const wGrad = (css) => (Platform.OS === 'web' ? { backgroundImage: css } : {});
export const grad = {
  navyHero: wGrad('linear-gradient(135deg, #0052CC 0%, #0062E0 55%, #1677FF 100%)'),
  navyCard: wGrad('linear-gradient(135deg, #073B82 0%, #0062E0 100%)'),
  primaryBtn: wGrad('linear-gradient(135deg, #0062E0 0%, #0052CC 100%)'),
  goldBtn: wGrad('linear-gradient(135deg, #0062E0 0%, #0052CC 100%)'),
  dangerBtn: wGrad('linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'),
};

