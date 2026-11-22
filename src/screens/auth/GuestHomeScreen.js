import React, { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../components';
import { ALL_SERVICES, CATEGORIES, SERVICES, catLabel, catIcon, formatVND } from '../../constants/data';
import { useApp } from '../../context';
import { C, grad } from '../../theme';

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
  return (
    <Pressable onPress={onPress} style={styles.serviceTile} accessibilityRole="button">
      <View style={[styles.serviceIcon, { backgroundColor: C.primarySoft }]}>
        <AppIcon icon={catIcon(service.category)} size={23} color={C.primary} />
      </View>
      <Text style={styles.serviceName} numberOfLines={2}>{service.name}</Text>
      <Text style={styles.servicePrice}>Từ {formatVND(service.price)}</Text>
      <View style={styles.serviceLink}><Text style={styles.serviceLinkText}>Tìm hiểu</Text><AppIcon icon="chevron-right" size={13} color={C.primary} /></View>
    </Pressable>
  );
}

function HomeTab({ onTab, onLogin, onRegister, onRetryCatalog }) {
  const featured = (SERVICES.length ? SERVICES : ALL_SERVICES).filter((service) => !service.hidden).slice(0, 4);
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
        <View style={styles.heroFoot}><AppIcon icon="shield-check" size={15} color="rgba(255,255,255,0.82)" /><Text style={styles.heroFootText}>Báo giá minh bạch · Bảo hành rõ ràng</Text></View>
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
        <Pressable onPress={() => onTab('services')} style={styles.seeAll}><Text style={styles.seeAllText}>Tất cả</Text><AppIcon icon="chevron-right" size={15} color={C.primary} /></Pressable>
      </View>
      {featured.length ? (
        <View style={styles.serviceGrid}>{featured.map((service) => <ServiceTile key={service.id} service={service} onPress={onLogin} />)}</View>
      ) : (
        <View style={styles.emptyCatalogCard}>
          <Text style={styles.emptyCatalogTitle}>Chưa tải được danh mục dịch vụ</Text>
          <Text style={styles.emptyCatalogBody}>Kiểm tra kết nối mạng và chạm để tải lại bảng dịch vụ công khai.</Text>
          <ActionButton title="Tải lại danh mục" secondary onPress={onRetryCatalog} />
        </View>
      )}

      <Pressable onPress={onRegister} style={styles.accountBanner} accessibilityRole="button">
        <View style={styles.bannerIcon}><AppIcon icon="sparkles" size={20} color={C.primary} /></View>
        <View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Đồng hành cùng ngôi nhà bạn</Text><Text style={styles.bannerBody}>Đăng ký để đặt lịch, lưu thiết bị và theo dõi bảo hành.</Text></View>
        <View style={styles.bannerArrow}><AppIcon icon="chevron-right" size={18} color={C.primary} /></View>
      </Pressable>
      <Text style={styles.footer}>THỢ MINH ĐỨC  ·  CHĂM SÓC TỔ ẤM BẰNG SỰ TẬN TÂM</Text>
    </ScrollView>
  );
}

