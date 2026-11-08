import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Platform, useWindowDimensions, Animated, Easing, TouchableOpacity,
} from 'react-native';
import { C, shadow } from '../theme';
import { useApp } from '../context';
import { DialogHost, ToastHost, FrameCtx, AppIcon } from '../components';
import BottomNav from './BottomNav';
import { CUSTOMER_TABS, TECH_TABS, SCREENS, DARK_TOP, PHONE_W, BEZEL, AuthScreen } from './routes';

const DARK_CSS = `
  body.tho-dark-theme {
    background-color: #060A12 !important;
    color: #F8FAFC !important;
    color-scheme: dark;
  }
  /* Nền trắng chuyển thành nền thẻ tối Slate 800 */
  body.tho-dark-theme .r-backgroundColor-14lw9ot,
  body.tho-dark-theme .r-backgroundColor-w86zdx,
  body.tho-dark-theme .r-backgroundColor-z6hqnn,
  body.tho-dark-theme .r-backgroundColor-o1t6rw,
  body.tho-dark-theme .r-backgroundColor-5cs3rs {
    background-color: #1E293B !important;
  }
  /* Nền trang xám nhạt chuyển thành nền tối Obsidian */
  body.tho-dark-theme .r-backgroundColor-11j01x2,
  body.tho-dark-theme .r-backgroundColor-1jh0li6 {
    background-color: #0B1120 !important;
  }
  /* Primary soft surface */
  body.tho-dark-theme .r-backgroundColor-1ny8bov {
    background-color: #1E293B !important;
  }
  /* Chữ đen đậm chuyển sang Trắng sáng Slate 50 */
  body.tho-dark-theme .r-color-15ijx5m {
    color: #F8FAFC !important;
  }
  /* Chữ phụ xám đậm chuyển sang Slate 300 */
  body.tho-dark-theme .r-color-dz6k1,
  body.tho-dark-theme .r-color-1dk24ck {
    color: #CBD5E1 !important;
  }
  /* Chữ xám mờ chuyển sang Slate 400 */
  body.tho-dark-theme .r-color-1s7ct43 {
    color: #94A3B8 !important;
  }
  /* Viền xám sáng chuyển sang Slate 700 */
  body.tho-dark-theme .r-borderColor-1wr2p1e,
  body.tho-dark-theme .r-borderColor-csitcu,
  body.tho-dark-theme .r-borderColor-fh4lzp,
  body.tho-dark-theme .r-borderColor-11mg6pl,
  body.tho-dark-theme .r-borderColor-c8xr4a {
    border-color: #334155 !important;
  }
  body.tho-dark-theme .r-borderTopColor-174iedc,
  body.tho-dark-theme .r-borderTopColor-1f0fu4f,
  body.tho-dark-theme .r-borderTopColor-1n81mqw,
  body.tho-dark-theme .r-borderTopColor-1o94pyu {
    border-top-color: #334155 !important;
  }
  body.tho-dark-theme .r-borderBottomColor-eaxd7d,
  body.tho-dark-theme .r-borderBottomColor-3pxcvb,
  body.tho-dark-theme .r-borderBottomColor-1kj3flp,
  body.tho-dark-theme .r-borderBottomColor-1ns0y1y {
    border-bottom-color: #334155 !important;
  }
  /* Form inputs & textareas */
  body.tho-dark-theme input,
  body.tho-dark-theme textarea {
    background-color: #1E293B !important;
    color: #F8FAFC !important;
    border-color: #334155 !important;
  }
  body.tho-dark-theme input::placeholder,
  body.tho-dark-theme textarea::placeholder {
    color: #64748B !important;
  }
`;

