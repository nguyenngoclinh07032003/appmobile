import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../components';
import { CATEGORIES, SERVICES, catLabel, catIcon, formatVND } from '../../constants/data';

const TABS = [
  { id: 'home', label: 'Trang chủ', icon: 'home' },
  { id: 'services', label: 'Dịch vụ', icon: 'wrench' },
  { id: 'activity', label: 'Hoạt động', icon: 'clipboard-list' },
  { id: 'personal', label: 'Cá nhân', icon: 'user' },
];
function ActionButton({ title, onPress, secondary = false }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.actionButton, secondary ? styles.secondaryAction : styles.primaryAction]}>
      <Text style={[styles.actionText, secondary && styles.secondaryActionText]}>{title}</Text>
      {!secondary ? <AppIcon icon="chevron-right" size={17} color="#fff" /> : null}
    </Pressable>
  );
}

function ServiceTile({ service, onPress }) {
  const category = CATEGORIES.find((item) => item.id === service.category);
  return (
    <Pressable onPress={onPress} style={styles.serviceTile} accessibilityRole="button">
      <View style={[styles.serviceIcon, { backgroundColor: category?.soft || '#EAF3FF' }]}>
        <AppIcon icon={catIcon(service.category)} size={23} color={category?.color || '#087DEB'} />
      </View>
      <Text style={styles.serviceName} numberOfLines={2}>{service.name}</Text>
      <Text style={styles.servicePrice}>Từ {formatVND(service.price)}</Text>
      <View style={styles.serviceLink}><Text style={styles.serviceLinkText}>Tìm hiểu</Text><AppIcon icon="chevron-right" size={13} color="#087DEB" /></View>
    </Pressable>
  );
}

function HomeTab({ onTab, onLogin, onRegister }) {
  const featured = SERVICES.filter((service) => !service.hidden).slice(0, 4);
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <Image source={require('../../../assets/app-icon.png')} style={styles.topLogo} resizeMode="cover" accessibilityLabel="Logo Thợ Minh Đức" />
          <View><Text style={styles.brandName}>Thợ Minh Đức</Text><Text style={styles.brandCaption}>SỬA CHỮA TẬN TÂM · NÂNG TẦM TỔ ẤM</Text></View>
        </View>
        <Pressable onPress={onLogin} style={styles.topLogin}><Text style={styles.topLoginText}>Đăng nhập</Text></Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTag}><View style={styles.liveDot} /><Text style={styles.heroTagText}>DỊCH VỤ KỸ THUẬT TẠI NHÀ</Text></View>
        <Text style={styles.heroTitle}>Chăm sóc thiết bị,{ '\n' }an tâm mỗi ngày.</Text>
        <Text style={styles.heroBody}>Đặt lịch sửa chữa, vệ sinh và bảo trì điện máy cùng đội ngũ kỹ thuật viên tận tâm.</Text>
        <ActionButton title="Khám phá dịch vụ" onPress={() => onTab('services')} />
        <View style={styles.heroFoot}><AppIcon icon="shield-check" size={15} color="#B7D9FF" /><Text style={styles.heroFootText}>Báo giá minh bạch · Bảo hành rõ ràng</Text></View>
      </View>

      <View style={styles.trustRow}>
        <View style={styles.trustItem}><Text style={styles.trustValue}>Tận nhà</Text><Text style={styles.trustLabel}>Phục vụ linh hoạt</Text></View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}><Text style={styles.trustValue}>60 ngày</Text><Text style={styles.trustLabel}>Bảo hành dịch vụ</Text></View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}><Text style={styles.trustValue}>Minh bạch</Text><Text style={styles.trustLabel}>Duyệt giá trước khi làm</Text></View>
      </View>

      <View style={styles.sectionHead}>
        <View><Text style={styles.eyebrow}>CHỌN DỊCH VỤ</Text><Text style={styles.sectionTitle}>Chăm sóc thiết bị nhà bạn</Text></View>
        <Pressable onPress={() => onTab('services')} style={styles.seeAll}><Text style={styles.seeAllText}>Tất cả</Text><AppIcon icon="chevron-right" size={15} color="#087DEB" /></Pressable>
      </View>
      <View style={styles.serviceGrid}>{featured.map((service) => <ServiceTile key={service.id} service={service} onPress={onLogin} />)}</View>

      <View style={styles.accountBanner}>
        <View style={styles.bannerIcon}><AppIcon icon="sparkles" size={20} color="#FF9F1C" /></View>
        <View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Đồng hành cùng ngôi nhà bạn</Text><Text style={styles.bannerBody}>Đăng ký để đặt lịch, lưu thiết bị và theo dõi bảo hành.</Text></View>
        <Pressable onPress={onRegister} style={styles.bannerArrow}><AppIcon icon="chevron-right" size={18} color="#083B82" /></Pressable>
      </View>
      <Text style={styles.footer}>THỢ MINH ĐỨC  ·  CHĂM SÓC TỔ ẤM BẰNG SỰ TẬN TÂM</Text>
    </ScrollView>
  );
}

