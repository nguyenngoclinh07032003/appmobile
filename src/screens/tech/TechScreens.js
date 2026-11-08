// ===========================================================================
// APP THỢ (Technician) — Hệ thống kỹ thuật viên Thợ HRMSS
//   Nhận từ hệ thống: việc được giao, địa chỉ & liên hệ khách, lịch làm việc, báo giá, thông báo
//   Gửi lên hệ thống: chẩn đoán, tiến độ, vật tư sử dụng, ảnh minh chứng, biên bản hoàn thành
// Dùng chung dữ liệu đơn hàng với app Khách hàng (src/store.js) nên hai bên cập nhật cho nhau.
// ===========================================================================
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, Linking } from 'react-native';
import { C, R, shadow, STATUS_META, toneOf, grad } from '../../theme';
import {
  getService, formatVND, catIcon, catLabel, TECH_ME, MATERIALS, DIAG_TAGS, TIME_SLOTS, TECH_STATUS_DESC, TECH_ORDER_STEPS, techStepIndexOf, HOTLINE,
  SAFETY_CHECKLIST_ITEMS,
} from '../../constants/data';
import {
  useApp, orderTotal, bookedValue, isActiveOrder, dateKeyOf, todayKey, fmtDateTime, timeAgo,
  TECH_POLICY, assessCancelAfterAccept, reputationTone, normalizeTechRep, slotStartTs, matchJobForTech,
} from '../../context';
import { getCheckInLocation } from '../../utils/geo';
import { validateVietnamesePhone, validateContactName } from '../../utils';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, PageHead, Segmented, Chip, Badge, Stars, Field, Sheet, Radio, Checkbox,
  EmptyState, StatusChip, Progress, Media, ListRow, Stepper, HScroll, ui,
} from '../../components';
import { pickImage, pickCamera } from '../../utils/media';
import { TrackingCard, ChatCard } from '../../components/order';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DECLINE_REASONS = ['Bận lịch khác', 'Ngoài khu vực phục vụ', 'Không đúng chuyên môn', 'Lý do khác'];
const RELEASE_REASONS = ['Khẩn cấp gia đình', 'Xe / phương tiện hỏng', 'Ốm đột xuất', 'Lịch trùng không xử lý kịp', 'Lý do khác'];
const SKILL_OPTIONS = ['Máy lạnh', 'Máy giặt', 'Tủ lạnh', 'Nóng lạnh', 'Hút mùi', 'Nạp gas', 'Sửa chữa'];
const sameDay = (ts, key) => {
  if (!ts) return false;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === key;
};
const slotHour = (slot) => parseInt(slot, 10) || 0;
const callPhone = (phone) => Linking.openURL(`tel:${(phone || '').replace(/\s/g, '')}`).catch(() => {});
const openMap = (addr) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`).catch(() => {});
// Tách bạch thu nhập của Thợ chuẩn HRMSS: 70% phí nhân công + 15% hoa hồng vật tư kho + 100% hoàn trả vật tư phát sinh mua ngoài
const techIncomeBreakdown = (o) => {
  if (!o || o.kind === 'warranty' || o.kind === 'followup') {
    return { laborGross: 0, partsGross: 0, laborShare: 0, partCommission: 0, customPartsReimbursement: 0, warehouseReturn: 0, total: 0 };
  }
  const parts = (o.quote?.lines || []).filter((l) => l.type === 'part');
  const customPartsReimbursement = parts
    .filter((l) => l.isCustom)
    .reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const warehousePartsGross = parts
    .filter((l) => !l.isCustom)
    .reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const partsGross = customPartsReimbursement + warehousePartsGross;

  const gross = o.quote?.approved ? o.quote.total : bookedValue(o);
  const laborGross = Math.max(0, gross - partsGross);
  const laborShare = Math.round(laborGross * 0.7);
  const partCommission = Math.round(warehousePartsGross * 0.15);
  const warehouseReturn = Math.max(0, warehousePartsGross - partCommission);
  return {
    laborGross,
    partsGross,
    laborShare,
    partCommission,
    customPartsReimbursement,
    warehouseReturn,
    total: laborShare + partCommission + customPartsReimbursement,
  };
};
const income = (o) => techIncomeBreakdown(o).total;

// Hành động chính tiếp theo cho từng trạng thái
function useNextAction() {
  const { a, nav } = useApp();
  return (o) => {
    switch (o.status) {
      case 'confirmed': {
        if (o.quote && !o.quote.approved) {
          return { label: 'Chờ khách đồng ý', icon: '⏳', variant: 'ghost', run: () => nav.push('tech-job', { code: o.code }) };
        }
        return { label: 'Bắt đầu di chuyển', icon: '🛵', run: () => a.startTravel(o.code) };
      };
      case 'onway': return {
        label: 'Check-in GPS',
        icon: '📍',
        run: async () => {
          const loc = await getCheckInLocation();
          a.arrive(o.code, loc);
        },
      };
      case 'diagnosing': return { label: 'Chẩn đoán & báo giá', icon: '🧾', run: () => nav.push('tech-job', { code: o.code }) };
      case 'quoted': return { label: 'Chờ khách duyệt', icon: '⏳', variant: 'ghost', run: () => nav.push('tech-job', { code: o.code }) };
      case 'repairing': return { label: 'Cập nhật công việc', icon: '🔧', run: () => nav.push('tech-job', { code: o.code }) };
      default: return null;
    }
  };
}

function MetaLine({ icon, text, last }) {
  return (
    <View style={[tx.metaLine, last && { marginBottom: 0 }]}>
      <View style={tx.metaIcon}><Text style={{ fontSize: 12 }}>{icon}</Text></View>
      <Text style={tx.info} numberOfLines={2}>{text}</Text>
    </View>
  );
}

// =========================================================== THẺ CÔNG VIỆC
function JobCard({ o, compact, onDecline, canAccept = true }) {
  const { s, a, nav } = useApp();
  const next = useNextAction()(o);
  const svc0 = getService(o.items[0]?.id);
  const meta = STATUS_META[o.status];
  const open = () => nav.push('tech-job', { code: o.code });
  const who = `${o.address?.gender === 'Nữ' ? 'Chị' : 'Anh'} ${o.address?.name} · ${o.address?.phone}`;
  const match = o.status === 'pending' ? matchJobForTech(o, s.techProfile || TECH_ME) : null;
  return (
    <Card style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }} onPress={open}>
      <View style={[tx.cardHead, { backgroundColor: meta.bg }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={[tx.statusDot, { backgroundColor: meta.fg }]} />
          <Text style={[tx.cardCode, { color: meta.fg }]} numberOfLines={1}>
            {o.kind === 'warranty' ? '🛡 ' : ''}{o.code}
          </Text>
        </View>
        <Text style={[tx.cardStatus, { color: meta.fg }]}>{o.status === 'pending' ? 'Được phân công' : meta.label}</Text>
      </View>
      <View style={{ padding: 14 }}>
        {o.status === 'pending' ? (
          <View style={{
            marginBottom: 10,
            padding: 10,
            borderRadius: R.sm,
            backgroundColor: '#F0F9FF',
            borderWidth: 1,
            borderColor: '#BAE6FD',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0369A1' }}>🏷️ ĐIỀU PHỐI TỪ HỆ THỐNG HRMSS</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.orange }}>⏳ Còn 14:30 tiếp nhận</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '600' }}>✓ Đúng chuyên môn: {catLabel(svc0?.category)}</Text>
              <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '600' }}>✓ Khu vực phụ trách: {o.address?.district || 'Gần vị trí thợ'}</Text>
              <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '600' }}>✓ Khung giờ: {o.slot} (Lịch trống)</Text>
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Media item={svc0} height={56} width={56} radius={16} />
          <View style={{ flex: 1 }}>
            <Text style={tx.name} numberOfLines={2}>{svc0?.name}</Text>
            {o.items.length > 1 ? <Text style={[ui.meta, { marginTop: 2 }]}>+{o.items.length - 1} dịch vụ khác</Text> : null}
          </View>
          <View style={tx.payBox}>
            <Text style={tx.payLabel}>{o.kind === 'warranty' ? 'Bảo hành' : 'Thu'}</Text>
            <Text style={[ui.price, { fontSize: 15, marginTop: 2 }]}>{o.kind === 'warranty' ? '0đ' : formatVND(orderTotal(o))}</Text>
          </View>
        </View>
        {(o.workerCode || match) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {o.workerCode ? <Badge text={`Chỉ định Thợ Now · ${o.workerCode}`} fg={C.navy} bg={C.goldSoft} /> : null}
            {match ? (
              <Badge
                text={match.skillMatch ? '✓ Đúng chuyên môn' : '⚠ Trái chuyên môn'}
                fg={match.skillMatch ? C.green : C.orange}
                bg={match.skillMatch ? C.greenSoft : C.orangeSoft}
              />
            ) : null}
            {match ? (
              <Badge
                text={match.areaMatch ? '📍 Trong khu vực' : '🗺️ Ngoài khu vực'}
                fg={match.areaMatch ? C.primary : C.muted}
                bg={match.areaMatch ? C.primarySoft : '#F1F5F9'}
              />
            ) : null}
          </View>
        ) : null}
        <View style={tx.metaBlock}>
          <MetaLine icon="📅" text={`${o.dateLabel} · ${o.slot}`} />
          {o.device ? (
            <MetaLine
              icon="📺"
              text={`${catLabel(o.device.category)}${o.device.brand ? ` · ${o.device.brand}` : ''}${o.device.room ? ` (${o.device.room})` : ''}`}
            />
          ) : null}
          <MetaLine icon="👤" text={who} last={compact} />
          {!compact ? <MetaLine icon="📍" text={o.address?.full || ''} last /> : null}
        </View>
        <View style={tx.cardFoot}>
          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
            <Btn title="Gọi" small variant="ghost" icon="📞" onPress={() => callPhone(o.address?.phone)} />
            {!compact ? <Btn title="Chỉ đường" small variant="ghost" icon="🗺️" onPress={() => openMap(o.address?.full)} /> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {compact ? (
              <Btn title="Chi tiết" small variant="soft" onPress={open} />
            ) : o.status === 'pending' ? (
              <>
                <Btn title="Từ chối ca" small variant="ghost" onPress={() => (onDecline ? onDecline(o) : null)} />
                <Btn title="Tiếp nhận ca" icon="🤝" small disabled={!canAccept} onPress={() => a.acceptJob(o.code)} />
              </>
            ) : next ? <Btn title={next.label} small variant={next.variant || 'soft'} onPress={next.run} /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

// =========================================================== TAB: VIỆC LÀM
export function TechJobsScreen() {
  const { s, a, d, nav } = useApp();
  const me = s.techProfile || TECH_ME;
  const [tab, setTab] = useState('new');
  const [newFilter, setNewFilter] = useState('all'); // 'all' | 'skill' | 'area'
  const [declineTarget, setDeclineTarget] = useState(null);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [reasonNote, setReasonNote] = useState('');
  const today = todayKey();
  const done = d.myJobs.filter((o) => o.status === 'done' || o.status === 'cancelled');
  const doneToday = d.myJobs.filter((o) => o.status === 'done' && sameDay(o.doneAt, today));
  const working = [...d.workingJobs].sort((x, y) => dateKeyOf(x).localeCompare(dateKeyOf(y)) || slotHour(x.slot) - slotHour(y.slot));
  const nextJob = working[0];
  const nextAct = useNextAction()(nextJob || { status: '' });
  const filteredNewJobs = d.newJobs.filter((o) => {
    if (newFilter === 'all') return true;
    const m = matchJobForTech(o, me);
    if (newFilter === 'skill') return m.skillMatch;
    if (newFilter === 'area') return m.areaMatch;
    return true;
  });
  const list = tab === 'new' ? filteredNewJobs : tab === 'working' ? working : done;
  const todayIncome = doneToday.reduce((sum, o) => sum + income(o), 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={tx.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={tx.avatar}><Text style={{ fontSize: 28 }}>👷</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={tx.hello}>Kỹ thuật viên HRMSS</Text>
              <Text style={tx.techName} numberOfLines={1}>{me.name}</Text>
              <Text style={tx.techSub}>{me.code} · ★ {me.rating || TECH_ME.rating} · Uy tín {d.techReputation}</Text>
            </View>
            <IconBtn icon="🔔" dark badge={d.techUnread} onPress={() => nav.go('tech-notifs')} label="Thông báo" />
          </View>
        </View>

        <View style={tx.stats}>
          {[
            { v: d.newJobs.length, l: 'Việc mới', onPress: () => setTab('new'), on: tab === 'new' },
            { v: d.workingJobs.length, l: 'Đang làm', onPress: () => setTab('working'), on: tab === 'working' },
            { v: doneToday.length, l: 'Xong hôm nay', onPress: () => setTab('done'), on: tab === 'done' },
            { v: todayIncome >= 1000 ? `${Math.round(todayIncome / 1000)}K` : '0', l: 'Thu hôm nay', onPress: () => nav.go('tech-account'), on: false },
          ].map((x, i) => (
            <Tap key={x.l} style={[tx.statItem, i > 0 && tx.statSplit, x.on && tx.statOn]} onPress={x.onPress}>
              <Text style={[tx.statV, x.on && { color: C.primary }]}>{x.v}</Text>
              <Text style={[tx.statL, x.on && { color: C.primary }]}>{x.l}</Text>
            </Tap>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {d.techLocked ? (
            <View style={[tx.offline, { marginTop: 14, backgroundColor: C.redSoft }]}>
              <Text style={{ color: C.red, fontWeight: '800' }}>🚫 Hạn chế nhận việc mới</Text>
              <Text style={{ color: C.red, marginTop: 4, lineHeight: 18 }}>{d.techLockReason}</Text>
              <Btn title="Xem uy tín & vi phạm" small variant="dangerSoft" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => nav.go('tech-account')} />
            </View>
          ) : null}
          {(() => {
            const soon = working.find((job) => {
              const start = slotStartTs(job);
              if (!start || !['confirmed', 'onway'].includes(job.status)) return false;
              const left = start - Date.now();
              return left > 0 && left <= 60 * 60 * 1000;
            });
            if (!soon) return null;
            const mins = Math.max(1, Math.ceil((slotStartTs(soon) - Date.now()) / 60000));
            return (
              <View style={[tx.offline, { marginTop: 14, backgroundColor: C.primarySoft, borderColor: '#BFDBFE' }]}>
                <Text style={{ color: C.primaryDark, fontWeight: '800' }}>⏰ Còn ~{mins} phút đến giờ hẹn · {soon.code}</Text>
                <Text style={{ color: C.primaryDark, marginTop: 4, lineHeight: 18 }}>Bấm “Đang đến” đúng giờ. Check-in muộn sẽ bị trừ uy tín và bồi thường khách.</Text>
                <Btn title="Mở việc sắp tới" small variant="primary" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => nav.push('tech-job', { code: soon.code })} />
              </View>
            );
          })()}
          {nextJob ? (
            <Card style={tx.nextCard} onPress={() => nav.push('tech-job', { code: nextJob.code })}>
              <View style={tx.nextAccent} />
              <View style={{ padding: 16, paddingLeft: 18 }}>
                <Text style={tx.nextEyebrow}>VIỆC TIẾP THEO</Text>
                <Text style={tx.nextTitle} numberOfLines={2}>{getService(nextJob.items[0]?.id)?.name}</Text>
                <Text style={tx.nextMeta} numberOfLines={1}>📅 {nextJob.dateLabel} · {nextJob.slot}</Text>
                <Text style={tx.nextMeta} numberOfLines={1}>📍 {nextJob.address?.full}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <Btn title="Gọi khách" icon="📞" small variant="primary" style={{ flex: 1 }} onPress={() => callPhone(nextJob.address?.phone)} />
                  <Btn
                    title={nextAct?.label || 'Xem chi tiết'}
                    icon={nextAct?.icon || '🔧'}
                    small
                    variant="soft"
                    style={{ flex: 1.15 }}
                    onPress={() => (nextAct ? nextAct.run() : nav.push('tech-job', { code: nextJob.code }))}
                  />
                </View>
              </View>
            </Card>
          ) : null}

          <Segmented
            style={{ marginTop: 16 }}
            value={tab}
            onChange={setTab}
            items={[
              { id: 'new', label: 'Việc mới', count: d.newJobs.length },
              { id: 'working', label: 'Đang làm', count: working.length },
              { id: 'done', label: 'Đã xong', count: done.length },
            ]}
          />
          {tab === 'new' && d.newJobs.length > 0 ? (
            <HScroll contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
              <Chip label={`Tất cả (${d.newJobs.length})`} on={newFilter === 'all'} onPress={() => setNewFilter('all')} />
              <Chip label="✓ Đúng chuyên môn" on={newFilter === 'skill'} onPress={() => setNewFilter('skill')} />
              <Chip label={`📍 Trong khu vực (${me.area || 'Của tôi'})`} on={newFilter === 'area'} onPress={() => setNewFilter('area')} />
            </HScroll>
          ) : null}
          <View style={{ marginTop: 14 }}>
            {tab === 'new' && d.techLocked ? (
              <View style={tx.offline}>
                <Text style={{ color: C.orange, fontWeight: '700' }}>
                  🚫 Đang bị hạn chế — không nhận việc mới.
                </Text>
                <Text style={{ color: C.orange, marginTop: 4, lineHeight: 18 }}>
                  {d.techLockReason}
                </Text>
              </View>
            ) : null}
            {list.length === 0 ? (
              <EmptyState
                icon={tab === 'new' ? '📭' : tab === 'working' ? '🧰' : '🗂️'}
                title={tab === 'new' ? 'Chưa có việc mới' : tab === 'working' ? 'Không có việc đang làm' : 'Chưa có việc hoàn thành'}
                body={
                  tab === 'new'
                    ? (d.techLocked
                      ? 'Uy tín đang bị hạn chế. Xem mục Tài khoản để biết lý do.'
                      : 'Khi hệ thống phân công việc mới trong khu vực của bạn, đơn sẽ hiện tại đây.')
                    : tab === 'working'
                      ? 'Nhận việc ở mục “Việc mới” để bắt đầu ca làm.'
                      : 'Các việc đã xong trong ngày và trước đó sẽ hiện tại đây.'
                }
                action={
                  tab === 'new' && d.techLocked ? 'Xem uy tín'
                    : tab === 'working' ? 'Xem việc mới'
                      : null
                }
                onAction={() => {
                  if (tab === 'new' && d.techLocked) nav.go('tech-account');
                  else if (tab === 'working') setTab('new');
                }}
              />
            ) : list.map((o) => (
              <JobCard
                key={o.code}
                o={o}
                canAccept={!d.techLocked}
                onDecline={(job) => { setReason(DECLINE_REASONS[0]); setReasonNote(''); setDeclineTarget(job); }}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={!!declineTarget}
        onClose={() => setDeclineTarget(null)}
        title="Lý do từ chối"
        footer={(
          <Btn
            title="Xác nhận từ chối"
            variant="danger"
            onPress={() => {
              if (!declineTarget) return;
              const note = reason === 'Lý do khác' ? reasonNote.trim() : '';
              if (reason === 'Lý do khác' && note.length < 3) return;
              a.declineJob(declineTarget.code, note ? `${reason}: ${note}` : reason);
              setDeclineTarget(null);
            }}
          />
        )}
      >
        <Text style={[ui.meta, { marginBottom: 8 }]}>Điều phối sẽ giao việc {declineTarget?.code} cho thợ khác.</Text>
        {DECLINE_REASONS.map((r) => (
          <Tap key={r} style={tx.option} onPress={() => setReason(r)}>
            <Radio on={reason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
        {reason === 'Lý do khác' ? (
          <Field label="Mô tả ngắn" value={reasonNote} onChangeText={setReasonNote} placeholder="VD: Xe hỏng, không kịp giờ hẹn…" style={{ marginTop: 8 }} />
        ) : null}
      </Sheet>
    </View>
  );
}

// =========================================================== TAB: LỊCH LÀM VIỆC
export function TechScheduleScreen() {
  const { d, nav } = useApp();
  const [day, setDay] = useState(0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    return { key: todayKey(i), label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : WEEKDAYS[dt.getDay()], dd: String(dt.getDate()).padStart(2, '0') };
  });
  // Lịch gồm việc của tôi (trừ đã huỷ) + việc mới chưa nhận
  const all = [...d.myJobs.filter((o) => o.status !== 'cancelled'), ...d.newJobs.filter((o) => !d.myJobs.includes(o))];
  const key = days[day].key;
  const dayJobs = all.filter((o) => dateKeyOf(o) === key);
  const others = dayJobs.filter((o) => !TIME_SLOTS.includes(o.slot));

  return (
    <View style={{ flex: 1 }}>
      <PageHead title="Lịch làm việc" sub={`${all.filter((o) => isActiveOrder(o)).length} việc đang chờ xử lý`} />
      <View style={{ backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {days.map((dd, i) => {
            const n = all.filter((o) => dateKeyOf(o) === dd.key).length;
            const on = i === day;
            return (
              <Tap key={dd.key} onPress={() => setDay(i)} style={[tx.day, on && tx.dayOn]}>
                <Text style={[tx.dayLabel, on && { color: 'rgba(255,255,255,0.8)' }]}>{dd.label}</Text>
                <Text style={[tx.dayNum, on && { color: '#fff' }]}>{dd.dd}</Text>
                <View style={[tx.dayDot, { backgroundColor: n ? (on ? C.gold : C.primary) : 'transparent' }]} />
              </Tap>
            );
          })}
        </HScroll>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View style={tx.daySummary}>
          <Text style={tx.sec}>{dayJobs.length} công việc · {days[day].label}</Text>
          <Text style={ui.meta}>
            {dayJobs.filter((o) => o.status === 'pending').length} chờ nhận · {dayJobs.filter((o) => isActiveOrder(o) && o.status !== 'pending').length} đang xử lý · {dayJobs.filter((o) => o.status === 'done').length} xong
          </Text>
        </View>
        {dayJobs.length === 0 ? (
          <EmptyState
            icon="📅"
            title="Không có lịch trong ngày"
            body="Ngày này chưa có việc. Kiểm tra Việc mới hoặc chọn ngày khác."
            action="Xem việc mới"
            onAction={() => nav.go('tech-jobs')}
          />
        ) : null}
        {others.length ? (
          <View style={tx.slotRow}>
            <Text style={tx.slotTime}>Linh hoạt</Text>
            <View style={{ flex: 1 }}>{others.map((o) => <JobCard key={o.code} o={o} compact />)}</View>
          </View>
        ) : null}
        {dayJobs.length > 0 ? TIME_SLOTS.map((sl) => {
          const jobs = dayJobs.filter((o) => o.slot === sl);
          return (
            <View key={sl} style={tx.slotRow}>
              <Text style={tx.slotTime}>{sl.replace(' - ', '\n')}</Text>
              <View style={{ flex: 1 }}>
                {jobs.length ? jobs.map((o) => <JobCard key={o.code} o={o} compact />) : <View style={tx.slotEmpty}><Text style={{ color: C.faint, fontSize: 13 }}>Trống</Text></View>}
              </View>
            </View>
          );
        }) : null}
        <Btn title="Về danh sách công việc" variant="soft" style={{ marginTop: 8 }} onPress={() => nav.go('tech-jobs')} />
      </ScrollView>
    </View>
  );
}

// =========================================================== TAB: THÔNG BÁO
export function TechNotifsScreen() {
  const { s, a, nav } = useApp();
  const [filter, setFilter] = useState('all');
  const list = s.techNotifs || [];
  const filtered = list.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'jobs') return /việc|đơn|báo giá|đánh giá|huỷ/i.test(`${n.title} ${n.body || ''}`);
    return true;
  });
  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Thông báo"
        sub="Việc mới, phản hồi của khách"
        onBack={() => {
          if (nav.stack.length > 0) {
            nav.back();
          } else {
            nav.go('tech-jobs');
          }
        }}
        right={(
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {list.some((n) => !n.read) ? (
              <Tap onPress={a.readAllTech}><Text style={ui.link}>Đọc hết</Text></Tap>
            ) : null}
          </View>
        )}
      />
      <View style={{ backgroundColor: '#fff', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {[
            { id: 'all', label: `Tất cả (${list.length})` },
            { id: 'unread', label: `Chưa đọc (${list.filter((n) => !n.read).length})` },
            { id: 'jobs', label: 'Việc & đơn' },
          ].map((f) => <Chip key={f.id} label={f.label} on={filter === f.id} onPress={() => setFilter(f.id)} />)}
        </HScroll>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="🔔"
            title={filter === 'unread' ? 'Đã đọc hết' : 'Chưa có thông báo'}
            body="Việc mới được giao, khách duyệt/từ chối báo giá, huỷ đơn hay đánh giá sẽ hiện ở đây."
            action="Về trang công việc"
            onAction={() => nav.go('tech-jobs')}
          />
        ) : filtered.map((n) => (
          <Tap key={n.id} style={[tx.notif, !n.read && tx.notifUnread]} onPress={() => { a.readTechNotif(n.id); nav.open(n.link); }}>
            <IconBox icon={n.icon || '🔔'} size={44} bg={n.read ? '#F1F4F9' : C.primarySoft} radius={14} />
            <View style={{ flex: 1 }}>
              <Text style={[tx.notifTitle, !n.read && { color: C.ink }]}>{n.title}</Text>
              {n.body ? <Text style={tx.notifBody}>{n.body}</Text> : null}
              <Text style={[ui.meta, { marginTop: 4 }]}>{timeAgo(n.at)}</Text>
            </View>
            {!n.read ? <View style={tx.dot} /> : null}
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}

// =========================================================== TAB: TÀI KHOẢN THỢ
export function TechAccountScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const me = s.techProfile || TECH_ME;
  const [showProfile, setShowProfile] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [name, setName] = useState(me.name || '');
  const [phone, setPhone] = useState(me.phone || '');
  const [area, setArea] = useState(me.area || TECH_ME.area);
  const [skills, setSkills] = useState(me.skills || TECH_ME.skills);
  const [showPayout, setShowPayout] = useState(false);
  const [payoutBank, setPayoutBank] = useState('MBBank');
  const [payoutAccNum, setPayoutAccNum] = useState(me.phone || '0988123456');
  const [payoutAccHolder, setPayoutAccHolder] = useState(me.name?.toUpperCase() || 'NGUYEN VAN THO');
  const [payoutAmount, setPayoutAmount] = useState('');
  const done = d.myJobs.filter((o) => o.status === 'done');
  const rated = done.filter((o) => o.rating);
  const avg = rated.length
    ? (rated.reduce((sum, o) => sum + o.rating.stars, 0) / rated.length).toFixed(1)
    : (me.rating != null ? Number(me.rating).toFixed(1) : '—');
  const accepted = d.myJobs.length;
  const declined = (d.declinedCodes || s.declined || []).length;
  const rate = accepted + declined ? Math.round((accepted / (accepted + declined)) * 100) : 100;
  const now = new Date();
  const monthDone = done.filter((o) => { const t = new Date(o.doneAt); return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear(); });
  const monthIncome = monthDone.reduce((sum, o) => sum + income(o), 0);
  const totalIncome = done.reduce((sum, o) => sum + income(o), 0);
  const completedCount = done.length;
  const payoutTotal = (s.payoutHistory || []).reduce((sum, p) => sum + p.amount, 0);
  const availableBalance = Math.max(0, totalIncome - payoutTotal);

  const openProfile = () => {
    setName(me.name || '');
    setPhone(me.phone || '');
    setArea(me.area || TECH_ME.area);
    setSkills(me.skills?.length ? [...me.skills] : [...TECH_ME.skills]);
    setShowProfile(true);
  };
  const toggleSkill = (sk) => {
    setSkills((prev) => (prev.includes(sk) ? prev.filter((x) => x !== sk) : [...prev, sk]));
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={[tx.header, { paddingBottom: 28 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[tx.avatar, { width: 68, height: 68, borderRadius: 24 }]}><Text style={{ fontSize: 34 }}>👷</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={tx.techName}>{me.name}</Text>
              <Text style={tx.techSub}>{me.code} · {me.phone}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Badge text="Kỹ thuật viên" fg={C.primary} bg="#fff" />
                {d.techLocked ? <Badge text="○ Hạn chế nhận việc" fg="#fff" bg={C.red} /> : null}
              </View>
            </View>
            <IconBtn icon="✏️" dark onPress={openProfile} label="Sửa hồ sơ" />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: -18, zIndex: 2 }}>
          {(() => {
            const rep = normalizeTechRep(me);
            const tone = reputationTone(rep.reputation);
            return (
              <Card style={{ marginBottom: 0, borderColor: '#E8EEF5', backgroundColor: '#fff', ...shadow.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '900', fontSize: 20, color: tone.fg }}>{rep.reputation}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }}>Uy tín thợ · {tone.label}</Text>
                    <Text style={[ui.meta, { marginTop: 3, lineHeight: 18 }]}>
                      {d.techLocked
                        ? d.techLockReason
                        : `Hủy sau nhận / đến muộn sẽ bị trừ điểm. Dưới ${TECH_POLICY.lockBelow} điểm sẽ bị hạn chế nhận việc.`}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  {[
                    { l: 'Hủy sau nhận', v: rep.cancelAfterAcceptCount },
                    { l: 'Trễ check-in', v: rep.lateCount },
                    { l: 'Tối đa việc', v: TECH_POLICY.maxActiveJobs },
                  ].map((x) => (
                    <View key={x.l} style={{ flex: 1, backgroundColor: '#F5F8FC', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{x.l}</Text>
                      <Text style={{ fontWeight: '900', color: C.ink, fontSize: 18, marginTop: 6 }}>{x.v}</Text>
                    </View>
                  ))}
                </View>
                {(d.techViolations || []).length ? (
                  <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', paddingTop: 10 }}>
                    <Text style={{ fontWeight: '700', color: C.ink2, marginBottom: 6 }}>Vi phạm gần đây</Text>
                    {d.techViolations.slice(0, 5).map((v) => (
                      <View key={v.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F0F3F8' }}>
                        <Text style={{ color: C.ink, fontWeight: '600', fontSize: 13 }}>{v.label || v.type} · −{v.points}</Text>
                        <Text style={ui.meta}>{v.code || ''} · {fmtDateTime(v.at)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })()}

          <Text style={[tx.h, { marginTop: 18, marginBottom: 10 }]}>Hiệu suất làm việc</Text>
          <View style={[tx.kpis, { marginHorizontal: 0, marginTop: 0 }]}>
            {[
              { i: '✅', v: completedCount, l: 'Việc hoàn thành' },
              { i: '⭐', v: avg, l: 'Đánh giá TB' },
              { i: '🤝', v: `${rate}%`, l: 'Tỉ lệ nhận việc' },
              { i: '💰', v: formatVND(monthIncome), l: 'Thu ước tính tháng' },
            ].map((k) => (
              <Tap key={k.l} style={tx.kpi} onPress={k.l.includes('Thu') ? () => setShowIncome(true) : undefined}>
                <Text style={{ fontSize: 20 }}>{k.i}</Text>
                <Text style={tx.kpiV} numberOfLines={1}>{k.v}</Text>
                <Text style={tx.kpiL}>{k.l}</Text>
              </Tap>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <Card style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[tx.h, { marginBottom: 0 }]}>Chuyên môn</Text>
              <Tap onPress={openProfile}><Text style={ui.link}>Sửa ›</Text></Tap>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{(me.skills || TECH_ME.skills).map((k) => <Chip key={k} label={k} />)}</View>
            <Text style={[ui.meta, { marginTop: 10 }]}>📍 Khu vực phục vụ: {me.area || TECH_ME.area}</Text>
          </Card>

          <Card style={{ marginTop: 12 }} onPress={() => setShowIncome(true)}>
            <Text style={tx.h}>Thu nhập ước tính</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={ui.meta}>Tháng này ({monthDone.length} việc)</Text>
                <Text style={[ui.price, { fontSize: 20 }]}>{formatVND(monthIncome)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={ui.meta}>Tổng đã hoàn thành</Text>
                <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }}>{formatVND(totalIncome)}</Text>
              </View>
            </View>
            <Text style={[ui.meta, { marginTop: 8 }]}>Số tham khảo theo giá trị đơn đã xong (~70%). Số thực chi trả theo đối soát công ty.</Text>
          </Card>

          {rated.length ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={tx.h}>Đánh giá gần đây</Text>
              {rated.slice(0, 5).map((o) => (
                <Tap key={o.code} style={tx.reviewRow} onPress={() => nav.push('tech-job', { code: o.code })}>
                  <Stars value={o.rating.stars} size={12} />
                  <Text style={{ color: C.ink2, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{o.rating.text || 'Không có nhận xét'}</Text>
                  <Text style={ui.meta}>{o.address?.name} · {o.code}</Text>
                </Tap>
              ))}
            </Card>
          ) : (
            <Card style={{ marginTop: 12 }}>
              <Text style={tx.h}>Đánh giá gần đây</Text>
              <Text style={ui.meta}>Chưa có đánh giá. Hoàn thành việc để khách chấm điểm.</Text>
            </Card>
          )}

          <View style={[tx.menu, { marginTop: 12 }]}>
            <ListRow icon="🧰" iconBg={C.primarySoft} label="Công việc của tôi" value={`${d.workingJobs.length} đang làm`} onPress={() => nav.go('tech-jobs')} />
            <ListRow icon="📅" iconBg={C.cyanSoft} label="Lịch làm việc" onPress={() => nav.go('tech-schedule')} />
            <ListRow icon="🔔" iconBg={C.goldSoft} label="Thông báo" value={d.techUnread ? `${d.techUnread} mới` : ''} onPress={() => nav.go('tech-notifs')} />
            <ListRow icon="👤" iconBg={C.purpleSoft} label="Hồ sơ kỹ thuật viên" sub={`${me.code} · ${me.phone}`} onPress={openProfile} />
            <ListRow icon="🔐" iconBg={C.orangeSoft} label="Đổi mật khẩu" onPress={() => { setCurPw(''); setNewPw(''); setNewPw2(''); setShowPw(true); }} />
            <ListRow icon="🎧" iconBg={C.greenSoft} label="Liên hệ điều phối" value={HOTLINE} onPress={u.call} last />
          </View>
          <Btn
            title="🎬 Nạp dữ liệu kịch bản Demo (Review với cô)"
            variant="soft"
            style={{ marginTop: 18 }}
            onPress={a.loadMockData}
          />
          <Btn
            title="Đăng xuất tài khoản Thợ"
            icon="🚪"
            variant="dangerSoft"
            style={{ marginTop: 10 }}
            onPress={() => u.confirm('Đăng xuất?', 'Bạn sẽ quay về màn đăng nhập. Đơn hàng vẫn giữ trên thiết bị.', a.logout, 'Đăng xuất', true)}
          />
        </View>
      </ScrollView>

      <Sheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        title="Hồ sơ kỹ thuật viên"
        footer={(
          <Btn
            title="Lưu hồ sơ"
            onPress={() => {
              const nameErr = validateContactName(name);
              if (nameErr) { u.alert('Họ tên không hợp lệ', nameErr, '✏️'); return; }
              const phoneErr = validateVietnamesePhone(phone);
              if (phoneErr) { u.alert('SĐT không hợp lệ', phoneErr, '📞'); return; }
              if (!skills.length) { u.alert('Thiếu chuyên môn', 'Chọn ít nhất một lĩnh vực bạn nhận việc.', '🧰'); return; }
              a.updateTechProfile({
                name: name.trim(),
                phone: String(phone).replace(/\D/g, ''),
                area: area.trim() || TECH_ME.area,
                skills,
              });
              setShowProfile(false);
            }}
          />
        )}
      >
        <Field label="Họ và tên" value={name} onChangeText={setName} placeholder="Tên thợ" />
        <Field label="Số điện thoại" value={phone} onChangeText={setPhone} placeholder="10 chữ số" keyboardType="phone-pad" />
        <Field label="Khu vực phục vụ" value={area} onChangeText={setArea} placeholder="Quận / huyện" />
        <Text style={[ui.fieldLabel, { marginTop: 12 }]}>Chuyên môn nhận việc</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {SKILL_OPTIONS.map((sk) => (
            <Chip key={sk} label={sk} on={skills.includes(sk)} onPress={() => toggleSkill(sk)} />
          ))}
        </View>
        <Text style={[ui.meta, { marginTop: 12 }]}>Mã thợ: {me.code}</Text>
      </Sheet>

      <Sheet visible={showIncome} onClose={() => setShowIncome(false)} title="Ví thu nhập & Chiết khấu HRMSS">
        <View style={tx.incomeHead}>
          <Text style={ui.meta}>Số dư ví khả dụng (Có thể rút ngay)</Text>
          <Text style={[ui.price, { fontSize: 24, color: C.green }]}>{formatVND(availableBalance)}</Text>
          <Text style={[ui.meta, { marginTop: 4 }]}>Thực nhận tháng này: {formatVND(monthIncome)} · Đã rút về ATM: {formatVND(payoutTotal)}</Text>
        </View>

        <Btn
          title="💳 Rút tiền về tài khoản ngân hàng"
          variant="primary"
          style={{ marginTop: 10 }}
          onPress={() => {
            setPayoutAmount(String(availableBalance > 0 ? availableBalance : 500000));
            setShowPayout(true);
          }}
        />

        <View style={{ padding: 10, borderRadius: R.md, backgroundColor: C.primarySoft, marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: C.primary, fontWeight: '700', lineHeight: 18 }}>
            💡 Chính sách HRMSS: Thợ hưởng 70% phí nhân công + 15% phụ cấp vật tư kho + 100% hoàn tiền linh kiện phát sinh mua ngoài (rút về ATM tức thì).
          </Text>
        </View>
        {monthDone.length === 0 ? (
          <Text style={[ui.meta, { marginTop: 12 }]}>Chưa hoàn thành việc nào trong tháng.</Text>
        ) : monthDone.map((o) => {
          const br = techIncomeBreakdown(o);
          return (
            <Tap key={o.code} style={tx.incomeRow} onPress={() => { setShowIncome(false); nav.push('tech-job', { code: o.code }); }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }} numberOfLines={1}>{getService(o.items[0]?.id)?.name}</Text>
                <Text style={ui.meta}>{o.code} · {fmtDateTime(o.doneAt)}</Text>
                <Text style={{ fontSize: 11, color: C.ink2, marginTop: 2 }}>
                  Công (70%): +{formatVND(br.laborShare)}
                  {br.partCommission > 0 ? ` · Hoa hồng VT kho (15%): +${formatVND(br.partCommission)}` : ''}
                  {br.customPartsReimbursement > 0 ? ` · Hoàn tiền linh kiện ngoài: +${formatVND(br.customPartsReimbursement)}` : ''}
                </Text>
              </View>
              <Text style={{ fontWeight: '800', color: C.green }}>+{formatVND(br.total)}</Text>
            </Tap>
          );
        })}
        <Text style={[ui.meta, { marginTop: 14 }]}>Tổng thực nhận mọi thời điểm: {formatVND(totalIncome)}</Text>
      </Sheet>

      <Sheet
        visible={showPayout}
        onClose={() => setShowPayout(false)}
        title="Rút tiền về tài khoản ngân hàng"
        footer={(
          <Btn
            title="Xác nhận rút tiền ngay"
            onPress={() => {
              const res = a.requestPayout({
                amount: payoutAmount,
                bankName: payoutBank,
                accountNumber: payoutAccNum,
                accountHolder: payoutAccHolder,
              });
              if (res) {
                setShowPayout(false);
                setShowIncome(false);
              }
            }}
          />
        )}
      >
        <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: '#166534', fontWeight: '700' }}>
            Số dư khả dụng: <Text style={{ fontSize: 16, fontWeight: '900', color: C.green }}>{formatVND(availableBalance)}</Text>
          </Text>
          <Text style={[ui.meta, { color: '#166534', marginTop: 2 }]}>
            Hạn mức rút: tối thiểu 50.000đ · Không thu phí giao dịch
          </Text>
        </View>

        <Text style={[ui.fieldLabel, { marginBottom: 6 }]}>Ngân hàng thụ hưởng</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {['MBBank', 'Vietcombank', 'Techcombank', 'VPBank', 'ACB', 'BIDV', 'MoMo'].map((b) => (
            <Chip key={b} label={b} on={payoutBank === b} onPress={() => setPayoutBank(b)} />
          ))}
        </View>

        <Field label="Số tài khoản ngân hàng" value={payoutAccNum} onChangeText={setPayoutAccNum} placeholder="Nhập số tài khoản" keyboardType="numeric" />
        <Field label="Tên chủ tài khoản (không dấu)" value={payoutAccHolder} onChangeText={setPayoutAccHolder} placeholder="VD: NGUYEN VAN A" />
        <Field
          label="Số tiền muốn rút (VNĐ)"
          value={payoutAmount}
          onChangeText={(t) => setPayoutAmount(t.replace(/[^0-9]/g, ''))}
          placeholder="Ví dụ: 500000"
          keyboardType="numeric"
        />
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {[200000, 500000, 1000000].map((v) => (
            <Tap
              key={v}
              style={{ flex: 1, paddingVertical: 6, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, alignItems: 'center', backgroundColor: '#F8FAFC' }}
              onPress={() => setPayoutAmount(String(v))}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink2 }}>{formatVND(v)}</Text>
            </Tap>
          ))}
          <Tap
            style={{ flex: 1, paddingVertical: 6, borderRadius: R.sm, borderWidth: 1, borderColor: C.primary, alignItems: 'center', backgroundColor: C.primarySoft }}
            onPress={() => setPayoutAmount(String(availableBalance > 0 ? availableBalance : 500000))}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>Tất cả</Text>
          </Tap>
        </View>

        {(s.payoutHistory || []).length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text style={[ui.fieldLabel, { marginBottom: 8 }]}>Lịch sử rút tiền gần đây</Text>
            {s.payoutHistory.slice(0, 3).map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#F1F5F9' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{p.bankName} · {p.accountNumber}</Text>
                  <Text style={ui.meta}>{fmtDateTime(p.at)}</Text>
                </View>
                <Text style={{ fontWeight: '800', color: C.green }}>-{formatVND(p.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Sheet>
      <Sheet
        visible={showPw}
        onClose={() => setShowPw(false)}
        title="Đổi mật khẩu"
        footer={(
          <Btn
            title="Cập nhật mật khẩu"
            onPress={() => {
              if (newPw !== newPw2) { u.alert('Không khớp', 'Mật khẩu mới nhập lại chưa khớp.', '🔐'); return; }
              const res = a.changePassword({ currentPassword: curPw, newPassword: newPw });
              if (!res.ok) { u.alert('Không đổi được', res.error, '🔐'); return; }
              setShowPw(false);
            }}
          />
        )}
      >
        <Field label="Mật khẩu hiện tại" value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="••••••" style={{ marginTop: -8 }} />
        <Field label="Mật khẩu mới" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="Ít nhất 6 ký tự" />
        <Field label="Nhập lại mật khẩu mới" value={newPw2} onChangeText={setNewPw2} secureTextEntry placeholder="Nhập lại" />
      </Sheet>
    </View>
  );
}

// =========================================================== CHI TIẾT CÔNG VIỆC
export function TechJobScreen({ params }) {
  const { s, a, d, nav, ui: u } = useApp();
  const o = s.orders.find((x) => x.code === params.code);
  const cats = useMemo(() => [...new Set((o?.items || []).map((it) => getService(it.id)?.category).filter(Boolean))], [o]);
  const [tags, setTags] = useState(() => (o?.quote?.symptoms ? o.quote.symptoms.split(',').map((x) => x.trim()).filter(Boolean) : []));
  const [diagnosis, setDiagnosis] = useState(() => o?.quote?.diagnosis || '');
  const [recommendation, setRecommendation] = useState(() => o?.quote?.recommendation || '');
  const [showCustomFee, setShowCustomFee] = useState(false);
  const [customFeeName, setCustomFeeName] = useState('');
  const [customFeePrice, setCustomFeePrice] = useState('');
  const [customFeeType, setCustomFeeType] = useState('labor'); // 'labor' | 'part'
  const [signature, setSignature] = useState(() => o?.report?.customerSignature || '');
  const [lines, setLines] = useState(() => {
    if (o?.quote?.lines?.length) {
      return o.quote.lines.map((l, idx) => ({ ...l, key: l.matId || l.key || `q_${idx}` }));
    }
    return (o?.items || []).map((it) => {
      const sv = getService(it.id);
      return { key: it.id, type: 'labor', name: sv?.name || 'Dịch vụ', qty: it.qty, price: o?.kind === 'warranty' ? 0 : sv?.price || 0 };
    });
  });
  const [showQR, setShowQR] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [matMode, setMatMode] = useState(null); // 'quote' | 'usage'
  const [showPreQuote, setShowPreQuote] = useState(false);
  const [matAll, setMatAll] = useState(false);
  const [percent, setPercent] = useState(50);
  const [progressNote, setProgressNote] = useState('');
  const [repairNote, setRepairNote] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [releaseReason, setReleaseReason] = useState(RELEASE_REASONS[0]);
  const [releaseNote, setReleaseNote] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [summary, setSummary] = useState('');
  const [paid, setPaid] = useState(true);
  const [forceDone, setForceDone] = useState(false);
  const [safetyChecks, setSafetyChecks] = useState(() => [...SAFETY_CHECKLIST_ITEMS]);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuReason, setFuReason] = useState('Cần kiểm tra lại sau khi chạy thử');
  const [fuRemain, setFuRemain] = useState('');
  const [fuSlot, setFuSlot] = useState(TIME_SLOTS[2] || '14h00 - 16h00');
  const [fuDayIdx, setFuDayIdx] = useState(1);
  const fuDays = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + i + 1); // từ ngày mai
    return {
      key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
      label: i === 0 ? 'Ngày mai' : WEEKDAYS[dt.getDay()],
      ddmm: `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`,
    };
  });

  if (!o) return <View style={{ flex: 1 }}><TopBar title="Không tìm thấy công việc" /></View>;
  const meta = STATUS_META[o.status];
  const step = techStepIndexOf(o.status);
  const next = nextActionFor(o, a, nav);
  const mine = o.tech?.code === (s.techProfile?.code || TECH_ME.code);
  const editable = mine || o.status === 'pending';
  const techDesc = TECH_STATUS_DESC[o.status] || '';
  const canRelease = mine && ['confirmed', 'onway', 'diagnosing', 'quoted', 'repairing'].includes(o.status);
  const releaseAssess = canRelease ? assessCancelAfterAccept(o) : null;

  // ---- báo giá ----
  const qTotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const booked = bookedValue(o);
  const diff = qTotal - booked;
  const mats = MATERIALS.filter((m) => matAll || m.category === 'all' || cats.includes(m.category));
  const addPart = (m) => {
    if (matMode === 'usage') { a.addMaterial(o.code, m); setMatMode(null); return; }
    setLines((p) => (p.some((l) => l.key === m.id) ? p.map((l) => (l.key === m.id ? { ...l, qty: l.qty + 1 } : l)) : [...p, { key: m.id, type: 'part', matId: m.id, name: m.name, unit: m.unit, qty: 1, price: m.price }]));
    setMatMode(null);
  };
  const handleAddCustomFee = () => {
    const name = customFeeName.trim();
    const priceNum = parseInt(String(customFeePrice).replace(/[^0-9]/g, ''), 10);
    if (!name) {
      u.alert('Thiếu nội dung', 'Vui lòng nhập tên hoặc nội dung chi phí phát sinh.', '⚠️');
      return;
    }
    if (!priceNum || priceNum <= 0) {
      u.alert('Giá không hợp lệ', 'Vui lòng nhập số tiền phát sinh lớn hơn 0đ.', '⚠️');
      return;
    }
    const newFeeLine = {
      key: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: customFeeType,
      name,
      price: priceNum,
      qty: 1,
      unit: customFeeType === 'labor' ? 'lần' : 'cái',
      isCustom: true,
    };
    setLines((prev) => [...prev, newFeeLine]);
    setCustomFeeName('');
    setCustomFeePrice('');
    setShowCustomFee(false);
    u.toast(`Đã thêm phát sinh: ${name} (+${formatVND(priceNum)})`, '✅');
  };
  const sendQuote = () => {
    const symptoms = tags.join(', ');
    const diag = diagnosis.trim();
    const reco = recommendation.trim();
    if (!symptoms && !diag) {
      u.alert('Thiếu chẩn đoán', 'Chọn triệu chứng hoặc nhập kết luận chẩn đoán trước khi gửi.', '🔍');
      return;
    }
    if (!reco) {
      u.alert('Thiếu đề xuất', 'Ghi đề xuất xử lý trước khi gửi báo giá.', '🧾');
      return;
    }
    const text = [symptoms, diag].filter(Boolean).join('. ');
    a.submitQuote(o.code, {
      diagnosis: text,
      symptoms,
      recommendation: reco,
      lines: lines.map(({ key, ...l }) => l),
    });
  };

  const evidence = o.evidence || [];
  const openComplete = () => {
    const names = o.items.map((it) => getService(it.id)?.name).filter(Boolean).join(', ');
    setSummary(`Đã hoàn thành: ${names}.${o.quote?.diagnosis ? ` Tình trạng: ${o.quote.diagnosis}.` : ''} Thiết bị hoạt động ổn định, đã dọn dẹp khu vực.`);
    setShowDone(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={o.kind === 'warranty' ? 'Việc bảo hành' : 'Chi tiết công việc'} sub={o.code} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Trạng thái */}
        <View style={[tx.hero, { backgroundColor: meta.bg }]}>
          <Text style={[tx.heroLabel, { color: meta.fg }]}>{meta.label}</Text>
          <Text style={[tx.heroDesc, { color: meta.fg }]}>{o.status === 'cancelled' ? (o.cancelReason || TECH_STATUS_DESC.cancelled) : techDesc}</Text>
          {o.status !== 'cancelled' ? (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
              {TECH_ORDER_STEPS.map((st, i) => <View key={st.key} style={[tx.stepBar, { backgroundColor: i <= step ? meta.fg : 'rgba(15,23,42,0.1)' }]} />)}
            </View>
          ) : null}
          {o.status !== 'cancelled' && step >= 0 ? <Text style={[ui.meta, { color: meta.fg, marginTop: 6 }]}>Bước {step + 1}/{TECH_ORDER_STEPS.length}: {TECH_ORDER_STEPS[step].label}</Text> : null}
        </View>
        {o.status === 'pending' && o.dispatchNote && (d.declinedCodes || s.declined || []).includes(o.code) ? (
          <View style={tx.offline}><Text style={{ color: C.orange, fontWeight: '700' }}>Bạn đã từ chối việc này. Vẫn có thể nhận lại nếu còn trống lịch.</Text></View>
        ) : null}
        {o.status === 'onway' ? <TrackingCard order={o} compact /> : null}
        {mine || o.tech ? <ChatCard order={o} role="tech" /> : null}

        {o.checkIn ? (
          <Card style={{ marginTop: 12, backgroundColor: C.primarySoft, borderColor: '#D6E4FF' }}>
            <Text style={tx.h}>📍 Nhật ký check-in GPS</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              {o.checkIn.label || 'Đã xác thực vị trí GPS'}
              {o.checkIn.at ? ` · ${fmtDateTime(o.checkIn.at)}` : ''}
            </Text>
            {o.checkIn.lat != null ? (
              <Text style={[ui.meta, { marginTop: 4 }]}>
                {Number(o.checkIn.lat).toFixed(5)}, {Number(o.checkIn.lng).toFixed(5)}
                {o.checkIn.accuracy != null ? ` · ±${o.checkIn.accuracy}m` : ''}
              </Text>
            ) : null}
            {o.lateCompensation ? (
              <Text style={[ui.meta, { color: C.orange, fontWeight: '700', marginTop: 6 }]}>
                Muộn {o.lateCompensation.minutesLate} phút · đã ghi nhận chính sách
              </Text>
            ) : o.arrivedAt ? (
              <Text style={[ui.meta, { color: C.green, fontWeight: '700', marginTop: 6 }]}>Đúng chính sách giờ hẹn</Text>
            ) : null}
          </Card>
        ) : null}

        {o.status === 'pending' ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: '#0369A1', fontSize: 13.5 }}>📋 CA ĐƯỢC HỆ THỐNG PHÂN CÔNG</Text>
              <Badge text="Hạn phản hồi 15p" fg={C.orange} bg={C.orangeSoft} />
            </View>
            <Text style={{ color: '#0C4A6E', fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              Hệ thống đã khớp chuyên môn {catLabel(o.items[0]?.id ? getService(o.items[0].id)?.category : '')} và khu vực {o.address?.district || 'của bạn'}. Vui lòng xác nhận tiếp nhận ca để đưa vào lịch trình làm việc.
            </Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ fontSize: 12, color: '#0284C7', fontWeight: '600' }}>✓ Đúng chuyên môn: {catLabel(o.items[0]?.id ? getService(o.items[0].id)?.category : '')}</Text>
              <Text style={{ fontSize: 12, color: '#0284C7', fontWeight: '600' }}>✓ Khu vực phụ trách: {o.address?.district || 'Gần bạn'}</Text>
              <Text style={{ fontSize: 12, color: '#0284C7', fontWeight: '600' }}>✓ Khung giờ hẹn: {o.dateLabel} · {o.slot}</Text>
            </View>
          </Card>
        ) : null}

        {/* Lịch sử trạng thái */}
        <Card style={{ marginTop: 12 }}>
          <Text style={tx.h}>Dòng thời gian</Text>
          {(o.history || []).map((h, i, arr) => {
            const hm = STATUS_META[h.status] || STATUS_META.pending;
            const last = i === arr.length - 1;
            return (
              <View key={`${h.status}-${h.at}-${i}`} style={tx.histRow}>
                <View style={tx.histRail}>
                  <View style={[tx.histDot, { backgroundColor: hm.fg }]} />
                  {!last ? <View style={tx.histLine} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
                  <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>{hm.label}</Text>
                  <Text style={[ui.meta, { marginTop: 2 }]}>{fmtDateTime(h.at)}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        {/* Khách hàng */}
        <Card style={{ marginTop: 12 }}>
          <Text style={tx.h}>Khách hàng</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBox icon="👤" size={46} bg={C.primarySoft} radius={15} />
            <View style={{ flex: 1 }}>
              <Text style={tx.name}>{o.address?.gender === 'Nữ' ? 'Chị' : 'Anh'} {o.address?.name}</Text>
              <Text style={ui.meta}>{o.address?.phone}</Text>
            </View>
            <IconBtn icon="📞" onPress={() => callPhone(o.address?.phone)} style={{ backgroundColor: C.greenSoft }} label="Gọi khách" />
          </View>
          <Tap style={tx.addrBox} onPress={() => openMap(o.address?.full)}>
            <Text style={{ fontSize: 16 }}>📍</Text>
            <Text style={{ flex: 1, color: C.ink, fontWeight: '600', lineHeight: 20 }}>{o.address?.full}</Text>
            <Text style={ui.link}>Chỉ đường</Text>
          </Tap>
          {o.qrVerified ? (
            <View style={{ marginTop: 10, padding: 10, borderRadius: R.md, backgroundColor: C.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16 }}>🔳</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.green, fontSize: 13 }}>Đã xác thực QR khách hàng (+1 điểm uy tín)</Text>
                <Text style={[ui.meta, { color: C.green }]}>Lúc {fmtDateTime(o.qrVerified.at)} · Mã {o.qrVerified.code}</Text>
              </View>
            </View>
          ) : mine && ['onway', 'diagnosing', 'quoted', 'repairing'].includes(o.status) ? (
            <Btn
              title="Quét / Xác thực QR khách hàng"
              icon="🔳"
              variant="soft"
              small
              style={{ marginTop: 10 }}
              onPress={() => { setQrInput(''); setShowQR(true); }}
            />
          ) : null}
        </Card>

        {/* Lịch hẹn + dịch vụ */}
        <Card style={{ marginTop: 12 }}>
          <Text style={tx.h}>Lịch hẹn & yêu cầu</Text>
          {(o.workerCode || o.customerTierLabel) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {o.workerCode ? <Badge text={`Chỉ định Thợ Now · ${o.workerCode}`} fg={C.navy} bg={C.goldSoft} /> : null}
              {o.customerTierLabel ? <Badge text={`👑 Khách hạng ${o.customerTierLabel} · BH ${o.warrantyDays || 60} ngày`} fg={C.primary} bg={C.primarySoft} /> : null}
            </View>
          ) : null}
          <Text style={tx.info}>📅 {o.dateLabel} · {o.slot}</Text>
          {o.device ? (
            <Text style={[tx.info, { marginTop: 6 }]}>
              📺 Thiết bị tại nhà: {catLabel(o.device.category)}{o.device.brand ? ` · ${o.device.brand}` : ''}{o.device.room ? ` (${o.device.room})` : ''}{o.device.serial ? ` · SN: ${o.device.serial}` : ''}
            </Text>
          ) : null}
          {o.siteCondition ? (
            <Text style={[tx.info, { marginTop: 6 }]}>
              🏢 Vị trí thi công: {o.siteCondition.label} ({o.siteCondition.note})
            </Text>
          ) : null}
          {o.note ? <Text style={[tx.info, { marginTop: 6 }]}>📝 “{o.note}”</Text> : null}
          {(o.attachments || []).length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {o.attachments.map((att) => (
                <View key={att.id} style={tx.thumb}>
                  {att.uri ? <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 22 }}>🖼️</Text>}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={[tx.info, { marginTop: 6 }]}>💳 {o.payment}</Text>
          <View style={{ marginTop: 10, gap: 8 }}>
            {o.items.map((it) => {
              const sv = getService(it.id);
              return (
                <View key={it.id} style={tx.svcRow}>
                  <Text style={{ fontSize: 20 }}>{sv?.icon}</Text>
                  <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }} numberOfLines={2}>{sv?.name}</Text>
                  <Text style={{ color: C.ink2, fontWeight: '800' }}>x{it.qty}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Báo giá trước khi xuất phát (Thợ chủ động thỏa thuận trước khi đi) */}
        {o.status === 'confirmed' && mine && !o.quote ? (
          <Card style={{ marginTop: 12, borderColor: '#D6E4FF', backgroundColor: '#F0F6FF' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>📋 Báo giá trước khi xuất phát</Text>
                <Text style={[ui.meta, { marginTop: 2, lineHeight: 18 }]}>
                  Thỏa thuận chi phí trên app trước. Khách đồng ý bạn mới di chuyển. Khách từ chối huỷ miễn phí.
                </Text>
              </View>
              <Btn
                title={showPreQuote ? 'Đóng lại' : 'Lập báo giá'}
                variant={showPreQuote ? 'ghost' : 'soft'}
                small
                onPress={() => setShowPreQuote((p) => !p)}
              />
            </View>
          </Card>
        ) : null}

        {/* ===== Chẩn đoán & báo giá ===== */}
        {(o.status === 'diagnosing' || (o.status === 'confirmed' && showPreQuote)) && mine ? (
          <>
            {o.quote?.revisionRequested ? (
              <Card style={{ marginTop: 12, backgroundColor: '#FFFBEB', borderColor: '#F5D77A' }}>
                <Text style={[tx.h, { color: C.goldInk, marginBottom: 4 }]}>🔄 Khách yêu cầu điều chỉnh báo giá</Text>
                <Text style={{ color: C.goldInk, lineHeight: 20 }}>
                  Lý do: <Text style={{ fontWeight: '800' }}>{o.quote.rejectReason || 'Cần trao đổi lại phương án / chi phí'}</Text>
                </Text>
                <Text style={[ui.meta, { color: C.goldInk, marginTop: 4 }]}>
                  Hãy điều chỉnh lại vật tư / phương án bên dưới và gửi lại báo giá mới cho khách.
                </Text>
              </Card>
            ) : null}
            <Card style={{ marginTop: 12 }}>
              <Text style={tx.h}>🔍 Triệu chứng thiết bị</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[...cats.flatMap((c) => DIAG_TAGS[c] || []), ...DIAG_TAGS.all].map((t) => (
                  <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))} />
                ))}
              </View>
              <Field label="Kết luận chẩn đoán" multiline value={diagnosis} onChangeText={setDiagnosis} placeholder="Nguyên nhân / tình trạng thực tế…" />
              <Field label="Đề xuất xử lý" multiline value={recommendation} onChangeText={setRecommendation} placeholder="VD: Vệ sinh dàn lạnh + kiểm tra gas…" />
              <Text style={[tx.fl, { marginTop: 8 }]}>Ảnh minh chứng chẩn đoán</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {evidence.filter((e) => e.stage === 'diagnosis').map((e) => (
                  <View key={e.id} style={tx.thumb}>
                    {e.uri ? <Image source={{ uri: e.uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 26 }}>🖼️</Text>}
                    <Tap style={tx.thumbX} onPress={() => a.removeEvidence(o.code, e.id)}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text></Tap>
                  </View>
                ))}
                <Tap
                  style={[tx.thumb, tx.thumbAdd]}
                  onPress={async () => {
                    let uri = await pickCamera();
                    if (uri === null) uri = await pickImage();
                    if (uri == null) {
                      if (uri === null) u.alert('Chưa hỗ trợ camera', 'Trên web/mobile browser hãy cho phép camera hoặc chọn ảnh thư viện.', '📷');
                      return;
                    }
                    a.addEvidence(o.code, { uri, stage: 'diagnosis', note: 'Minh chứng chẩn đoán' });
                  }}
                >
                  <Text style={{ fontSize: 22, color: C.primary }}>＋</Text>
                  <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700' }}>Thêm ảnh</Text>
                </Tap>
              </View>
            </Card>
            <Card style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={tx.h}>🧾 Báo giá</Text>
                <Badge
                  text={diff > 0 ? `+${formatVND(diff)} phát sinh` : 'Đúng giá gốc'}
                  fg={diff > 0 ? C.orange : C.green}
                  bg={diff > 0 ? C.orangeSoft : C.greenSoft}
                />
              </View>
              {lines.map((l) => (
                <View key={l.key} style={tx.lineRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={2}>{l.type === 'part' ? '🔩 ' : '🛠 '}{l.name}</Text>
                      {l.isCustom ? <Badge text="Phát sinh" fg={C.orange} bg={C.orangeSoft} /> : null}
                    </View>
                    <Text style={ui.meta}>{formatVND(l.price)}{l.unit ? ` / ${l.unit}` : ''}</Text>
                  </View>
                  {l.type === 'part' || l.isCustom ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Stepper value={l.qty} onChange={(q) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
                      <Tap onPress={() => setLines((p) => p.filter((x) => x.key !== l.key))} hitSlop={8} style={{ padding: 4 }}>
                        <Text style={{ color: C.red, fontSize: 13, fontWeight: '700' }}>✕</Text>
                      </Tap>
                    </View>
                  ) : <Text style={{ color: C.ink2, fontWeight: '800' }}>x{l.qty}</Text>}
                </View>
              ))}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Tap style={[tx.addLine, { flex: 1, marginTop: 0 }]} onPress={() => setMatMode('quote')}>
                  <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>＋ Vật tư kho ({mats.length})</Text>
                </Tap>
                <Tap
                  style={[
                    tx.addLine,
                    { flex: 1.15, marginTop: 0, borderColor: '#F59E0B', backgroundColor: showCustomFee ? '#FEF3C7' : '#FFFBEB' },
                  ]}
                  onPress={() => setShowCustomFee((v) => !v)}
                >
                  <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 13 }}>＋ Nhập phí phát sinh</Text>
                </Tap>
              </View>

              {/* Form nhập chi phí phát sinh */}
              {showCustomFee ? (
                <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5 }}>📝 Nhập chi phí phát sinh thực tế</Text>
                    <Tap onPress={() => setShowCustomFee(false)} hitSlop={8}><Text style={{ color: C.muted, fontWeight: '700' }}>Đóng</Text></Tap>
                  </View>

                  {/* Chọn loại: Công thợ phát sinh hay Vật tư ngoài */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <Tap
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        borderRadius: R.sm,
                        borderWidth: 1,
                        borderColor: customFeeType === 'labor' ? C.primary : '#E2E8F0',
                        backgroundColor: customFeeType === 'labor' ? C.primarySoft : '#fff',
                        alignItems: 'center',
                      }}
                      onPress={() => setCustomFeeType('labor')}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: customFeeType === 'labor' ? C.primary : C.muted }}>🛠 Công phát sinh</Text>
                    </Tap>
                    <Tap
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        borderRadius: R.sm,
                        borderWidth: 1,
                        borderColor: customFeeType === 'part' ? C.primary : '#E2E8F0',
                        backgroundColor: customFeeType === 'part' ? C.primarySoft : '#fff',
                        alignItems: 'center',
                      }}
                      onPress={() => setCustomFeeType('part')}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: customFeeType === 'part' ? C.primary : C.muted }}>🔩 Vật tư ngoài</Text>
                    </Tap>
                  </View>

                  <Field
                    label="Nội dung / Tên chi phí phát sinh"
                    placeholder={customFeeType === 'labor' ? 'Ví dụ: Hàn vá ống đồng lổ mọt, Gia cố bas treo...' : 'Ví dụ: Dây đồng Thái Lan 2m, Cầu dao phụ Panasonic...'}
                    value={customFeeName}
                    onChangeText={setCustomFeeName}
                  />

                  <View style={{ marginTop: 8 }}>
                    <Field
                      label="Số tiền phát sinh (VNĐ)"
                      placeholder="Ví dụ: 150000"
                      value={customFeePrice}
                      onChangeText={(t) => setCustomFeePrice(t.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Btn title="Hủy" variant="ghost" small style={{ flex: 1 }} onPress={() => { setShowCustomFee(false); setCustomFeeName(''); setCustomFeePrice(''); }} />
                    <Btn title="Thêm vào báo giá" small style={{ flex: 1.6 }} onPress={handleAddCustomFee} />
                  </View>
                </View>
              ) : null}

              <View style={tx.totalRow}><Text style={{ color: C.muted }}>Giá khách đã đặt</Text><Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(booked)}</Text></View>
              <View style={tx.totalRow}><Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>Tổng báo giá</Text><Text style={[ui.price, { fontSize: 20 }]}>{formatVND(qTotal)}</Text></View>
              <View style={[tx.note, { backgroundColor: diff > 0 ? C.goldSoft : C.greenSoft }]}>
                <Text style={{ color: diff > 0 ? C.goldInk : C.green, fontWeight: '700', lineHeight: 19 }}>
                  {diff > 0 ? `Phát sinh ${formatVND(diff)} → khách cần duyệt báo giá trên app trước khi làm.` : 'Không phát sinh chi phí → có thể bắt đầu làm ngay.'}
                </Text>
              </View>
            </Card>
          </>
        ) : null}

        {/* ===== Báo giá đã gửi ===== */}
        {o.quote && !(o.status === 'diagnosing' && o.quote.revisionRequested) ? (
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={tx.h}>🧾 Chẩn đoán & báo giá</Text>
              <Badge text={o.quote.approved ? 'Đã duyệt' : o.status === 'quoted' ? 'Chờ khách duyệt' : 'Bị từ chối'} fg={o.quote.approved ? C.green : o.status === 'quoted' ? C.goldInk : C.red} bg={o.quote.approved ? C.greenSoft : o.status === 'quoted' ? C.goldSoft : C.redSoft} />
            </View>
            <Text style={[tx.info, { marginBottom: 6 }]}>{o.quote.diagnosis}</Text>
            {o.quote.lines.map((l, i) => (
              <View key={`${l.name}-${i}`} style={tx.qRow}>
                <Text style={{ flex: 1, color: C.ink2 }} numberOfLines={1}>{l.type === 'part' ? '🔩' : '🛠'} {l.name} x{l.qty}</Text>
                <Text style={{ color: C.ink, fontWeight: '700' }}>{formatVND(l.price * l.qty)}</Text>
              </View>
            ))}
            <View style={tx.totalRow}><Text style={{ fontWeight: '800', color: C.ink }}>Tổng</Text><Text style={[ui.price, { fontSize: 17 }]}>{formatVND(o.quote.total)}</Text></View>
            {o.quote.rejectReason ? <Text style={[ui.meta, { color: C.red }]}>Lý do khách từ chối: {o.quote.rejectReason}</Text> : null}
            {o.status === 'quoted' && mine ? (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={ui.meta}>
                  Đã gửi {fmtDateTime(o.quote.at)}
                  {o.quote.remindedAt ? ` · Nhắc lần cuối ${fmtDateTime(o.quote.remindedAt)}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn title="Sửa báo giá / Phát sinh" icon="✏️" variant="outline" small style={{ flex: 1.15 }} onPress={() => a.reopenQuote(o.code)} />
                  <Btn title="Nhắc khách duyệt" icon="📨" variant="soft" small style={{ flex: 1 }} onPress={() => a.remindQuote(o.code)} />
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Cảnh báo / Tùy chọn phát sinh trong khi đang sửa */}
        {o.status === 'repairing' && mine ? (
          <Card style={{ marginTop: 12, backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontWeight: '800', color: C.goldInk, fontSize: 13.5 }}>⚠️ Phát sinh hư hỏng mới trong lúc sửa?</Text>
                <Text style={[ui.meta, { color: C.goldInk, marginTop: 2, lineHeight: 18 }]}>
                  Nếu cần thay thêm linh kiện hoặc tăng chi phí, mở lại báo giá để khách phê duyệt minh bạch.
                </Text>
              </View>
              <Btn title="Thêm phát sinh" variant="soft" small onPress={() => a.reopenQuote(o.code)} />
            </View>
          </Card>
        ) : null}

        {/* ===== Tiến độ ===== */}
        {(o.status === 'repairing' && mine) || (o.progress || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={tx.h}>📈 Tiến độ</Text>
            {(o.progress || []).map((p) => (
              <View key={p.id} style={tx.progRow}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '800', color: C.purple }}>{p.percent}%</Text>
                  <Text style={ui.meta}>{fmtDateTime(p.at)}</Text>
                </View>
                <Progress value={p.percent / 100} color={C.purple} style={{ marginTop: 6 }} />
                {p.note ? <Text style={{ color: C.ink2, marginTop: 6 }}>{p.note}</Text> : null}
              </View>
            ))}
            {o.status === 'repairing' && mine ? (
              <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[25, 50, 75, 100].map((v) => <Chip key={v} label={`${v}%`} on={percent === v} onPress={() => setPercent(v)} style={{ flex: 1, justifyContent: 'center' }} />)}
                </View>
                <Field value={progressNote} onChangeText={setProgressNote} placeholder="VD: Đã vệ sinh xong dàn lạnh" style={{ marginTop: 10 }} />
                <Btn title="Cập nhật tiến độ" variant="soft" small style={{ marginTop: 10 }} onPress={() => { a.addProgress(o.code, { note: progressNote.trim(), percent }); setProgressNote(''); }} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Nhật ký ghi chú sửa chữa */}
        {(o.status === 'repairing' && mine) || (o.repairNotes || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={tx.h}>📝 Ghi chú sửa chữa</Text>
            {(o.repairNotes || []).map((n) => (
              <View key={n.id} style={tx.progRow}>
                <Text style={{ color: C.ink, fontWeight: '600', lineHeight: 20 }}>{n.text}</Text>
                <Text style={ui.meta}>{fmtDateTime(n.at)}</Text>
              </View>
            ))}
            {o.status === 'repairing' && mine ? (
              <View style={{ marginTop: 6 }}>
                <Field value={repairNote} onChangeText={setRepairNote} placeholder="Công việc đã làm / phát hiện thêm…" multiline />
                <Btn title="Lưu ghi chú" variant="soft" small style={{ marginTop: 10 }} onPress={() => { a.addRepairNote(o.code, repairNote); setRepairNote(''); }} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* ===== Vật tư sử dụng ===== */}
        {(o.status === 'repairing' && mine) || (o.materials || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={tx.h}>🔩 Vật tư đã sử dụng</Text>
            <Text style={[ui.meta, { marginTop: -2, marginBottom: 6 }]}>Ghi nhận để đối soát kho. Chi phí tính theo báo giá đã duyệt.</Text>
            {(o.materials || []).length === 0 ? <Text style={ui.meta}>Chưa ghi nhận vật tư.</Text> : (o.materials || []).map((m) => (
              <View key={m.id} style={tx.lineRow}>
                <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }} numberOfLines={1}>{m.name}</Text>
                {o.status === 'repairing' && mine ? (
                  <>
                    <Stepper value={m.qty} onChange={(q) => a.setMaterialQty(o.code, m.id, q)} />
                    <Tap onPress={() => a.removeMaterial(o.code, m.id)} hitSlop={6}><Text style={{ color: C.faint, marginLeft: 8 }}>✕</Text></Tap>
                  </>
                ) : <Text style={{ color: C.ink2, fontWeight: '700' }}>{m.qty} {m.unit}</Text>}
              </View>
            ))}
            {o.status === 'repairing' && mine ? <Tap style={tx.addLine} onPress={() => setMatMode('usage')}><Text style={{ color: C.primary, fontWeight: '700' }}>＋ Ghi nhận vật tư</Text></Tap> : null}
          </Card>
        ) : null}

        {/* ===== Ảnh minh chứng ===== */}
        {(o.status === 'repairing' && mine) || evidence.length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={tx.h}>📷 Ảnh minh chứng</Text>
            {[{ id: 'before', label: 'Trước khi làm' }, { id: 'after', label: 'Sau khi làm' }].map((g) => (
              <View key={g.id} style={{ marginTop: 6 }}>
                <Text style={tx.fl}>{g.label}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {evidence.filter((e) => e.stage === g.id).map((e) => (
                    <View key={e.id} style={tx.thumb}>
                      {e.uri ? <Image source={{ uri: e.uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 26 }}>🖼️</Text>}
                      {o.status === 'repairing' && mine ? (
                        <Tap style={tx.thumbX} onPress={() => a.removeEvidence(o.code, e.id)}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text></Tap>
                      ) : null}
                    </View>
                  ))}
                  {o.status === 'repairing' && mine ? (
                    <Tap
                      style={[tx.thumb, tx.thumbAdd]}
                      onPress={async () => {
                        let uri = await pickCamera();
                        if (uri === null) uri = await pickImage();
                        if (uri == null) {
                          if (uri === null) {
                            u.alert('Chưa hỗ trợ camera', 'Trên web/mobile hãy cho phép camera hoặc chọn ảnh thư viện.', '📷');
                          }
                          return;
                        }
                        a.addEvidence(o.code, { uri, stage: g.id });
                      }}
                    >
                      <Text style={{ fontSize: 22, color: C.primary }}>＋</Text>
                      <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700' }}>Thêm ảnh</Text>
                    </Tap>
                  ) : null}
                </View>
              </View>
            ))}
            {o.status === 'repairing' && mine ? <Text style={[ui.meta, { marginTop: 8 }]}>Chụp hoặc chọn ảnh thật từ thiết bị — dùng cho bảo hành và đối soát.</Text> : null}
          </Card>
        ) : null}

        {/* ===== Biên bản hoàn thành ===== */}
        {o.report ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F3FBF7', borderColor: '#CDEFDD' }}>
            <Text style={tx.h}>✅ Biên bản hoàn thành</Text>
            <Text style={{ color: C.ink2, lineHeight: 21 }}>{o.report.summary}</Text>
            <Text style={[ui.meta, { marginTop: 8 }]}>
              {fmtDateTime(o.report.at)} · {o.report.paid
                ? `Đã thu ${formatVND(orderTotal(o))}${o.report.paidBy === 'customer' ? ' (khách xác nhận)' : ''}`
                : 'Chưa thu tiền / chờ khách xác nhận'}
            </Text>
            {o.report.paid && o.report.paidAt ? (
              <Text style={[ui.meta, { marginTop: 4, color: C.green }]}>Xác nhận lúc {fmtDateTime(o.report.paidAt)}</Text>
            ) : null}
          </Card>
        ) : null}
        {o.rating ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={tx.h}>Khách đánh giá</Text>
            <Stars value={o.rating.stars} size={18} />
            {o.rating.text ? <Text style={{ color: C.ink2, marginTop: 6 }}>{o.rating.text}</Text> : null}
          </Card>
        ) : null}

        {/* Đặt lịch tái khám sau khi hoàn thành */}
        {o.status === 'done' && mine && o.kind !== 'followup' ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={tx.h}>🔄 Tái khám / Follow-up</Text>
            {o.followUpCreated ? (
              <Text style={ui.meta}>Đã tạo lịch tái khám {o.followUpCreated}.</Text>
            ) : (
              <>
                <Text style={[ui.meta, { marginBottom: 10 }]}>Nếu còn hạng mục cần kiểm tra lại, tạo lịch tái khám cho khách.</Text>
                <Btn title="Tạo lịch tái khám" icon="🔄" variant="soft" onPress={() => setShowFollowUp(true)} />
              </>
            )}
          </Card>
        ) : null}
        {o.status === 'cancelled' ? (
          <Card style={{ marginTop: 12, backgroundColor: (o.inspectionFee || 0) > 0 ? '#FEF3C7' : '#F1F5F9', borderColor: (o.inspectionFee || 0) > 0 ? '#F5D77A' : C.line }}>
            <Text style={[tx.h, { color: (o.inspectionFee || 0) > 0 ? '#92400E' : C.ink }]}>
              {(o.inspectionFee || 0) > 0 ? `💰 Phí kiểm tra tại nhà: ${formatVND(o.inspectionFee)}` : 'Đơn huỷ không thu phí (0đ)'}
            </Text>
            <Text style={{ color: (o.inspectionFee || 0) > 0 ? '#92400E' : C.ink2, lineHeight: 20 }}>
              {(o.inspectionFee || 0) > 0
                ? `Khách huỷ sau khi thợ đã tới kiểm tra thiết bị trực tiếp tại nhà. Khách thanh toán ${formatVND(o.inspectionFee)} phí kiểm tra cho thợ.`
                : 'Chính sách HRMSS miễn phí 100% kiểm tra tại nhà khi khách từ chối sửa chữa (0đ).'}
            </Text>
          </Card>
        ) : null}

        {o.kind === 'followup' && o.followUp ? (
          <Card style={{ marginTop: 12, backgroundColor: C.cyanSoft, borderColor: '#B6E4F0' }}>
            <Text style={tx.h}>Tái khám của {o.followUp.of}</Text>
            <Text style={tx.info}>Lý do: {o.followUp.reason}</Text>
            {o.followUp.remaining ? <Text style={[tx.info, { marginTop: 4 }]}>Công việc còn lại: {o.followUp.remaining}</Text> : null}
          </Card>
        ) : null}
      </ScrollView>

      {/* ===== Thanh hành động ===== */}
      {o.status === 'pending' ? (
        <View style={tx.dock}>
          <Btn title="Từ chối ca" variant="ghost" style={{ flex: 1 }} onPress={() => { setReason(DECLINE_REASONS[0]); setReasonNote(''); setShowDecline(true); }} />
          <Btn title="Tiếp nhận ca" icon="🤝" style={{ flex: 2 }} disabled={d.techLocked} onPress={() => a.acceptJob(o.code)} />
        </View>
      ) : null}
      {o.status === 'quoted' && mine ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          <View style={{ flex: 1.1 }}>
            <Text style={ui.meta}>Chờ khách duyệt</Text>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>{formatVND(o.quote?.total || 0)}</Text>
          </View>
          <Btn title="Nhắc" icon="📨" variant="soft" style={{ flex: 1 }} onPress={() => a.remindQuote(o.code)} />
        </View>
      ) : null}
      {mine && ['confirmed', 'onway'].includes(o.status) ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          {o.status === 'confirmed' && showPreQuote ? (
            <Btn title="Gửi báo giá trước khi đi" icon="🧾" style={{ flex: 2 }} onPress={sendQuote} />
          ) : (
            <Btn title={next.label} icon={next.icon} variant={next.variant || 'primary'} style={{ flex: 2 }} onPress={next.run} />
          )}
        </View>
      ) : null}
      {mine && o.status === 'diagnosing' ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }}>
          <Tap onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }}>
            <Text style={{ color: C.red, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>Không thể tiếp tục? Trả việc (phạt nặng)</Text>
          </Tap>
        </View>
      ) : null}
      {mine && o.status === 'diagnosing' ? (
        <View style={tx.dock}>
          <View style={{ flex: 1 }}>
            <Text style={ui.meta}>Tổng báo giá</Text>
            <Text style={[ui.price, { fontSize: 18 }]}>{formatVND(qTotal)}</Text>
          </View>
          <Btn title={diff > 0 ? 'Gửi báo giá cho khách' : 'Xác nhận & bắt đầu'} style={{ flex: 2 }} onPress={sendQuote} />
        </View>
      ) : null}
      {mine && o.status === 'repairing' ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          <Btn title="Hoàn thành" icon="✅" style={{ flex: 2 }} onPress={openComplete} />
        </View>
      ) : null}
      {!editable && o.status !== 'done' && o.status !== 'cancelled' ? (
        <View style={tx.dock}><Text style={[ui.meta, { flex: 1, textAlign: 'center' }]}>Việc này do thợ khác phụ trách.</Text></View>
      ) : null}

      {/* ===== Sheets ===== */}
      <Sheet
        visible={showQR}
        onClose={() => setShowQR(false)}
        title="Xác thực QR khách hàng"
        footer={(
          <Btn
            title="Xác nhận mã đã nhập"
            disabled={!qrInput.trim()}
            onPress={() => {
              const res = a.verifyCustomerQR(o.code, qrInput);
              if (res?.ok) setShowQR(false);
            }}
          />
        )}
      >
        <Text style={[ui.meta, { lineHeight: 19, marginBottom: 12 }]}>
          Quét mã QR trên màn hình “Mã QR của tôi” của khách hàng tại nhà để xác nhận đã gặp đúng chủ nhà và nhận <Text style={{ fontWeight: '800', color: C.green }}>+1 điểm uy tín</Text>.
        </Text>
        <Btn
          title="📷 Quét mã QR trực tiếp của khách"
          variant="primary"
          onPress={() => {
            const res = a.verifyCustomerQR(o.code, 'AUTO_SCAN');
            if (res?.ok) setShowQR(false);
          }}
        />
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 14 }} />
        <Field
          label="Hoặc nhập mã xác thực / SĐT khách"
          value={qrInput}
          onChangeText={setQrInput}
          placeholder={`VD: HRMSS:${o.address?.phone || '0344699180'}`}
          style={{ marginTop: 0 }}
        />
      </Sheet>
      <Sheet visible={!!matMode} onClose={() => setMatMode(null)} title={matMode === 'usage' ? 'Ghi nhận vật tư' : 'Thêm vật tư / linh kiện'}>
        <Checkbox on={matAll} onPress={() => setMatAll(!matAll)} label="Hiện tất cả loại vật tư" />
        <View style={{ height: 8 }} />
        {mats.map((m) => (
          <Tap key={m.id} style={tx.option} onPress={() => addPart(m)}>
            <IconBox icon={m.category === 'all' ? '🧰' : catIcon(m.category)} size={38} bg={m.category === 'all' ? '#F1F4F9' : toneOf(m.category).bg} radius={12} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }}>{m.name}</Text>
              <Text style={ui.meta}>{formatVND(m.price)} / {m.unit}</Text>
            </View>
            <Text style={{ color: C.primary, fontSize: 20, fontWeight: '700' }}>＋</Text>
          </Tap>
        ))}
      </Sheet>
      <Sheet
        visible={showDecline}
        onClose={() => setShowDecline(false)}
        title="Lý do từ chối"
        footer={(
          <Btn
            title="Xác nhận từ chối"
            variant="danger"
            onPress={() => {
              const note = reason === 'Lý do khác' ? reasonNote.trim() : '';
              if (reason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do từ chối.', '✏️');
                return;
              }
              setShowDecline(false);
              a.declineJob(o.code, note ? `${reason}: ${note}` : reason);
              nav.back();
            }}
          />
        )}
      >
        <Text style={[ui.meta, { marginBottom: 8 }]}>Từ chối trước khi nhận không trừ uy tín.</Text>
        {DECLINE_REASONS.map((r) => (
          <Tap key={r} style={tx.option} onPress={() => setReason(r)}>
            <Radio on={reason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
        {reason === 'Lý do khác' ? (
          <Field label="Mô tả ngắn" value={reasonNote} onChangeText={setReasonNote} placeholder="VD: Xe hỏng, ngoài giờ làm…" style={{ marginTop: 8 }} />
        ) : null}
      </Sheet>
      <Sheet
        visible={showRelease}
        onClose={() => setShowRelease(false)}
        title="Trả việc sau khi nhận"
        footer={(
          <Btn
            title={releaseAssess?.free ? 'Trả việc (miễn phạt)' : `Trả việc · −${releaseAssess?.points || 0} uy tín`}
            variant="danger"
            onPress={() => {
              const note = releaseReason === 'Lý do khác' ? releaseNote.trim() : '';
              if (releaseReason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do trả việc.', '✏️');
                return;
              }
              setShowRelease(false);
              const res = a.releaseJob(o.code, note ? `${releaseReason}: ${note}` : releaseReason);
              if (res?.ok) nav.back();
            }}
          />
        )}
      >
        {releaseAssess ? (
          <View style={[tx.offline, { marginBottom: 12, backgroundColor: releaseAssess.free ? C.greenSoft : C.redSoft }]}>
            <Text style={{ fontWeight: '800', color: releaseAssess.free ? C.green : C.red }}>{releaseAssess.label}</Text>
            <Text style={{ marginTop: 4, lineHeight: 18, color: releaseAssess.free ? C.green : C.red }}>
              {releaseAssess.free
                ? 'Trong 15 phút đầu sau khi nhận — không trừ điểm.'
                : `Trừ ${releaseAssess.points} điểm uy tín${releaseAssess.lockMs ? ' và tạm hạn chế nhận việc mới' : ''}. Khách được điều phối lại${releaseAssess.voucher ? ' + voucher xin lỗi' : ''}.`}
            </Text>
          </View>
        ) : null}
        <Text style={[ui.meta, { marginBottom: 8 }]}>Chọn lý do trả việc (bắt buộc).</Text>
        {RELEASE_REASONS.map((r) => (
          <Tap key={r} style={tx.option} onPress={() => setReleaseReason(r)}>
            <Radio on={releaseReason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
        {releaseReason === 'Lý do khác' ? (
          <Field label="Mô tả ngắn" value={releaseNote} onChangeText={setReleaseNote} placeholder="VD: Tai nạn giao thông, không kịp đến…" style={{ marginTop: 8 }} />
        ) : null}
      </Sheet>
      <Sheet
        visible={showDone}
        onClose={() => { setShowDone(false); setForceDone(false); }}
        title="Biên bản nghiệm thu & hoàn thành"
        footer={(
          <Btn
            title="Gửi biên bản & hoàn thành"
            onPress={() => {
              if (!summary.trim()) {
                u.alert('Thiếu nội dung', 'Ghi ngắn công việc đã làm trước khi gửi biên bản.', '📝');
                return;
              }
              if (safetyChecks.length < SAFETY_CHECKLIST_ITEMS.length) {
                u.alert('Chưa đủ checklist an toàn', 'Vui lòng kiểm tra và xác nhận đủ 4 tiêu chuẩn an toàn kỹ thuật HRMSS trước khi bàn giao.', '⚡');
                return;
              }
              const hasAfter = evidence.some((e) => e.stage === 'after');
              if (!hasAfter && !forceDone) {
                u.alert('Thiếu ảnh sau khi làm', 'Nên thêm ảnh “Sau khi làm” làm minh chứng. Tick xác nhận nếu khách đồng ý bỏ qua.', '📷');
                return;
              }
              setShowDone(false);
              setForceDone(false);
              a.completeJob(o.code, {
                summary: summary.trim(),
                paid: orderTotal(o) > 0 ? paid : true,
                safetyChecklist: safetyChecks,
                customerSignature: signature || null,
              });
            }}
          />
        )}
      >
        <Field label="Nội dung công việc đã làm" multiline value={summary} onChangeText={setSummary} style={{ marginTop: -8 }} />
        <Text style={[ui.fieldLabel, { marginTop: 10, marginBottom: 6 }]}>⚡ Checklist an toàn kỹ thuật & nghiệm thu chuẩn HRMSS</Text>
        <View style={{ padding: 10, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.line, marginBottom: 10, gap: 6 }}>
          {SAFETY_CHECKLIST_ITEMS.map((item) => {
            const checked = safetyChecks.includes(item);
            return (
              <Checkbox
                key={item}
                on={checked}
                onPress={() => setSafetyChecks((prev) => (checked ? prev.filter((x) => x !== item) : [...prev, item]))}
                label={item}
              />
            );
          })}
        </View>

        <Text style={[ui.fieldLabel, { marginTop: 6, marginBottom: 6 }]}>✍️ Chữ ký điện tử của khách hàng</Text>
        <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 10 }}>
          <Text style={[ui.meta, { marginBottom: 8 }]}>Khách hàng xác nhận nghiệm thu đạt yêu cầu kỹ thuật & bàn giao thiết bị:</Text>
          <View style={{ height: 75, borderRadius: R.sm, backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: signature ? C.green : '#94A3B8', alignItems: 'center', justifyContent: 'center' }}>
            {signature ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontStyle: 'italic', fontWeight: '900', color: C.navy, letterSpacing: 2 }}>{signature}</Text>
                <Text style={{ fontSize: 10, color: C.green, fontWeight: '700', marginTop: 2 }}>✓ Đã ký xác thực điện tử lúc {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            ) : (
              <Text style={{ color: C.muted, fontStyle: 'italic', fontSize: 13 }}>Chưa có chữ ký của khách</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn
              title={signature ? "Ký lại" : "✍️ Khách ký xác nhận"}
              variant="outline"
              small
              style={{ flex: 1 }}
              onPress={() => setSignature(o.address?.name || 'Khách hàng ký')}
            />
            {signature ? (
              <Btn title="Xóa" variant="ghost" small onPress={() => setSignature('')} />
            ) : null}
          </View>
        </View>
        {orderTotal(o) > 0 ? <Checkbox on={paid} onPress={() => setPaid(!paid)} label={`Đã thu ${formatVND(orderTotal(o))} (${o.payment})`} /> : null}
        {!evidence.some((e) => e.stage === 'after') ? (
          <View style={[tx.note, { backgroundColor: C.orangeSoft, marginTop: 14 }]}>
            <Text style={{ color: C.orange, fontWeight: '700', marginBottom: 8 }}>⚠ Chưa có ảnh “Sau khi làm”.</Text>
            <Checkbox on={forceDone} onPress={() => setForceDone(!forceDone)} label="Khách đồng ý hoàn thành không kèm ảnh sau" />
          </View>
        ) : null}
        <Text style={[ui.meta, { marginTop: 12 }]}>Sau khi gửi, khách nhận thông báo hoàn thành và có thể đánh giá.</Text>
      </Sheet>
      <Sheet
        visible={showFollowUp}
        onClose={() => setShowFollowUp(false)}
        title="Tạo lịch tái khám"
        footer={(
          <Btn
            title="Xác nhận tái khám"
            onPress={() => {
              if (!fuReason.trim()) { u.alert('Thiếu lý do', 'Nhập lý do tái khám.', '🔄'); return; }
              const day = fuDays[fuDayIdx] || fuDays[0];
              const code = a.createFollowUp(o.code, {
                reason: fuReason.trim(),
                remaining: fuRemain.trim(),
                dateLabel: `${day.label} (${day.ddmm})`,
                dateKey: day.key,
                slot: fuSlot,
              });
              setShowFollowUp(false);
              if (code) nav.push('tech-job', { code });
            }}
          />
        )}
      >
        <Field label="Lý do tái khám" value={fuReason} onChangeText={setFuReason} placeholder="VD: Kiểm tra lại sau nạp gas" style={{ marginTop: -8 }} />
        <Field label="Công việc còn lại" multiline value={fuRemain} onChangeText={setFuRemain} placeholder="Hạng mục cần làm tiếp…" />
        <Text style={[ui.fieldLabel, { marginTop: 8 }]}>Ngày tái khám</Text>
        <HScroll contentContainerStyle={{ gap: 8, marginTop: 8, marginBottom: 4 }}>
          {fuDays.map((dd, i) => (
            <Tap key={dd.key} onPress={() => setFuDayIdx(i)} style={[tx.day, fuDayIdx === i && tx.dayOn]}>
              <Text style={[tx.dayLabel, fuDayIdx === i && { color: 'rgba(255,255,255,0.85)' }]}>{dd.label}</Text>
              <Text style={[tx.dayNum, fuDayIdx === i && { color: '#fff' }]}>{dd.ddmm}</Text>
            </Tap>
          ))}
        </HScroll>
        <Text style={[ui.fieldLabel, { marginTop: 8 }]}>Khung giờ</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {TIME_SLOTS.map((sl) => <Chip key={sl} label={sl} on={fuSlot === sl} onPress={() => setFuSlot(sl)} />)}
        </View>
      </Sheet>
    </View>
  );
}

// Phiên bản không dùng hook (gọi sau early-return ở TechJobScreen)
function nextActionFor(o, a, nav) {
  if (o.status === 'confirmed') return { label: 'Bắt đầu di chuyển', icon: '🛵', run: () => a.startTravel(o.code) };
  if (o.status === 'onway') {
    return {
      label: 'Đã đến nơi (check-in GPS)',
      icon: '📍',
      run: async () => {
        const loc = await getCheckInLocation();
        a.arrive(o.code, loc);
      },
    };
  }
  return { label: '', run: () => nav.back() };
}

const tx = StyleSheet.create({
  header: {
    backgroundColor: C.navy,
    ...grad.navyHero,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 48,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  goldBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: C.primary,
    opacity: 0.9,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  hello: { color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  techName: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  techSub: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 3, fontWeight: '600' },
  online: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  onlineOff: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)' },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  onlineText: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 },
  onlineBtn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onlineBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -30,
    borderRadius: R.lg,
    paddingVertical: 6,
    ...shadow.md,
    borderWidth: 1,
    borderColor: 'rgba(228,234,243,0.95)',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, marginHorizontal: 2 },
  statSplit: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.line },
  statOn: { backgroundColor: C.primarySoft },
  statV: { fontSize: 18, fontWeight: '900', color: C.ink, letterSpacing: -0.3 },
  statL: { fontSize: 10, color: C.muted, marginTop: 3, fontWeight: '700' },
  nextCard: {
    marginTop: 16,
    backgroundColor: C.navy2,
    ...grad.navyCard,
    borderColor: C.navy2,
    padding: 0,
    overflow: 'hidden',
    ...shadow.lg,
  },
  nextAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: '#FFFFFF' },
  nextEyebrow: { color: '#FFFFFF', fontWeight: '800', fontSize: 11, letterSpacing: 0.8 },
  nextTitle: { color: '#fff', fontWeight: '900', fontSize: 17, marginTop: 6, lineHeight: 23, letterSpacing: -0.2 },
  nextMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 5, fontWeight: '500' },
  offline: {
    backgroundColor: C.orangeSoft,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F6D9A8',
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  cardCode: { fontWeight: '800', fontSize: 13, flexShrink: 1 },
  cardStatus: { fontWeight: '800', fontSize: 12 },
  payBox: {
    alignItems: 'flex-end',
    backgroundColor: '#FFF5F4',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  payLabel: { fontSize: 10, color: C.muted, fontWeight: '700' },
  metaBlock: {
    marginTop: 12,
    backgroundColor: '#F6F8FC',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metaLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  metaIcon: {
    width: 22,
    height: 22,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8EEF5',
  },
  name: { fontSize: 15, fontWeight: '800', color: C.ink, lineHeight: 20, letterSpacing: -0.2 },
  info: { fontSize: 13, color: C.ink2, lineHeight: 19, flex: 1, fontWeight: '500' },
  sec: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 12 },
  day: {
    width: 66,
    height: 78,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  dayOn: { backgroundColor: C.navy, borderColor: C.navy, ...shadow.md },
  dayLabel: { fontSize: 11, color: C.muted, fontWeight: '700' },
  dayNum: { fontSize: 22, color: C.ink, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 },
  dayDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  slotRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  slotTime: { width: 52, fontSize: 11, color: C.muted, fontWeight: '700', paddingTop: 8, textAlign: 'right' },
  slotEmpty: {
    height: 44,
    borderRadius: R.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  daySummary: { marginBottom: 12 },
  histRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  histRail: { width: 14, alignItems: 'center' },
  histDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3, borderWidth: 2, borderColor: '#fff', ...shadow.sm },
  histLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginTop: 2, minHeight: 16 },
  incomeHead: { backgroundColor: C.greenSoft, borderRadius: R.md, padding: 16, marginBottom: 8 },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EEF5',
  },
  notif: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: R.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    ...shadow.sm,
  },
  notifUnread: { backgroundColor: '#F5F9FF', borderColor: '#D6E4FF' },
  notifTitle: { fontSize: 14, fontWeight: '800', color: C.ink2, lineHeight: 19 },
  notifBody: { fontSize: 13, color: C.muted, lineHeight: 18, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary, marginTop: 6 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginHorizontal: 16, marginTop: -34 },
  kpi: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: R.lg,
    padding: 14,
    ...shadow.md,
    borderWidth: 1,
    borderColor: 'rgba(228,234,243,0.95)',
  },
  kpiV: { fontSize: 18, fontWeight: '900', color: C.ink, marginTop: 6, letterSpacing: -0.3 },
  kpiL: { fontSize: 11, color: C.muted, fontWeight: '700', marginTop: 2 },
  h: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 12, letterSpacing: -0.2 },
  reviewRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E8EEF5' },
  menu: {
    backgroundColor: '#fff',
    borderRadius: R.lg,
    overflow: 'hidden',
    ...shadow.sm,
    borderWidth: 1,
    borderColor: 'rgba(228,234,243,0.95)',
  },
  hero: { borderRadius: R.lg, padding: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.04)' },
  heroLabel: { fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  heroDesc: { fontSize: 13, marginTop: 6, fontWeight: '600', opacity: 0.88, lineHeight: 19 },
  stepBar: { flex: 1, height: 6, borderRadius: 3 },
  addrBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    backgroundColor: '#F6F8FC',
    borderRadius: R.md,
    padding: 12,
  },
  svcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F6F8FC',
    borderRadius: R.md,
    padding: 12,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EEF5',
  },
  addLine: {
    height: 46,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B9CEF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: C.primarySoft,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  note: { borderRadius: R.md, padding: 12, marginTop: 12 },
  qRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  progRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EEF5',
  },
  fl: { fontSize: 13, fontWeight: '700', color: C.ink2, marginBottom: 8 },
  thumb: {
    width: 78,
    height: 78,
    borderRadius: 16,
    backgroundColor: '#EEF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbAdd: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B9CEF8',
    backgroundColor: C.primarySoft,
  },
  thumbX: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EEF5',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    ...shadow.md,
  },
});