export function AnimatedScreen({ children, mode = 'stack' }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: mode === 'stack' ? 210 : 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, mode]);
  const translateX = mode === 'stack' ? anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) : 0;
  const translateY = mode === 'tab' ? anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) : 0;
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  return (
    <Animated.View style={[st.fill, { opacity, transform: mode === 'stack' ? [{ translateX }] : [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

export function Shell() {
  const { s, nav } = useApp();
  const isDark = Boolean(s.darkMode);
  const loggedIn = !!s.auth;
  const role = s.auth?.role || s.role;
  const tabs = role === 'tech' ? TECH_TABS : CUSTOMER_TABS;
  const Tab = tabs.find((t) => t.id === nav.tab)?.Comp || tabs[0].Comp;
  const topName = nav.top?.name;
  const darkTop = !loggedIn ? true : (topName ? false : DARK_TOP.includes(nav.tab));
  const topInset = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : Platform.OS === 'ios' ? 47 : 0;

  // Chặn stack thuộc vai trò khác (phân quyền) & chỉ giữ màn hình có định nghĩa trong SCREENS
  const allowedStack = loggedIn
    ? nav.stack.filter((entry) => Boolean(SCREENS[entry.name]) && (role === 'tech' ? String(entry.name).startsWith('tech') : !String(entry.name).startsWith('tech')))
    : [];

  const shellBg = isDark ? '#0B1120' : C.bg;
  const topInsetBg = isDark ? '#0B1120' : (darkTop ? C.navy : '#fff');

  return (
    <View style={[st.fill, { backgroundColor: shellBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : (darkTop ? 'light-content' : 'dark-content')} backgroundColor="transparent" translucent />
      <View style={{ height: topInset, backgroundColor: topInsetBg }} />
      {!loggedIn ? (
        <View style={st.fill}>
          <AuthScreen />
          <ToastHost />
          <DialogHost />
        </View>
      ) : (
        <>
          <View style={st.fill}>
            <AnimatedScreen key={`tab-${role}-${nav.tab}`} mode="tab">
              <Tab />
            </AnimatedScreen>
            {allowedStack.map((entry, i) => {
              const Screen = SCREENS[entry.name];
              if (!Screen) return null;
              const isTop = i === allowedStack.length - 1;
              return (
                <View key={entry.key} style={[StyleSheet.absoluteFill, { backgroundColor: shellBg, display: isTop ? 'flex' : 'none' }]}>
                  <AnimatedScreen mode="stack">
                    <Screen params={entry.params} />
                  </AnimatedScreen>
                </View>
              );
            })}
          </View>
          {allowedStack.length === 0 ? <BottomNav /> : null}
          <ToastHost />
          <DialogHost />
        </>
      )}
    </View>
  );
}

export function DesktopShowcase({ style }) {
  const { s, a } = useApp();
  const isDark = Boolean(s.darkMode);
  return (
    <View style={[st.side, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={[st.sidePill, isDark && { backgroundColor: 'rgba(30,41,59,0.92)', borderColor: 'rgba(51,65,85,0.8)' }]}>
          <View style={st.sidePillDot} />
          <Text style={[st.sidePillText, isDark && { color: '#60A5FA' }]}>Dịch vụ Kỹ thuật Tại nhà Chính hãng</Text>
        </View>

        {/* Quick Dark Mode Toggle Button */}
        <TouchableOpacity
          onPress={a.toggleDarkMode}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: isDark ? '#1E293B' : 'rgba(255,255,255,0.92)',
            borderWidth: 1,
            borderColor: isDark ? '#334155' : 'rgba(26,95,255,0.16)',
            cursor: 'pointer',
            ...shadow.sm,
          }}
        >
          <AppIcon icon={isDark ? 'sun' : 'moon'} size={14} color={isDark ? '#FBBF24' : '#0062E0'} strokeWidth={2.4} />
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
            {isDark ? 'Giao diện Sáng' : 'Giao diện Tối'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[st.sideBrand, isDark && { color: '#F8FAFC' }]}>
        <Text style={{ color: isDark ? '#60A5FA' : C.primary }}>Thợ</Text> HRMSS
      </Text>
      <Text style={[st.sideText, isDark && { color: '#94A3B8' }]}>
        Đặt lịch vệ sinh, bảo dưỡng, sửa chữa và lắp đặt thiết bị điện máy tận nhà. Báo giá minh bạch, theo dõi hành trình trực tiếp và bảo hành 60 ngày.
      </Text>

      <View style={[st.sideCard, isDark && { backgroundColor: 'rgba(30,41,59,0.92)', borderColor: '#334155' }]}>
        {[
          { icon: 'zap', title: 'Đặt lịch nhanh chóng', sub: 'Chọn dịch vụ và khung giờ linh hoạt tại nhà' },
          { icon: 'receipt-text', title: 'Báo giá minh bạch', sub: 'Khảo sát thực tế, chỉ thực hiện khi khách duyệt' },
          { icon: 'map-pin', title: 'Theo dõi trực tuyến', sub: 'Cập nhật vị trí GPS và tiến độ công việc' },
          { icon: 'shield-check', title: 'Bảo hành 60 ngày', sub: 'Hỗ trợ kiểm tra lại miễn phí sau dịch vụ' },
        ].map((item, idx) => (
          <View key={item.title} style={[st.sideFeature, idx > 0 && (isDark ? st.sideFeatureBorderDark : st.sideFeatureBorder)]}>
            <View style={[st.sideFeatureIcon, isDark && { backgroundColor: '#0F172A' }]}>
              <AppIcon icon={item.icon} size={18} color={isDark ? '#60A5FA' : C.primary} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.sideFeatureTitle, isDark && { color: '#F8FAFC' }]}>{item.title}</Text>
              <Text style={[st.sideFeatureSub, isDark && { color: '#94A3B8' }]}>{item.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Frame({ children }) {
  const { width, height } = useWindowDimensions();
  const { s } = useApp();
  const isDark = Boolean(s?.darkMode);
  const isWeb = Platform.OS === 'web';
  const desktop = isWeb && width >= 560;

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;
    document.title = 'Thợ HRMSS — Dịch vụ sửa chữa & bảo trì tại nhà HRMSS';
    document.body.style.margin = '0';
    document.body.style.backgroundColor = isDark ? '#060A12' : '#DCE4F2';
    document.body.style.overflow = 'hidden';

    // Toggle dark mode class on body
    if (isDark) {
      document.body.classList.add('tho-dark-theme');
    } else {
      document.body.classList.remove('tho-dark-theme');
    }

    // Ẩn thanh cuộn trình duyệt thô
    if (!document.getElementById('tho-hrmss-global-css')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'tho-hrmss-global-css';
      styleEl.textContent = `
        * { -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        *::-webkit-scrollbar { width: 0px; height: 0px; display: none; }
        * { scrollbar-width: none; -ms-overflow-style: none; }
      `;
      document.head.appendChild(styleEl);
    }

    // Dark Mode stylesheet
    let darkStyle = document.getElementById('tho-hrmss-dark-css');
    if (!darkStyle) {
      darkStyle = document.createElement('style');
      darkStyle.id = 'tho-hrmss-dark-css';
      document.head.appendChild(darkStyle);
    }
    darkStyle.textContent = isDark ? DARK_CSS : '';
  }, [isWeb, isDark]);

  if (!isWeb) return <View style={st.fill}>{children}</View>;
  if (!desktop) return <View style={{ width, height, overflow: 'hidden' }}>{children}</View>;

  const frameH = Math.min(height - 36, 884);
  const showSide = width >= 880;
  const left = showSide ? Math.round((width + 320 - PHONE_W) / 2) : Math.round((width - PHONE_W) / 2);
  const top = Math.round((height - frameH) / 2);
  const rect = { left: left + BEZEL, top: top + BEZEL, width: PHONE_W - BEZEL * 2, height: frameH - BEZEL * 2 };
  const sideLeft = left - 44 - 330;

  const stageStyle = isDark
    ? { backgroundImage: 'radial-gradient(circle at 20% 20%, #151E32 0%, #0B1120 55%, #050811 100%)', backgroundColor: '#060A12' }
    : { backgroundImage: 'radial-gradient(circle at 20% 20%, #EEF4FF 0%, #DCE4F2 55%, #CED9EC 100%)', backgroundColor: '#DCE4F2' };

  return (
    <FrameCtx.Provider value={rect}>
      <View
        style={[
          st.stage,
          { width, height },
          Platform.OS === 'web' ? stageStyle : null,
        ]}
      >
        {showSide && sideLeft >= 20 ? (
          <DesktopShowcase style={{ left: sideLeft, top: Math.max(24, height / 2 - 195) }} />
        ) : null}
        <View
          style={[
            st.phone,
            {
              position: 'absolute',
              left,
              top,
              height: frameH,
              backgroundColor: isDark ? '#0B1120' : C.bg,
              borderColor: isDark ? '#1E293B' : '#0B1324',
            },
          ]}
        >
          {children}
        </View>
      </View>
    </FrameCtx.Provider>
  );
}

export default function AppNavigator() {
  return (
    <Frame>
      <Shell />
    </Frame>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  stage: { backgroundColor: '#DCE4F2', overflow: 'hidden' },
  side: { position: 'absolute', width: 330 },
  sidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(26,95,255,0.16)',
  },
  sidePillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  sidePillText: { fontSize: 11, fontWeight: '800', color: C.navy, letterSpacing: 0.2 },
  sideBrand: { fontSize: 44, fontWeight: '900', color: C.navy, letterSpacing: -1 },
  sideText: { fontSize: 14.5, color: C.ink2, marginTop: 8, lineHeight: 22, fontWeight: '500' },
  sideCard: {
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#fff',
    ...shadow.md,
  },
  sideFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  sideFeatureBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  sideFeatureBorderDark: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#334155',
  },
  sideFeatureIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideFeatureTitle: { fontSize: 13, fontWeight: '800', color: C.ink },
  sideFeatureSub: { fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 16 },
  phone: {
    width: PHONE_W,
    borderRadius: 38,
    overflow: 'hidden',
    backgroundColor: C.bg,
    borderWidth: BEZEL,
    borderColor: '#0B1324',
    ...shadow.lg,
  },
});