function ServicesTab({ onLogin, onRetryCatalog }) {
  const publicServices = (ALL_SERVICES.length ? ALL_SERVICES : SERVICES).filter((service) => !service.hidden);
  const [selectedCat, setSelectedCat] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const activeCats = CATEGORIES.filter((category) => publicServices.some((service) => service.category === category.id));
  const filtered = selectedCat === 'all' ? publicServices : publicServices.filter((service) => service.category === selectedCat);
  const displayed = showAll ? filtered : filtered.slice(0, 12);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.innerPage}>
      <Text style={styles.eyebrow}>DANH MỤC CÔNG KHAI</Text><Text style={styles.pageTitle}>Dịch vụ tại nhà</Text>
      <Text style={styles.pageIntro}>Tham khảo dịch vụ và giá khởi điểm. Đăng nhập để xem chi tiết, chọn lịch và đặt thợ.</Text>
      <View style={styles.categoryChips}>
        <Pressable
          onPress={() => { setSelectedCat('all'); setShowAll(false); }}
          accessibilityRole="button"
          style={[styles.categoryChip, selectedCat === 'all' && styles.categoryChipActive]}
        >
          <Text style={[styles.categoryChipText, selectedCat === 'all' && styles.categoryChipTextActive]}>
            Tất cả ({publicServices.length})
          </Text>
        </Pressable>
        {activeCats.map((category) => {
          const on = selectedCat === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => { setSelectedCat(on ? 'all' : category.id); setShowAll(false); }}
              accessibilityRole="button"
              style={[styles.categoryChip, on && styles.categoryChipActive]}
            >
              <AppIcon icon={category.icon} size={14} color={on ? '#fff' : C.primary} />
              <Text style={[styles.categoryChipText, on && styles.categoryChipTextActive]}>{catLabel(category.id)}</Text>
            </Pressable>
          );
        })}
      </View>
      {displayed.length ? (
        <View style={styles.serviceGrid}>{displayed.map((service) => <ServiceTile key={service.id} service={service} onPress={onLogin} />)}</View>
      ) : (
        <View style={styles.emptyCatalogCard}>
          <Text style={styles.emptyCatalogTitle}>Chưa tải được dịch vụ</Text>
          <Text style={styles.emptyCatalogBody}>Vui lòng kiểm tra kết nối và tải lại danh mục công khai.</Text>
          <ActionButton title="Tải lại danh mục" secondary onPress={onRetryCatalog} />
        </View>
      )}
      {!showAll && filtered.length > 12 ? (
        <View style={{ marginTop: 12 }}>
          <ActionButton
            title={`Xem thêm (${filtered.length - 12} dịch vụ)`}
            secondary
            onPress={() => setShowAll(true)}
          />
        </View>
      ) : null}
      <View style={{ marginTop: 12 }}>
        <ActionButton title="Đăng nhập để đặt dịch vụ" onPress={onLogin} />
      </View>
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
      <View style={styles.lockedIcon}><AppIcon icon={icon} size={32} color={C.primary} /></View>
      <Text style={styles.eyebrow}>DÀNH RIÊNG CHO THÀNH VIÊN</Text>
      <Text style={styles.lockedTitle}>{title}</Text>
      <Text style={styles.lockedBody}>{body}</Text>
      <View style={styles.lockedBenefits}>{points.map((point) => <View key={point} style={styles.lockedBenefit}><AppIcon icon="check" size={16} color={C.green} /><Text style={styles.lockedBenefitText}>{point}</Text></View>)}</View>
      <ActionButton title="Đăng nhập để tiếp tục" onPress={onLogin} />
      <Pressable onPress={onRegister} style={styles.registerLink}><Text style={styles.registerLinkText}>Chưa có tài khoản? <Text style={{ fontWeight: '900', color: C.primary }}>Đăng ký ngay</Text></Text></Pressable>
    </ScrollView>
  );
}

