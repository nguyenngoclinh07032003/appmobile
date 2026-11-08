import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Platform, useWindowDimensions, Animated, Easing,
} from 'react-native';
import { C, shadow } from '../theme';
import { useApp } from '../context';
import { DialogHost, ToastHost, FrameCtx } from '../components';
import BottomNav from './BottomNav';
import { CUSTOMER_TABS, TECH_TABS, SCREENS, DARK_TOP, PHONE_W, BEZEL, AuthScreen } from './routes';

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
  const loggedIn = !!s.auth;
  const role = s.auth?.role || s.role;
  const tabs = role === 'tech' ? TECH_TABS : CUSTOMER_TABS;
  const Tab = tabs.find((t) => t.id === nav.tab)?.Comp || tabs[0].Comp;
  const topName = nav.top?.name;
  const darkTop = !loggedIn ? true : (topName ? topName === 'qr' : DARK_TOP.includes(nav.tab));
  const topInset = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : Platform.OS === 'ios' ? 47 : 0;

  // Chặn stack thuộc vai trò khác (phân quyền) & chỉ giữ màn hình có định nghĩa trong SCREENS
  const allowedStack = loggedIn
    ? nav.stack.filter((entry) => Boolean(SCREENS[entry.name]) && (role === 'tech' ? String(entry.name).startsWith('tech') : !String(entry.name).startsWith('tech')))
    : [];

  return (
    <View style={[st.fill, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={darkTop ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <View style={{ height: topInset, backgroundColor: darkTop ? C.navy : '#fff' }} />
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
                <View key={entry.key} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, display: isTop ? 'flex' : 'none' }]}>
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
  return (
    <View style={[st.side, style]}>
      <View style={st.sidePill}>
        <View style={st.sidePillDot} />
        <Text style={st.sidePillText}>Dịch vụ Kỹ thuật Tại nhà Chính hãng</Text>
      </View>
      <Text style={st.sideBrand}><Text style={{ color: C.primary }}>Thợ</Text> HRMSS</Text>
      <Text style={st.sideText}>
        Đặt lịch vệ sinh, bảo dưỡng, sửa chữa và lắp đặt thiết bị điện máy tận nhà. Báo giá minh bạch, theo dõi hành trình trực tiếp và bảo hành 60 ngày.
      </Text>

      <View style={st.sideCard}>
        {[
          { icon: '⚡', title: 'Đặt lịch nhanh chóng', sub: 'Chọn dịch vụ và khung giờ linh hoạt tại nhà' },
          { icon: '🧾', title: 'Báo giá minh bạch', sub: 'Khảo sát thực tế, chỉ thực hiện khi khách duyệt' },
          { icon: '📍', title: 'Theo dõi trực tuyến', sub: 'Cập nhật vị trí GPS và tiến độ công việc' },
          { icon: '🛡️', title: 'Bảo hành 60 ngày', sub: 'Hỗ trợ kiểm tra lại miễn phí sau dịch vụ' },
        ].map((item, idx) => (
          <View key={item.title} style={[st.sideFeature, idx > 0 && st.sideFeatureBorder]}>
            <View style={st.sideFeatureIcon}>
              <Text style={{ fontSize: 16 }}>{item.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.sideFeatureTitle}>{item.title}</Text>
              <Text style={st.sideFeatureSub}>{item.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Frame({ children }) {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const desktop = isWeb && width >= 560;

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;
    document.title = 'Thợ HRMSS — Dịch vụ sửa chữa & bảo trì tại nhà HRMSS';
    document.body.style.margin = '0';
    document.body.style.backgroundColor = '#DCE4F2';
    document.body.style.overflow = 'hidden';
    // Ẩn thanh cuộn trình duyệt thô để khung điện thoại mượt như native app
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
  }, [isWeb]);

  if (!isWeb) return <View style={st.fill}>{children}</View>;
  if (!desktop) return <View style={{ width, height, overflow: 'hidden' }}>{children}</View>;

  const frameH = Math.min(height - 36, 884);
  const showSide = width >= 880;
  const left = showSide ? Math.round((width + 320 - PHONE_W) / 2) : Math.round((width - PHONE_W) / 2);
  const top = Math.round((height - frameH) / 2);
  const rect = { left: left + BEZEL, top: top + BEZEL, width: PHONE_W - BEZEL * 2, height: frameH - BEZEL * 2 };
  const sideLeft = left - 44 - 330;
  return (
    <FrameCtx.Provider value={rect}>
      <View
        style={[
          st.stage,
          { width, height },
          Platform.OS === 'web' ? { backgroundImage: 'radial-gradient(circle at 20% 20%, #EEF4FF 0%, #DCE4F2 55%, #CED9EC 100%)' } : null,
        ]}
      >
        {showSide && sideLeft >= 20 ? (
          <DesktopShowcase style={{ left: sideLeft, top: Math.max(24, height / 2 - 195) }} />
        ) : null}
        <View style={[st.phone, { position: 'absolute', left, top, height: frameH }]}>
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
    marginBottom: 12,
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

