import { Platform } from 'react-native';
import {
  C, LIGHT_THEME, DARK_THEME, getThemeColors, CAT_TONE, CAT_TONE_DARK, toneOf, STATUS_META, STATUS_META_DARK, getStatusMeta,
} from './colors';

export {
  C, LIGHT_THEME, DARK_THEME, getThemeColors, CAT_TONE, CAT_TONE_DARK, toneOf, STATUS_META, STATUS_META_DARK, getStatusMeta,
};

export const R = { sm: 12, md: 16, lg: 20, xl: 28, pill: 999 };

export const shadow = {
  sm: { boxShadow: '0px 2px 6px rgba(0, 98, 224, 0.04), 0px 1px 2px rgba(0, 98, 224, 0.03)' },
  md: { boxShadow: '0px 8px 20px rgba(0, 98, 224, 0.06), 0px 2px 6px rgba(0, 98, 224, 0.04)' },
  lg: { boxShadow: '0px 16px 38px rgba(0, 98, 224, 0.10), 0px 4px 10px rgba(0, 98, 224, 0.04)' },
  primary: { boxShadow: '0px 6px 18px rgba(0, 98, 224, 0.22)' },
  gold: { boxShadow: '0px 6px 18px rgba(217, 119, 6, 0.24)' },
  success: { boxShadow: '0px 6px 18px rgba(5, 150, 105, 0.22)' },
  danger: { boxShadow: '0px 6px 18px rgba(220, 38, 38, 0.24)' },
};

export const shadowDark = {
  sm: { boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.35)' },
  md: { boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.45)' },
  lg: { boxShadow: '0px 16px 36px rgba(0, 0, 0, 0.55)' },
  primary: { boxShadow: '0px 6px 18px rgba(56, 189, 248, 0.25)' },
  gold: { boxShadow: '0px 6px 18px rgba(251, 191, 36, 0.25)' },
  success: { boxShadow: '0px 6px 18px rgba(52, 211, 153, 0.25)' },
  danger: { boxShadow: '0px 6px 18px rgba(248, 113, 113, 0.25)' },
};

export const getShadow = (isDark = false) => (isDark ? shadowDark : shadow);

// Gradient bề mặt (chạy mượt trên web, fallback màu đơn trên native)
const wGrad = (css) => (Platform.OS === 'web' ? { backgroundImage: css } : {});
export const grad = {
  navyHero: wGrad('linear-gradient(135deg, #0052CC 0%, #0062E0 55%, #1677FF 100%)'),
  navyCard: wGrad('linear-gradient(135deg, #073B82 0%, #0062E0 100%)'),
  primaryBtn: wGrad('linear-gradient(135deg, #0062E0 0%, #0052CC 100%)'),
  goldBtn: wGrad('linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'),
  warningBtn: wGrad('linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'),
  successBtn: wGrad('linear-gradient(135deg, #10B981 0%, #059669 100%)'),
  dangerBtn: wGrad('linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'),
};

export const gradDark = {
  navyHero: wGrad('linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0F172A 100%)'),
  navyCard: wGrad('linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'),
  primaryBtn: wGrad('linear-gradient(135deg, #0284C7 0%, #0369A1 100%)'),
  goldBtn: wGrad('linear-gradient(135deg, #D97706 0%, #B45309 100%)'),
  warningBtn: wGrad('linear-gradient(135deg, #D97706 0%, #B45309 100%)'),
  successBtn: wGrad('linear-gradient(135deg, #059669 0%, #047857 100%)'),
  dangerBtn: wGrad('linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'),
};

export const getGrad = (isDark = false) => (isDark ? gradDark : grad);


