import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { C, R, shadow, toneOf, grad } from '../theme';
import {
  CATEGORIES, SERVICES, COMMITMENTS, SERVICE_TYPES, TIPS, PARTNERS, CAT_SHORT, HOTLINE, catLabel, catIcon, getService,
} from '../data';
import { useApp, deviceStatus } from '../store';
import {
  Tap, IconBtn, IconBox, Card, SectionTitle, ServiceCard, Sheet, Btn, StatusChip, Media, Badge, ui, HScroll,
} from '../ui';

const POPULAR = ['vs-ml-1', 'vs-mg-tren', 'vs-mg-truoc', 'vs-quat-dh', 'vs-ml-am-tran', 'vs-tl-300'].map(getService);
const COMMIT_ICON = ['⏰', '🏅', '🤝', '😊'];

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
        <View style={[st.blob, { width: 220, height: 220, top: -90, right: -60 }]} />
        <View style={[st.blob, { width: 140, height: 140, top: 60, left: -60, opacity: 0.5 }]} />
        <View style={st.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.hello}>{firstName ? `Xin chào, ${firstName} 👋` : 'Xin chào 👋'}</Text>
            <Text style={st.brand}><Text style={{ color: C.gold }}>Thợ</Text> ĐMX</Text>
          </View>
          <IconBtn icon="🔔" dark badge={d.unread} onPress={() => nav.push('notifications')} label="Thông báo" />
          <IconBtn icon="🛒" dark badge={d.cartCount} onPress={() => nav.push('cart')} style={{ marginLeft: 10 }} label="Giỏ hàng" />
        </View>
        <Tap style={st.addr} onPress={() => nav.push(d.address ? 'addresses' : 'address-form')}>
          <Text style={{ fontSize: 14 }}>📍</Text>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={st.addrLabel}>Thợ đến tận nhà tại</Text>
            <Text style={st.addrText} numberOfLines={1}>{d.address ? d.address.full : 'Thêm địa chỉ của bạn'}</Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 20 }}>›</Text>
        </Tap>
        <Tap style={st.search} onPress={() => nav.push('search')}>
          <Text style={{ fontSize: 15 }}>🔍</Text>
          <Text style={st.searchText}>Tìm dịch vụ: vệ sinh máy lạnh, sạc gas…</Text>
        </Tap>
      </View>

      {/* ---------------- Quick stats ---------------- */}
      <View style={st.stats}>
        {[
          { icon: '⭐', value: s.points, label: 'Điểm thưởng', onPress: () => nav.push('rewards') },
          { icon: '📋', value: d.activeOrders.length, label: 'Đang xử lý', onPress: () => nav.activity('active') },
          { icon: '📺', value: s.devices.length, label: 'Thiết bị', onPress: () => nav.go('devices') },
        ].map((x, i) => (
          <Tap key={x.label} style={[st.stat, i > 0 && st.statBorder]} onPress={x.onPress}>
            <Text style={st.statValue}>{x.icon} {x.value}</Text>
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
                {active.status === 'quoted' ? '🧾 Có báo giá chờ bạn duyệt' : `📅 ${active.dateLabel} · ${active.slot}`}
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
              <View style={st.typeIcon}><Text style={{ fontSize: 22 }}>{t.icon}</Text></View>
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
                <View style={[st.catIcon, { backgroundColor: tone.bg }]}><Text style={{ fontSize: 24 }}>{c.icon}</Text></View>
                <Text style={st.catLabel} numberOfLines={1}>{CAT_SHORT[c.id]}</Text>
              </Tap>
            );
          })}
          <Tap style={st.cat} onPress={() => nav.push('search')}>
            <View style={[st.catIcon, { backgroundColor: '#EEF2F7' }]}><Text style={{ fontSize: 22 }}>🔎</Text></View>
            <Text style={st.catLabel}>Tìm thêm</Text>
          </Tap>
        </View>

        {/* ---------------- Nhắc lịch bảo dưỡng ---------------- */}
        <Card style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <IconBox icon="🗓️" size={38} bg={C.goldSoft} radius={12} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={st.cardTitle}>Nhắc lịch bảo dưỡng</Text>
              <Text style={ui.meta}>{s.devices.length ? `${d.dueDevices.length}/${s.devices.length} thiết bị cần chú ý` : 'Theo dõi thiết bị trong nhà'}</Text>
            </View>
            {s.devices.length ? <Tap onPress={() => nav.go('devices')}><Text style={ui.link}>Quản lý ›</Text></Tap> : null}
          </View>
          {s.devices.length === 0 ? (
            <View>
              <Text style={st.body}>Thêm máy lạnh, máy giặt, tủ lạnh… Thợ ĐMX sẽ tự tính kỳ bảo dưỡng tiếp theo và nhắc bạn.</Text>
              <Btn title="Thêm thiết bị" icon="＋" variant="soft" small style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={() => nav.push('device-form')} />
            </View>
          ) : d.dueDevices.length === 0 ? (
            <Text style={[st.body, { color: C.green, fontWeight: '600' }]}>✓ Tất cả thiết bị đều đang trong chu kỳ bảo dưỡng tốt.</Text>
          ) : d.dueDevices.slice(0, 2).map((dev) => {
            const stt = deviceStatus(dev);
            return (
              <View key={dev.id} style={st.dueRow}>
                <IconBox icon={catIcon(dev.category)} size={40} bg={toneOf(dev.category).bg} radius={12} />
                <View style={{ flex: 1 }}>
                  <Text style={st.dueName} numberOfLines={1}>{catLabel(dev.category)}{dev.brand ? ` · ${dev.brand}` : ''}</Text>
                  <Text style={[ui.meta, { color: stt.level === 'overdue' ? C.red : C.orange }]}>{stt.label}</Text>
                </View>
                <Btn title="Đặt lịch" small onPress={() => nav.services('bao-duong', dev.category, dev.id)} />
              </View>
            );
          })}
        </Card>

        {/* ---------------- Ưu đãi ---------------- */}
        <SectionTitle title="Ưu đãi cho bạn" action="Quyền lợi" onAction={() => nav.push('rewards')} />
      </View>
      <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {[
          { bg: C.navy, gradStyle: grad.navyCard, fg: '#fff', tag: 'MÃ THO20', title: 'Giảm 20.000đ', body: 'Cho đơn từ 150.000đ', icon: '🎟️', onPress: () => nav.push('rewards') },
          { bg: C.primary, gradStyle: grad.primaryBtn, fg: '#fff', tag: 'BÁN CHẠY', title: 'Vệ sinh máy lạnh 180K', body: 'Giảm 10% · Bảo hành 60 ngày', icon: '❄️', onPress: () => nav.push('detail', { id: 'vs-ml-1' }) },
          { bg: C.gold, gradStyle: grad.goldBtn, fg: C.navy, tag: 'TIẾT KIỆM', title: 'Bảo dưỡng trọn đời', body: 'Một lần đăng ký, thợ nhắc định kỳ', icon: '♾️', onPress: () => nav.services('tron-doi') },
        ].map((b) => (
          <Tap key={b.tag} style={[st.promo, { backgroundColor: b.bg }, b.gradStyle]} onPress={b.onPress}>
            <View style={[st.blob, { width: 130, height: 130, right: -30, top: -40, backgroundColor: 'rgba(255,255,255,0.14)' }]} />
            <Text style={st.promoIcon}>{b.icon}</Text>
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
        <SectionTitle title="Thợ ĐMX cam kết" />
        <View style={st.commitGrid}>
          {COMMITMENTS.map((c, i) => (
            <Tap key={c.title} style={st.commit} onPress={() => setCommit(c)}>
              <Text style={{ fontSize: 24 }}>{COMMIT_ICON[i]}</Text>
              <Text style={st.commitTitle}>{c.title}</Text>
              <Text style={st.commitSub} numberOfLines={2}>{c.sub}</Text>
            </Tap>
          ))}
        </View>

        {/* ---------------- Mẹo hay ---------------- */}
        <SectionTitle title="Mẹo hay cho nhà bạn" />
      </View>
      <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {TIPS.map((t) => (
          <Tap key={t.id} style={st.tip} onPress={() => setTip(t)}>
            <View style={[st.tipMedia, { backgroundColor: toneOf(t.category).bg }]}><Text style={{ fontSize: 34 }}>{t.icon}</Text></View>
            <View style={{ padding: 12 }}>
              <Text style={st.tipTitle} numberOfLines={2}>{t.title}</Text>
              <Text style={ui.meta}>👁 {t.views}</Text>
            </View>
          </Tap>
        ))}
      </HScroll>

      <View style={{ paddingHorizontal: 16 }}>
        {/* ---------------- Đối tác ---------------- */}
        <SectionTitle title="Đối tác kỹ thuật" />
        <View style={st.partners}>
          {PARTNERS.map((p) => <View key={p} style={st.partner}><Text style={st.partnerText}>{p}</Text></View>)}
        </View>

        {/* ---------------- Hotline ---------------- */}
        <Tap style={st.hotline} onPress={u.call}>
          <IconBox icon="🎧" size={46} bg="rgba(255,255,255,0.15)" radius={14} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Cần hỗ trợ? Gọi miễn phí</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 }}>{HOTLINE}</Text>
          </View>
          <Badge text="7:30 – 22:00" fg={C.navy} bg={C.gold} />
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
  headRow: { flexDirection: 'row', alignItems: 'center' },
  hello: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500' },
  brand: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
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
  hotline: { marginTop: 24, backgroundColor: C.navy, ...grad.navyCard, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', ...shadow.md },
  sheetSub: { fontSize: 14, color: C.primary, fontWeight: '700', marginBottom: 10 },
  sheetBody: { fontSize: 15, color: C.ink2, lineHeight: 23 },
});