function ServicesTab({ onLogin }) {
  const publicServices = SERVICES.filter((service) => !service.hidden);
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.innerPage}>
      <Text style={styles.eyebrow}>DANH MỤC CÔNG KHAI</Text><Text style={styles.pageTitle}>Dịch vụ tại nhà</Text>
      <Text style={styles.pageIntro}>Tham khảo dịch vụ và giá khởi điểm. Đăng nhập để xem chi tiết, chọn lịch và đặt thợ.</Text>
      <View style={styles.categoryChips}>{CATEGORIES.filter((category) => publicServices.some((service) => service.category === category.id)).map((category) => (
        <View key={category.id} style={styles.categoryChip}><AppIcon icon={category.icon} size={14} color="#087DEB" /><Text style={styles.categoryChipText}>{catLabel(category.id)}</Text></View>
      ))}</View>
      <View style={styles.serviceGrid}>{publicServices.slice(0, 12).map((service) => <ServiceTile key={service.id} service={service} onPress={onLogin} />)}</View>
      <ActionButton title="Đăng nhập để đặt dịch vụ" onPress={onLogin} />
      <Text style={styles.disclaimer}>Giá hiển thị là giá tham khảo; kỹ thuật viên sẽ khảo sát và gửi báo giá trước khi thực hiện.</Text>
    </ScrollView>
  );
}

function LockedTab({ tab, onLogin, onRegister }) {
  const isActivity = tab === 'activity';
  const icon = isActivity ? 'clipboard-list' : 'user';
  const title = isActivity ? 'Theo dõi hoạt động' : 'Không gian của bạn';
  const body = isActivity
    ? 'Theo dõi lịch hẹn, trạng thái sửa chữa, báo giá và lịch sử dịch vụ tại một nơi.'
    : 'Đăng nhập để quản lý thông tin cá nhân, địa chỉ, quyền lợi và các đơn dịch vụ.';
  const points = isActivity
    ? ['Cập nhật tiến độ đơn hàng', 'Duyệt báo giá phát sinh', 'Xem lại lịch sử dịch vụ']
    : ['Quản lý hồ sơ và địa chỉ', 'Tích điểm, nhận ưu đãi', 'Liên hệ hỗ trợ nhanh chóng'];
  return (
    <ScrollView contentContainerStyle={styles.lockedPage}>
      <View style={styles.lockedIcon}><AppIcon icon={icon} size={32} color="#087DEB" /></View>
      <Text style={styles.eyebrow}>DÀNH RIÊNG CHO THÀNH VIÊN</Text>
      <Text style={styles.lockedTitle}>{title}</Text>
      <Text style={styles.lockedBody}>{body}</Text>
      <View style={styles.lockedBenefits}>{points.map((point) => <View key={point} style={styles.lockedBenefit}><AppIcon icon="check" size={16} color="#168A55" /><Text style={styles.lockedBenefitText}>{point}</Text></View>)}</View>
      <ActionButton title="Đăng nhập để tiếp tục" onPress={onLogin} />
      <Pressable onPress={onRegister} style={styles.registerLink}><Text style={styles.registerLinkText}>Chưa có tài khoản? <Text style={{ fontWeight: '900' }}>Đăng ký ngay</Text></Text></Pressable>
    </ScrollView>
  );
}

