import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import { C, R, shadow, toneOf, grad } from '../../theme';
import {
  CATEGORIES, SERVICES, COMMITMENTS, SERVICE_TYPES, TIPS, PARTNERS, CAT_SHORT, HOTLINE, catLabel, catIcon, getService,
} from '../../constants/data';
import { useApp, deviceStatus } from '../../context';
import {
  Tap, IconBtn, IconBox, Card, SectionTitle, ServiceCard, Sheet, Btn, StatusChip, Media, Badge, ui, HScroll, AppIcon,
} from '../../components';

const POPULAR = ['vs-ml-1', 'vs-mg-tren', 'vs-mg-truoc', 'vs-quat-dh', 'vs-ml-am-tran', 'vs-tl-300'].map(getService);
const COMMIT_ICON = ['clock', 'award', 'handshake', 'smile'];

const PARTNER_ROWS = [
  [
    { name: 'NANOMAX', sub: 'Pro Audio', color: '#15803D', weight: '900' },
    { name: 'Panasonic', color: '#0062E0', weight: '900' },
    { name: 'SONY', color: '#0F172A', weight: '900', letterSpacing: 1.5 },
    { name: 'Teka', color: '#DC2626', weight: '900', italic: true },
    { name: 'beko', color: '#0284C7', weight: '900', underline: true },
    { name: 'FUJI SMART', badge: 'F', badgeBg: '#EF4444', color: '#334155', weight: '700' },
    { name: 'CHUNGHO', badge: '💧', badgeBg: '#0284C7', color: '#0369A1', weight: '800' },
    { name: 'Makano', sub: 'CAO CẤP', color: '#DC2626', weight: '800' },
  ],
  [
    { name: 'JBL', badge: 'JBL', badgeBg: '#EA580C', color: '#EA580C', weight: '900' },
    { name: 'BOSS', badge: 'B', badgeBg: '#0284C7', color: '#0369A1', weight: '800' },
    { name: 'HAWOO', badge: '❖', badgeBg: '#F97316', color: '#334155', weight: '800' },
    { name: 'coway', color: '#00A3E0', weight: '900', size: 17 },
    { name: 'SKYWORTH', color: '#0052CC', weight: '900', letterSpacing: 0.6 },
    { name: 'Boston', sub: 'ACOUSTICS', badge: 'b', badgeBg: '#E11D48', color: '#1E293B', weight: '700' },
    { name: 'LG', badge: 'LG', badgeBg: '#BE123C', color: '#BE123C', weight: '900' },
    { name: 'Samsung', color: '#1D4ED8', weight: '900' },
  ],
  [
    { name: 'Comfee', color: '#0369A1', weight: '900', italic: true, size: 17 },
    { name: 'Nagakawa', color: '#DC2626', weight: '900', size: 16 },
    { name: 'SUMICO', badge: 'S', badgeBg: '#DC2626', color: '#0F172A', weight: '900', letterSpacing: 0.8 },
    { name: 'Electrolux', badge: '◧', badgeBg: '#1E3A8A', color: '#1E3A8A', weight: '800', size: 15 },
    { name: 'Daikin', color: '#0284C7', weight: '900', italic: true, size: 16 },
    { name: 'Toshiba', color: '#DC2626', weight: '900', size: 15 },
    { name: 'Casper', color: '#0F172A', weight: '800', letterSpacing: 1 },
  ],
];

function PartnerBrandItem({ item }) {
  return (
    <View style={st.partnerItem}>
      {item.badge ? (
        <View style={[st.partnerBadge, { backgroundColor: item.badgeBg || C.primary }]}>
          <Text style={st.partnerBadgeText}>{item.badge}</Text>
        </View>
      ) : null}
      <View style={{ justifyContent: 'center' }}>
        <Text
          style={[
            st.partnerLogoText,
            {
              color: item.color || C.ink,
              fontWeight: item.weight || '800',
              fontSize: item.size || 15,
              fontStyle: item.italic ? 'italic' : 'normal',
              letterSpacing: item.letterSpacing || 0,
              textDecorationLine: item.underline ? 'underline' : 'none',
            },
          ]}
        >
          {item.name}
        </Text>
        {item.sub ? <Text style={st.partnerSubText}>{item.sub}</Text> : null}
      </View>
    </View>
  );
}

