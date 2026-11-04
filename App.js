import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Platform, useWindowDimensions, TouchableOpacity, Animated, Easing,
} from 'react-native';
import { C, shadow, grad } from './src/theme';
import { AppProvider, useApp } from './src/store';
import { DialogHost, ToastHost, FrameCtx, Tap } from './src/ui';
import HomeScreen from './src/screens/Home';
import {
  ServicesScreen, DevicesScreen, ActivityScreen, PersonalScreen,
} from './src/screens/Tabs';
import {
  DetailScreen, CartScreen, CheckoutScreen, SuccessScreen, AddressesScreen, AddressFormScreen,
} from './src/screens/Booking';
import {
  SearchScreen, NotificationsScreen, OrderScreen, RateScreen, RewardsScreen, FavoritesScreen,
  ProfileScreen, HelpScreen, TermsScreen, QRScreen, DeviceFormScreen,
} from './src/screens/Misc';
import {
  TechJobsScreen, TechScheduleScreen, TechNotifsScreen, TechAccountScreen, TechJobScreen,
} from './src/screens/Tech';
import AuthScreen from './src/screens/Auth';

const CUSTOMER_TABS = [
  { id: 'home', label: 'Trang chủ', icon: '🏠', Comp: HomeScreen },
  { id: 'services', label: 'Dịch vụ', icon: '🧰', Comp: ServicesScreen },
  { id: 'devices', label: 'Thiết bị', icon: '📺', Comp: DevicesScreen },
  { id: 'activity', label: 'Hoạt động', icon: '📋', Comp: ActivityScreen },
  { id: 'personal', label: 'Cá nhân', icon: '👤', Comp: PersonalScreen },
];
// App Thợ (Technician)
const TECH_TABS = [
  { id: 'tech-jobs', label: 'Công việc', icon: '🧰', Comp: TechJobsScreen },
  { id: 'tech-schedule', label: 'Lịch', icon: '📅', Comp: TechScheduleScreen },
  { id: 'tech-notifs', label: 'Thông báo', icon: '🔔', Comp: TechNotifsScreen },
  { id: 'tech-account', label: 'Tài khoản', icon: '👷', Comp: TechAccountScreen },
];

// Màn hình phủ lên trên tab (điều hướng dạng stack)
const SCREENS = {
  detail: DetailScreen,
  cart: CartScreen,
  checkout: CheckoutScreen,
  success: SuccessScreen,
  addresses: AddressesScreen,
  'address-form': AddressFormScreen,
  search: SearchScreen,
  notifications: NotificationsScreen,
  order: OrderScreen,
  rate: RateScreen,
  rewards: RewardsScreen,
  favorites: FavoritesScreen,
  profile: ProfileScreen,
  help: HelpScreen,
  terms: TermsScreen,
  qr: QRScreen,
  'device-form': DeviceFormScreen,
  'tech-job': TechJobScreen,
};
const DARK_TOP = ['home', 'personal', 'tech-jobs', 'tech-account'];
const PHONE_W = 404;
const BEZEL = 8;

function AnimatedScreen({ children, mode = 'stack' }) {
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

function BottomNav() {
  const { s, nav, d } = useApp();
  const role = s.auth?.role || s.role;
  const tabs = role === 'tech' ? TECH_TABS : CUSTOMER_TABS;
  const badges = role === 'tech'
    ? { 'tech-jobs': d.newJobs.length, 'tech-notifs': d.techUnread }
    : { activity: d.activeOrders.length, devices: d.dueDevices.length };
  return (
    <View style={st.nav}>
      {tabs.map((t) => {
        const on = nav.tab === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={st.navItem}
            onPress={() => nav.go(t.id)}
            activeOpacity={0.72}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <View style={[st.navIcon, on && st.navIconOn]}>
              <Text style={{ fontSize: 19, opacity: on ? 1 : 0.58, transform: [{ scale: on ? 1.06 : 1 }] }}>{t.icon}</Text>
              {badges[t.id] ? <View style={st.navBadge}><Text style={st.navBadgeText}>{badges[t.id]}</Text></View> : null}
            </View>
            <Text style={[st.navLabel, on && st.navLabelOn]}>{t.label}</Text>
            {on ? <View style={st.navDot} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Shell() {
  const { s, nav } = useApp();
  const loggedIn = !!s.auth;
  const role = s.auth?.role || s.role;
  const tabs = role === 'tech' ? TECH_TABS : CUSTOMER_TABS;
  const Tab = tabs.find((t) => t.id === nav.tab)?.Comp || tabs[0].Comp;
  const topName = nav.top?.name;
  const darkTop = !loggedIn ? true : (topName ? topName === 'qr' : DARK_TOP.includes(nav.tab));
  const topInset = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : Platform.OS === 'ios' ? 47 : 0;

  // Chặn stack thuộc vai trò khác (phân quyền)
  const allowedStack = loggedIn
    ? nav.stack.filter((entry) => (role === 'tech' ? String(entry.name).startsWith('tech') : !String(entry.name).startsWith('tech')))
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

function DesktopShowcase({ style }) {
  return (
    <View style={[st.side, style]}>
      <View style={st.sidePill}>
        <View style={st.sidePillDot} />
        <Text style={st.sidePillText}>Dịch vụ Kỹ thuật Tại nhà Chính hãng</Text>
      </View>
      <Text style={st.sideBrand}><Text style={{ color: C.gold }}>Thợ</Text> ĐMX</Text>
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

function Frame({ children }) {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const desktop = isWeb && width >= 560;

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;
    document.title = 'Thợ ĐMX — Đặt thợ Điện Máy XANH';
    document.body.style.margin = '0';
    document.body.style.backgroundColor = '#DCE4F2';
    document.body.style.overflow = 'hidden';
    // Ẩn thanh cuộn trình duyệt thô để khung điện thoại mượt như native app
    if (!document.getElementById('tho-dmx-global-css')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'tho-dmx-global-css';
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

export default function App() {
  return (
    <AppProvider>
      <Frame>
        <Shell />
      </Frame>
    </AppProvider>
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
  nav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    paddingTop: 7,
    paddingBottom: Platform.OS === 'ios' ? 24 : 9,
    ...shadow.sm,
  },
  navItem: { flex: 1, alignItems: 'center' },
  navIcon: { width: 48, height: 32, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navIconOn: { backgroundColor: C.primarySoft },
  navLabel: { fontSize: 11, color: C.muted, marginTop: 3, fontWeight: '600' },
  navLabelOn: { color: C.primary, fontWeight: '800' },
  navDot: { width: 16, height: 3, borderRadius: 2, backgroundColor: C.primary, marginTop: 3 },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  navBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