export default function GuestHomeScreen({ onLogin, onRegister }) {
  const [tab, setTab] = useState('home');
  return (
    <View style={styles.page}>
      <View style={styles.content}>
        {tab === 'home' ? <HomeTab onTab={setTab} onLogin={onLogin} onRegister={onRegister} /> : null}
        {tab === 'services' ? <ServicesTab onLogin={onLogin} /> : null}
        {tab === 'activity' || tab === 'personal' ? <LockedTab tab={tab} onLogin={onLogin} onRegister={onRegister} /> : null}
      </View>
      <View style={styles.bottomNav}>
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <Pressable key={item.id} onPress={() => setTab(item.id)} accessibilityRole="tab" accessibilityState={{ selected }} style={styles.navItem}>
              <View style={[styles.navIcon, selected && styles.navIconSelected]}><AppIcon icon={item.icon} size={19} color={selected ? '#087DEB' : '#8995A7'} strokeWidth={selected ? 2.4 : 1.9} /></View>
              <Text numberOfLines={1} style={[styles.navLabel, selected && styles.navLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F6FB' },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 26 },
  topbar: { minHeight: 70, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  topLogo: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff' },
  brandName: { color: '#102B4E', fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  brandCaption: { marginTop: 3, color: '#718096', fontSize: 7.5, letterSpacing: 0.45, fontWeight: '800' },
  topLogin: { paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: '#D7E2F0', backgroundColor: '#fff', borderRadius: 12 },
  topLoginText: { color: '#083B82', fontSize: 12, fontWeight: '800' },
  hero: { position: 'relative', overflow: 'hidden', minHeight: 282, padding: 22, borderRadius: 25, backgroundColor: '#083B82' },
  heroGlow: { position: 'absolute', width: 210, height: 210, right: -84, top: -75, borderRadius: 105, backgroundColor: 'rgba(8,125,235,0.28)' },
  heroTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF9F1C' },
  heroTagText: { color: '#D8E9FF', fontSize: 9, letterSpacing: 0.7, fontWeight: '900' },
  heroTitle: { marginTop: 18, color: '#fff', fontSize: 27, lineHeight: 33, letterSpacing: -0.7, fontWeight: '900' },
  heroBody: { maxWidth: 310, marginTop: 8, color: '#D7E4F5', fontSize: 13, lineHeight: 19 },
  actionButton: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 16 },
  primaryAction: { alignSelf: 'flex-start', marginTop: 18, backgroundColor: '#087DEB' },
  secondaryAction: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8E3F0' },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryActionText: { color: '#083B82' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15 },
  heroFootText: { color: '#B7D9FF', fontSize: 10, fontWeight: '700' },
  trustRow: { marginTop: 14, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 17, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E7ECF3' },
  trustItem: { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  trustValue: { color: '#12385F', fontSize: 12, fontWeight: '900' },
  trustLabel: { marginTop: 4, color: '#8491A3', fontSize: 9, textAlign: 'center' },
  trustDivider: { width: 1, height: 30, backgroundColor: '#E5EAF1' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 25, marginBottom: 12 },
  eyebrow: { color: '#087DEB', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { marginTop: 4, color: '#142B46', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 },
  seeAllText: { color: '#087DEB', fontSize: 11, fontWeight: '800' },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceTile: { width: '48%', flexGrow: 1, minHeight: 160, padding: 13, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E7ECF3' },
  serviceIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  serviceName: { minHeight: 36, marginTop: 9, color: '#243A53', fontSize: 12, lineHeight: 17, fontWeight: '800' },
  servicePrice: { marginTop: 3, color: '#6D7C8E', fontSize: 10, fontWeight: '600' },
  serviceLink: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 2 },
  serviceLinkText: { color: '#087DEB', fontSize: 10, fontWeight: '800' },
  accountBanner: { marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: '#EAF3FF', borderWidth: 1, borderColor: '#D5E7FC', flexDirection: 'row', alignItems: 'center', gap: 11 },
  bannerIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  bannerCopy: { flex: 1 },
  bannerTitle: { color: '#12385F', fontSize: 12, fontWeight: '900' },
  bannerBody: { marginTop: 4, color: '#60758D', fontSize: 10, lineHeight: 15 },
  bannerArrow: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#fff' },
  footer: { marginTop: 20, color: '#9AA6B5', fontSize: 8, textAlign: 'center', letterSpacing: 0.6, fontWeight: '800' },
  innerPage: { padding: 18, paddingBottom: 30 },
  pageTitle: { marginTop: 6, color: '#142B46', fontSize: 25, letterSpacing: -0.5, fontWeight: '900' },
  pageIntro: { marginTop: 7, marginBottom: 16, color: '#708095', fontSize: 13, lineHeight: 19 },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 15 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E1E9F2' },
  categoryChipText: { color: '#41566E', fontSize: 10, fontWeight: '700' },
  disclaimer: { marginTop: 12, color: '#8693A3', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  lockedPage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 26, paddingBottom: 40 },
  lockedIcon: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: '#E6F1FF', marginBottom: 20 },
  lockedTitle: { marginTop: 7, color: '#142B46', fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: -0.4 },
  lockedBody: { maxWidth: 340, marginTop: 9, color: '#708095', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  lockedBenefits: { width: '100%', maxWidth: 340, marginTop: 22, marginBottom: 22, padding: 15, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E7ECF3', gap: 14 },
  lockedBenefit: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  lockedBenefitText: { color: '#42566D', fontSize: 12, fontWeight: '700' },
  registerLink: { marginTop: 14, padding: 8 },
  registerLinkText: { color: '#63758A', fontSize: 12 },
  bottomNav: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E8EDF4' },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { width: 43, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  navIconSelected: { backgroundColor: '#EAF3FF' },
  navLabel: { color: '#8995A7', fontSize: 9, fontWeight: '700' },
  navLabelSelected: { color: '#087DEB', fontWeight: '900' },
});