function PartnerMarqueeRow({ items, direction = 'right', duration = 22000 }) {
  const anim = useRef(new Animated.Value(0)).current;
  const ROW_WIDTH = items.length * 132;

  useEffect(() => {
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, duration]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: direction === 'right' ? [-ROW_WIDTH, 0] : [0, -ROW_WIDTH],
  });

  const repeated = [...items, ...items, ...items];

  return (
    <View style={st.marqueeRowClip}>
      <Animated.View style={[st.marqueeTrack, { transform: [{ translateX }] }]}>
        {repeated.map((it, idx) => (
          <PartnerBrandItem key={`${it.name}-${idx}`} item={it} />
        ))}
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const [commit, setCommit] = useState(null);
  const [tip, setTip] = useState(null);
  const firstName = (s.user.name || d.address?.name || '').trim().split(' ').pop();
  const active = d.activeOrders[0];
  const activeSvc = active ? getService(active.items[0]?.id) : null;

  const openType = (id) => (id === 'bao-hanh' ? nav.warranty() : nav.services(id));

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
      {/* ---------------- Header ---------------- */}
      <View style={st.header}>
        <View style={st.headRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={st.hello} numberOfLines={1}>
              {firstName ? `Xin chào, ${firstName}` : 'Xin chào Quý khách'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Text style={st.brand} numberOfLines={1}>Thợ Minh Đức</Text>
              <View style={st.officialTag}>
                <AppIcon name="shield-check" size={10} color="#BAE6FD" strokeWidth={2.6} />
                <Text style={st.officialText}>CHÍNH HÃNG</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconBtn icon="bell" dark badge={d.unread} onPress={() => nav.push('notifications')} label="Thông báo" />
            <IconBtn icon="shopping-cart" dark badge={d.cartCount} onPress={() => nav.push('cart')} label="Giỏ hàng" />
          </View>
        </View>
        <Tap style={st.addr} onPress={() => nav.push(d.address ? 'addresses' : 'address-form')}>
          <AppIcon name="map-pin" size={16} color="#fff" strokeWidth={2.2} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={st.addrLabel}>Địa chỉ phục vụ</Text>
            <Text style={st.addrText} numberOfLines={1}>{d.address ? d.address.full : 'Thêm địa chỉ của bạn'}</Text>
          </View>
          <AppIcon name="chevron-right" size={18} color="rgba(255,255,255,0.75)" strokeWidth={2.2} />
        </Tap>
        <Tap style={st.search} onPress={() => nav.push('search')}>
          <AppIcon name="search" size={18} color={C.primary} strokeWidth={2.2} />
          <Text style={st.searchText}>Tìm dịch vụ: vệ sinh máy lạnh, sạc gas…</Text>
        </Tap>
      </View>

      {/* ---------------- Quick stats ---------------- */}
      <View style={st.stats}>
        {[
          { value: s.points, label: 'Điểm tích luỹ', onPress: () => nav.push('rewards') },
          { value: d.activeOrders.length, label: 'Đang xử lý', onPress: () => nav.activity('active') },
          { value: s.myVouchers.length, label: 'Voucher', onPress: () => nav.push('rewards') },
        ].map((x, i) => (
          <Tap key={x.label} style={[st.stat, i > 0 && st.statBorder]} onPress={x.onPress}>
            <Text style={st.statValue}>{x.value}</Text>
            <Text style={st.statLabel}>{x.label}</Text>
          </Tap>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {/* ---------------- Đơn đang xử lý ---------------- */}
        {active ? (
          <Card style={st.activeCard} onPress={() => nav.push('order', { code: active.code })}>
            <Media item={activeSvc} height={52} width={52} radius={14} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={st.activeCode}>{active.code}</Text>
                <StatusChip status={active.status} />
              </View>
              <Text style={st.activeName} numberOfLines={1}>{activeSvc?.name}</Text>
              <Text style={ui.meta}>
                {active.status === 'quoted' ? 'Có báo giá chờ bạn duyệt' : `${active.dateLabel} · ${active.slot}`}
              </Text>
            </View>
            {active.status === 'quoted' ? (
              <Btn title="Duyệt" small variant="gold" onPress={() => nav.push('order', { code: active.code })} />
            ) : (
              <Text style={ui.chevron}>›</Text>
            )}
          </Card>
        ) : null}

        {/* ---------------- Loại dịch vụ ---------------- */}
        <View style={st.types}>
          {SERVICE_TYPES.map((t) => (
            <Tap key={t.id} style={st.type} onPress={() => openType(t.id)}>
              <View style={st.typeIcon}><AppIcon icon={t.icon} size={23} color={C.primary} strokeWidth={2} /></View>
              <Text style={st.typeLabel}>{t.label}</Text>
            </Tap>
          ))}
        </View>

        {/* ---------------- Danh mục thiết bị ---------------- */}
        <SectionTitle title="Bảo dưỡng theo thiết bị" action="Tất cả" onAction={() => nav.services('bao-duong')} />
        <View style={st.cats}>
          {CATEGORIES.map((c) => {
            const tone = toneOf(c.id);
            return (
              <Tap key={c.id} style={st.cat} onPress={() => nav.services('bao-duong', c.id)}>
                <View style={[st.catIcon, { backgroundColor: tone.bg }]}><AppIcon icon={c.icon} size={24} color={tone.fg} strokeWidth={2} /></View>
                <Text style={st.catLabel} numberOfLines={1}>{CAT_SHORT[c.id]}</Text>
              </Tap>
            );
          })}
          <Tap style={st.cat} onPress={() => nav.push('search')}>
            <View style={[st.catIcon, { backgroundColor: '#EEF2F7' }]}><AppIcon name="search" size={22} color={C.ink2} strokeWidth={2} /></View>
            <Text style={st.catLabel}>Tìm thêm</Text>
          </Tap>
        </View>

        {/* ---------------- Ưu đãi ---------------- */}
        <SectionTitle title="Ưu đãi cho bạn" action="Quyền lợi" onAction={() => nav.push('rewards')} style={{ marginTop: 14 }} />
      </View>
      <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {[
          { bg: C.navy, gradStyle: grad.navyCard, fg: '#fff', tag: 'MÃ THO20', title: 'Giảm 20.000đ', body: 'Cho đơn từ 150.000đ', icon: 'ticket', onPress: () => nav.push('rewards') },
          { bg: C.primary, gradStyle: grad.primaryBtn, fg: '#fff', tag: 'BÁN CHẠY', title: 'Vệ sinh máy lạnh 180K', body: 'Giảm 10% · Bảo hành 60 ngày', icon: 'snowflake', onPress: () => nav.push('detail', { id: 'vs-ml-1' }) },
          { bg: C.navy2, gradStyle: grad.navyCard, fg: '#fff', tag: 'TIẾT KIỆM', title: 'Bảo dưỡng định kỳ', body: 'Nhắc lịch tự động, ưu đãi dài lâu', icon: 'infinity', onPress: () => nav.services('tron-doi') },
        ].map((b) => (
          <Tap key={b.tag} style={[st.promo, { backgroundColor: b.bg }, b.gradStyle]} onPress={b.onPress}>
            <View style={st.promoIcon}><AppIcon icon={b.icon} size={36} color="rgba(255,255,255,0.28)" strokeWidth={1.8} /></View>
            <Text style={[st.promoTag, { color: b.fg, borderColor: b.fg }]}>{b.tag}</Text>
            <Text style={[st.promoTitle, { color: b.fg }]}>{b.title}</Text>
            <Text style={[st.promoBody, { color: b.fg }]}>{b.body}</Text>
          </Tap>
        ))}
      </HScroll>

      {/* ---------------- Dịch vụ phổ biến ---------------- */}
      <View style={{ paddingHorizontal: 16 }}>
        <SectionTitle title="Được đặt nhiều nhất" action="Xem tất cả" onAction={() => nav.services('bao-duong')} />
      </View>
      <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
        {POPULAR.map((it) => <ServiceCard key={it.id} item={it} style={{ width: 168 }} />)}
      </HScroll>

      <View style={{ paddingHorizontal: 16 }}>
        {/* ---------------- Cam kết ---------------- */}
        <SectionTitle title="Cam kết chất lượng dịch vụ" />
        <View style={st.commitGrid}>
          {COMMITMENTS.map((c, i) => (
            <Tap key={c.title} style={st.commit} onPress={() => setCommit(c)}>
              <AppIcon icon={COMMIT_ICON[i]} size={24} color={C.primary} strokeWidth={2.1} />
              <Text style={st.commitTitle}>{c.title}</Text>
              <Text style={st.commitSub} numberOfLines={2}>{c.sub}</Text>
            </Tap>
          ))}
        </View>

        {/* ---------------- Mẹo hay ---------------- */}
        <SectionTitle title="Cẩm nang thiết bị" />
      </View>
      <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {TIPS.map((t) => (
          <Tap key={t.id} style={st.tip} onPress={() => setTip(t)}>
            <View style={[st.tipMedia, { backgroundColor: toneOf(t.category).bg }]}><AppIcon icon={t.icon} size={34} color={toneOf(t.category).fg} strokeWidth={1.9} /></View>
            <View style={{ padding: 12 }}>
              <Text style={st.tipTitle} numberOfLines={2}>{t.title}</Text>
              <Text style={ui.meta}>{t.views} lượt xem</Text>
            </View>
          </Tap>
        ))}
      </HScroll>

      <View style={{ paddingHorizontal: 16 }}>
        {/* ---------------- Đối tác ---------------- */}
        <View style={st.partnerHead}>
          <View style={st.partnerAccentBar} />
          <Text style={st.partnerHeadTitle}>Đối tác</Text>
        </View>
        <View style={st.partnerBoard}>
          <PartnerMarqueeRow items={PARTNER_ROWS[0]} direction="right" duration={24000} />
          <PartnerMarqueeRow items={PARTNER_ROWS[1]} direction="left" duration={22000} />
          <PartnerMarqueeRow items={PARTNER_ROWS[2]} direction="right" duration={25000} />
        </View>

        {/* ---------------- Hotline ---------------- */}
        <Tap style={st.hotline} onPress={u.call}>
          <IconBox icon="🎧" size={46} bg="rgba(255,255,255,0.15)" radius={14} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Cần hỗ trợ? Gọi miễn phí</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 }}>{HOTLINE}</Text>
          </View>
          <Badge text="7:30 – 22:00" fg={C.primary} bg="#fff" />
        </Tap>
      </View>

      {/* ---------------- Sheets ---------------- */}
      <Sheet visible={!!commit} onClose={() => setCommit(null)} title={commit?.title || ''}>
        <Text style={st.sheetSub}>{commit?.sub}</Text>
        <Text style={st.sheetBody}>{commit?.detail}</Text>
      </Sheet>
      <Sheet
        visible={!!tip}
        onClose={() => setTip(null)}
        title="Mẹo hay"
        footer={tip ? (
          <Btn title={`Đặt ${getService(tip.serviceId)?.name || 'dịch vụ'}`} onPress={() => { const id = tip.serviceId; setTip(null); nav.push('detail', { id }); }} />
        ) : null}
      >
        <Text style={[st.cardTitle, { fontSize: 18, lineHeight: 24 }]}>{tip?.title}</Text>
        <Text style={[ui.meta, { marginBottom: 10 }]}>👁 {tip?.views}</Text>
        <Text style={st.sheetBody}>{tip?.body}</Text>
      </Sheet>
    </ScrollView>
  );
}

export const st = StyleSheet.create({
  header: { backgroundColor: C.navy, ...grad.navyHero, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 46, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hello: { color: 'rgba(255,255,255,0.78)', fontSize: 12.5, fontWeight: '500' },
  brand: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  officialTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  officialText: { color: '#fff', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.4 },
  addr: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  addrLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  addrText: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 1 },
  search: { marginTop: 14, height: 48, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  searchText: { color: C.faint, fontSize: 14, flex: 1 },
  stats: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: -30, borderRadius: R.lg, paddingVertical: 12, ...shadow.md },
  stat: { flex: 1, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderLeftColor: C.line },
  statValue: { fontSize: 17, fontWeight: '800', color: C.ink },
  statLabel: { fontSize: 11, color: C.muted, marginTop: 3, fontWeight: '600' },
  activeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, borderColor: '#D6E4FF', backgroundColor: '#F7FAFF' },
  activeCode: { fontSize: 12, fontWeight: '800', color: C.ink2 },
  activeName: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 4 },
  types: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  type: { alignItems: 'center', width: '19%' },
  typeIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.sm, borderWidth: 1, borderColor: '#EEF2F7' },
  typeLabel: { fontSize: 12, fontWeight: '700', color: C.ink2, marginTop: 7 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  cat: { width: '25%', alignItems: 'center' },
  catIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 12, color: C.ink2, marginTop: 6, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  body: { fontSize: 13, color: C.ink2, lineHeight: 19 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F3F8' },
  dueName: { fontSize: 14, fontWeight: '700', color: C.ink },
  promo: { width: 250, height: 138, borderRadius: 20, padding: 16, overflow: 'hidden', justifyContent: 'flex-end' },
  promoIcon: { position: 'absolute', right: 14, top: 12, fontSize: 40 },
  promoTag: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 8, opacity: 0.9 },
  promoTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  promoBody: { fontSize: 12, marginTop: 4, opacity: 0.85, fontWeight: '500' },
  commitGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  commit: { width: '48.5%', backgroundColor: '#fff', borderRadius: R.lg, padding: 14, ...shadow.sm, borderWidth: 1, borderColor: '#EEF2F7' },
  commitTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 8 },
  commitSub: { fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 17 },
  tip: { width: 220, backgroundColor: '#fff', borderRadius: R.lg, overflow: 'hidden', ...shadow.sm, borderWidth: 1, borderColor: '#EEF2F7' },
  tipMedia: { height: 92, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { fontSize: 14, fontWeight: '700', color: C.ink, lineHeight: 19 },
  partners: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  partner: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.line },
  partnerText: { fontSize: 12, fontWeight: '800', color: C.ink2 },
  partnerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  partnerAccentBar: { width: 4, height: 20, borderRadius: 2, backgroundColor: '#F59E0B' },
  partnerHeadTitle: { fontSize: 19, fontWeight: '800', color: C.primary, letterSpacing: -0.3 },
  partnerBoard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    gap: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    ...shadow.sm,
  },
  marqueeRowClip: {
    width: '100%',
    overflow: 'hidden',
    height: 36,
    justifyContent: 'center',
  },
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  partnerItem: {
    width: 132,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  partnerBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  partnerLogoText: {
    lineHeight: 18,
  },
  partnerSubText: {
    fontSize: 7.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
    marginTop: -1,
  },
  hotline: { marginTop: 24, backgroundColor: C.navy, ...grad.navyCard, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', ...shadow.md },
  sheetSub: { fontSize: 14, color: C.primary, fontWeight: '700', marginBottom: 10 },
  sheetBody: { fontSize: 15, color: C.ink2, lineHeight: 23 },
});

