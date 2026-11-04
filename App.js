import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Platform, useWindowDimensions, TouchableOpacity,
} from 'react-native';
import { C, shadow } from './src/theme';
import { AppProvider, useApp } from './src/store';
import { DialogHost, ToastHost, FrameCtx } from './src/ui';
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
const PHONE_W = 400;
const BEZEL = 8;

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
          <TouchableOpacity key={t.id} style={st.navItem} onPress={() => nav.go(t.id)} activeOpacity={0.7} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View style={[st.navIcon, on && st.navIconOn]}>
              <Text style={{ fontSize: 19, opacity: on ? 1 : 0.6 }}>{t.icon}</Text>
              {badges[t.id] ? <View style={st.navBadge}><Text style={st.navBadgeText}>{badges[t.id]}</Text></View> : null}
            </View>
            <Text style={[st.navLabel, on && st.navLabelOn]}>{t.label}</Text>
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
            <View style={st.fill}>
              <Tab />
            </View>
            {allowedStack.map((entry, i) => {
              const Screen = SCREENS[entry.name];
              if (!Screen) return null;
              const isTop = i === allowedStack.length - 1;
              return (
                <View key={entry.key} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, display: isTop ? 'flex' : 'none' }]}>
                  <Screen params={entry.params} />
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

function Frame({ children }) {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const desktop = isWeb && width >= 560;

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;
    document.title = 'Thợ ĐMX';
    document.body.style.margin = '0';
    document.body.style.backgroundColor = '#DDE4EF';
    document.body.style.overflow = 'hidden';
  }, [isWeb]);

  if (!isWeb) return <View style={st.fill}>{children}</View>;
  if (!desktop) return <View style={{ width, height, overflow: 'hidden' }}>{children}</View>;

  const frameH = Math.min(height - 48, 880);
  const left = (width - PHONE_W) / 2;
  const top = (height - frameH) / 2;
  // Vùng hiển thị bên trong khung (trừ viền) — để sheet/dialog nằm gọn trong "điện thoại"
  const rect = { left: left + BEZEL, top: top + BEZEL, width: PHONE_W - BEZEL * 2, height: frameH - BEZEL * 2 };
  const sideLeft = left - 56 - 300;
  return (
    <FrameCtx.Provider value={rect}>
      <View style={[st.stage, { width, height }]}>
        {sideLeft >= 24 ? (
          <View style={[st.side, { left: sideLeft, top: height / 2 - 90 }]}>
            <Text style={st.sideBrand}><Text style={{ color: C.gold }}>Thợ</Text> ĐMX</Text>
            <Text style={st.sideText}>Đặt thợ tận nhà — nhanh, minh bạch, bảo hành 60 ngày. Đăng nhập đúng vai trò Khách hàng hoặc Kỹ thuật viên để làm việc.</Text>
          </View>
        ) : null}
        <View style={[st.phone, { position: 'absolute', left, top, height: frameH }]}>{children}</View>
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
  stage: { backgroundColor: '#DDE4EF', overflow: 'hidden' },
  side: { position: 'absolute', width: 300 },
  sideBrand: { fontSize: 44, fontWeight: '900', color: C.navy, letterSpacing: -1 },
  sideText: { fontSize: 16, color: C.ink2, marginTop: 10, lineHeight: 24 },
  phone: { width: PHONE_W, borderRadius: 36, overflow: 'hidden', backgroundColor: C.bg, borderWidth: BEZEL, borderColor: '#0B1220', ...shadow.lg },
  nav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    ...shadow.sm,
  },
  navItem: { flex: 1, alignItems: 'center' },
  navIcon: { width: 48, height: 32, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navIconOn: { backgroundColor: C.primarySoft },
  navLabel: { fontSize: 11, color: C.muted, marginTop: 4, fontWeight: '600' },
  navLabelOn: { color: C.primary, fontWeight: '800' },
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