export default function GuestHomeScreen({ onLogin, onRegister }) {
  const { s, a } = useApp();
  const [tab, setTab] = useState('home');
  const retryCatalog = () => { Promise.resolve(a.syncCatalog?.(true)).catch(() => {}); };
  return (
    <View style={styles.page}>
      <View style={styles.content}>
        {tab === 'home' ? <HomeTab onTab={setTab} onLogin={onLogin} onRegister={onRegister} onRetryCatalog={retryCatalog} catalogVersion={s?.catalogVersion} /> : null}
        {tab === 'services' ? <ServicesTab onLogin={onLogin} onRetryCatalog={retryCatalog} catalogVersion={s?.catalogVersion} /> : null}
        {tab === 'activity' || tab === 'personal' ? <LockedTab tab={tab} onLogin={onLogin} onRegister={onRegister} /> : null}
      </View>
      <View style={styles.bottomNav}>
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <Pressable key={item.id} onPress={() => setTab(item.id)} accessibilityRole="tab" accessibilityState={{ selected }} style={styles.navItem}>
              <View style={[styles.navIcon, selected && styles.navIconSelected]}><AppIcon icon={item.icon} size={19} color={selected ? C.primary : C.muted} strokeWidth={selected ? 2.4 : 1.9} /></View>
              <Text numberOfLines={1} style={[styles.navLabel, selected && styles.navLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 26 },
  topbar: { minHeight: 70, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  topLogo: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.card },
  brandName: { color: C.ink, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  brandCaption: { marginTop: 3, color: C.muted, fontSize: 7.5, letterSpacing: 0.45, fontWeight: '800' },
  topLogin: { paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 12 },
  topLoginText: { color: C.navy, fontSize: 12, fontWeight: '800' },
  hero: { position: 'relative', overflow: 'hidden', minHeight: 282, padding: 22, borderRadius: 25, backgroundColor: C.navy, ...grad.navyHero },
  heroGlow: { position: 'absolute', width: 210, height: 210, right: -84, top: -75, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  heroTagText: { color: '#FFFFFF', fontSize: 9, letterSpacing: 0.7, fontWeight: '900' },
  heroTitle: { marginTop: 18, color: '#fff', fontSize: 27, lineHeight: 33, letterSpacing: -0.7, fontWeight: '900' },
  heroBody: { maxWidth: 310, marginTop: 8, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  actionButton: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 16 },
  primaryAction: { alignSelf: 'flex-start', marginTop: 18, backgroundColor: C.primary },
  secondaryAction: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryActionText: { color: C.navy },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15 },
  heroFootText: { color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '700' },
  trustRow: { marginTop: 14, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 17, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  trustItem: { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  trustValue: { color: C.ink, fontSize: 12, fontWeight: '900' },
  trustLabel: { marginTop: 4, color: C.muted, fontSize: 9, textAlign: 'center' },
  trustDivider: { width: 1, height: 30, backgroundColor: C.line },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 25, marginBottom: 12 },
  eyebrow: { color: C.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { marginTop: 4, color: C.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 },
  seeAllText: { color: C.primary, fontSize: 11, fontWeight: '800' },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceTile: { width: '48%', flexGrow: 1, minHeight: 160, padding: 13, borderRadius: 17, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  serviceIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  serviceName: { minHeight: 36, marginTop: 9, color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  servicePrice: { marginTop: 3, color: C.ink2, fontSize: 11, fontWeight: '700' },
  serviceLink: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 2 },
  serviceLinkText: { color: C.primary, fontSize: 10, fontWeight: '800' },
  accountBanner: { marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary, flexDirection: 'row', alignItems: 'center', gap: 11 },
  bannerIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
  bannerCopy: { flex: 1 },
  bannerTitle: { color: C.ink, fontSize: 12, fontWeight: '900' },
  bannerBody: { marginTop: 4, color: C.muted, fontSize: 10, lineHeight: 15 },
  bannerArrow: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: C.surface },
  footer: { marginTop: 20, color: C.faint, fontSize: 8, textAlign: 'center', letterSpacing: 0.6, fontWeight: '800' },
  innerPage: { padding: 18, paddingBottom: 30 },
  pageTitle: { marginTop: 6, color: C.ink, fontSize: 25, letterSpacing: -0.5, fontWeight: '900' },
  pageIntro: { marginTop: 7, marginBottom: 16, color: C.muted, fontSize: 13, lineHeight: 19 },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 15 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  categoryChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  categoryChipText: { color: C.ink2, fontSize: 10, fontWeight: '700' },
  categoryChipTextActive: { color: '#fff' },
  disclaimer: { marginTop: 12, color: C.faint, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  lockedPage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 26, paddingBottom: 40 },
  lockedIcon: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: C.primarySoft, marginBottom: 20 },
  lockedTitle: { marginTop: 7, color: C.ink, fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: -0.4 },
  lockedBody: { maxWidth: 340, marginTop: 9, color: C.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  lockedBenefits: { width: '100%', maxWidth: 340, marginTop: 22, marginBottom: 22, padding: 15, borderRadius: 17, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, gap: 14 },
  lockedBenefit: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  lockedBenefitText: { color: C.ink2, fontSize: 12, fontWeight: '700' },
  registerLink: { marginTop: 14, padding: 8 },
  registerLinkText: { color: C.muted, fontSize: 12 },
  bottomNav: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 22 : 8, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  emptyCatalogCard: { padding: 18, borderRadius: 17, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', gap: 10 },
  emptyCatalogTitle: { fontSize: 14, fontWeight: '800', color: C.ink, textAlign: 'center' },
  emptyCatalogBody: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 17 },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { width: 43, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  navIconSelected: { backgroundColor: C.primarySoft },
  navLabel: { color: C.muted, fontSize: 9, fontWeight: '700' },
  navLabelSelected: { color: C.primary, fontWeight: '900' },
});
