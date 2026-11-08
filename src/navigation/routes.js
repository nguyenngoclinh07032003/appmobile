import HomeScreen from '../screens/home';
import {
  ServicesScreen, ActivityScreen, PersonalScreen,
} from '../screens/customer';
import {
  DetailScreen, CartScreen, CheckoutScreen, SuccessScreen, AddressesScreen, AddressFormScreen,
} from '../screens/booking';
import {
  SearchScreen, NotificationsScreen, OrderScreen, RateScreen, RewardsScreen,
  ProfileScreen, HelpScreen, TermsScreen,
} from '../screens/misc';
import {
  TechJobsScreen, TechScheduleScreen, TechNotifsScreen, TechAccountScreen, TechJobScreen,
} from '../screens/tech';
import AuthScreen from '../screens/auth';

export const CUSTOMER_TABS = [
  { id: 'home', label: 'Trang chủ', icon: 'home', Comp: HomeScreen },
  { id: 'services', label: 'Dịch vụ', icon: 'wrench', Comp: ServicesScreen },
  { id: 'activity', label: 'Hoạt động', icon: 'clipboard-list', Comp: ActivityScreen },
  { id: 'personal', label: 'Cá nhân', icon: 'user', Comp: PersonalScreen },
];

// App Thợ (Technician)
export const TECH_TABS = [
  { id: 'tech-jobs', label: 'Công việc', icon: 'wrench', Comp: TechJobsScreen },
  { id: 'tech-schedule', label: 'Lịch', icon: 'calendar', Comp: TechScheduleScreen },
  { id: 'tech-notifs', label: 'Thông báo', icon: 'bell', Comp: TechNotifsScreen },
  { id: 'tech-account', label: 'Tài khoản', icon: 'hard-hat', Comp: TechAccountScreen },
];

// Màn hình phủ lên trên tab (điều hướng dạng stack)
export const SCREENS = {
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
  profile: ProfileScreen,
  help: HelpScreen,
  terms: TermsScreen,
  'tech-job': TechJobScreen,
  'tech-notifs': TechNotifsScreen,
};

export const DARK_TOP = ['home', 'personal', 'tech-jobs', 'tech-account'];
export const PHONE_W = 404;
export const BEZEL = 8;
export { AuthScreen };

