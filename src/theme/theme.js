import { Platform } from 'react-native';
import { C, CAT_TONE, toneOf, STATUS_META } from './colors';

export { C, CAT_TONE, toneOf, STATUS_META };

export const R = { sm: 12, md: 16, lg: 20, xl: 28 };

export const shadow = {
  sm: { boxShadow: '0px 2px 6px rgba(7, 26, 58, 0.04), 0px 1px 2px rgba(7, 26, 58, 0.03)' },
  md: { boxShadow: '0px 8px 20px rgba(7, 26, 58, 0.08), 0px 2px 6px rgba(7, 26, 58, 0.04)' },
  lg: { boxShadow: '0px 16px 38px rgba(7, 26, 58, 0.14), 0px 4px 10px rgba(7, 26, 58, 0.06)' },
  primary: { boxShadow: '0px 8px 22px rgba(26, 95, 255, 0.30)' },
  gold: { boxShadow: '0px 6px 18px rgba(255, 200, 61, 0.36)' },
};

// Gradient bề mặt (chạy mượt trên web, fallback màu đơn trên native)
const wGrad = (css) => (Platform.OS === 'web' ? { backgroundImage: css } : {});
export const grad = {
  navyHero: wGrad('linear-gradient(135deg, #061531 0%, #0C2554 55%, #153A7E 100%)'),
  navyCard: wGrad('linear-gradient(135deg, #0B2149 0%, #163A7A 100%)'),
  primaryBtn: wGrad('linear-gradient(135deg, #2B6FFF 0%, #134FE3 100%)'),
  goldBtn: wGrad('linear-gradient(135deg, #FFD454 0%, #F5B618 100%)'),
  dangerBtn: wGrad('linear-gradient(135deg, #F0483C 0%, #D4281C 100%)'),
};

