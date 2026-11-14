// ===========================================================================
// APP THỢ (Technician) — Hệ thống kỹ thuật viên Thợ Minh Đức
//   Nhận từ hệ thống: việc được giao, địa chỉ & liên hệ khách, lịch làm việc, báo giá, thông báo
//   Gửi lên hệ thống: chẩn đoán, tiến độ, vật tư sử dụng, ảnh minh chứng, biên bản hoàn thành
// Dùng chung dữ liệu đơn hàng với app Khách hàng (src/store.js) nên hai bên cập nhật cho nhau.
// ===========================================================================
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Image, Linking, RefreshControl } from 'react-native';
import { C, R, shadow, STATUS_META, toneOf } from '../../theme';
import {
  getService, formatVND, catIcon, catLabel, TECH_ME, MATERIALS, TIME_SLOTS, TECH_STATUS_DESC, TECH_ORDER_STEPS, techStepIndexOf, HOTLINE,
} from '../../constants/data';
import { PASSWORD_MIN_LENGTH, BASE_WARRANTY_DAYS } from '../../constants';
import {
  useApp, orderTotal, cashToCollect, bookedValue, isActiveOrder, dateKeyOf, todayKey, fmtDateTime, timeAgo,
  assessCancelAfterAccept, slotStartTs, matchJobForTech, isQRPayment,
} from '../../context';
import { validateVietnamesePhone, validateContactName } from '../../utils';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, PageHead, Segmented, Chip, Badge, Stars, Field, Sheet, Radio, Checkbox,
  EmptyState, Progress, Media, ListRow, Stepper, HScroll, ui, AppIcon, resolveSemanticTone,
} from '../../components';
import { pickImage, pickCamera } from '../../utils/media';
import { TrackingCard } from '../../components/order';
import { tx } from './components/techStyles';
import { useBusyRunner } from './components/useBusyRunner';
import { useNextAction } from './components/nextAction';
import { useQuoteDraft } from './components/useQuoteDraft';
import { QuoteEditor } from './components/QuoteEditor';
import { CompleteSheet } from './components/CompleteSheet';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DECLINE_REASONS = ['Bận lịch khác', 'Ngoài khu vực phục vụ', 'Không đúng chuyên môn', 'Lý do khác'];
const RELEASE_REASONS = ['Khẩn cấp gia đình', 'Xe / phương tiện hỏng', 'Ốm đột xuất', 'Lịch trùng không xử lý kịp', 'Lý do khác'];
const sameDay = (ts, key) => {
  if (!ts) return false;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === key;
};
const slotHour = (slot) => parseInt(slot, 10) || 0;
const callPhone = (phone) => Linking.openURL(`tel:${String(phone || '').replace(/[^\d+]/g, '')}`).catch(() => {});
const openMap = (addr) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`).catch(() => {});
// Thu nhập / chi trả cho thợ: backend chưa có bảng ví hay rút tiền, văn phòng đối soát ngoài app (không hiển thị số tự tính).

// Mã các việc tôi đã từ chối — một nguồn dữ liệu (ưu tiên d.declinedCodes tính theo mã thợ hiện tại).
const declinedCodesOf = (s, d) => {
  const src = Array.isArray(d?.declinedCodes) ? d.declinedCodes : (Array.isArray(s?.declined) ? s.declined : []);
  return [...new Set(src.map((x) => (x && typeof x === 'object' ? x.code : x)).filter(Boolean))];
};
// Đơn bị khách/văn phòng huỷ không phản ánh quyết định nhận việc của thợ.
const cancelledNotByTech = (o) => o.status === 'cancelled' && !['tech', 'technician'].includes(String(o.cancelledBy || '').toLowerCase());

function MetaLine({ icon, text, last }) {
  return (
    <View style={[tx.metaLine, last && { marginBottom: 0 }]}>
      <View style={tx.metaIcon}><AppIcon icon={icon} size={13} color={C.primary} strokeWidth={2.2} /></View>
      <Text style={tx.info} numberOfLines={2}>{text}</Text>
    </View>
  );
}

// =========================================================== THẺ CÔNG VIỆC
function JobCard({ o, compact, onDecline }) {
  const { s, a, nav } = useApp();
  const next = useNextAction()(o);
  const { run, isBusy } = useBusyRunner();
  const acceptKey = `accept:${o.code}`;
  const accepting = isBusy(acceptKey);
  const svc0 = getService(o.items[0]?.id);
  const meta = STATUS_META[o.status] || STATUS_META.pending;
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
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0369A1' }}>🏷️ ĐIỀU PHỐI TỪ HỆ THỐNG MINH ĐỨC</Text>

            </View>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '600' }}>✓ Đúng chuyên môn: {catLabel(svc0?.category)}</Text>
              <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '600' }}>✓ Khu vực phụ trách: {o.address?.district || 'Gần vị trí thợ'}</Text>
              <Text style={{ fontSize: 11.5, color: '#0284C7', fontWeight: '600' }}>✓ Khung giờ: {o.slot}</Text>
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Media item={svc0} height={56} width={56} radius={16} />
          <View style={{ flex: 1 }}>
            <Text style={tx.name} numberOfLines={2}>{svc0?.name}</Text>
            {o.items.length > 1 ? <Text style={[ui.meta, { marginTop: 2 }]}>+{o.items.length - 1} dịch vụ khác</Text> : null}
          </View>
          {(() => {
            const isWarranty = o.kind === 'warranty';
            const qrPay = !isWarranty && isQRPayment(o);
            const isPaid = Boolean(o.report?.paid);
            if (isWarranty) {
              return (
                <View style={[tx.payBox, { backgroundColor: C.greenSoft, borderWidth: 1, borderColor: '#A7F3D0' }]}>
                  <Text style={[tx.payLabel, { color: C.green }]}>Bảo hành</Text>
                  <Text style={[ui.price, { fontSize: 15, marginTop: 2, color: C.green }]}>0đ</Text>
                </View>
              );
            }
            if (o.status === 'quoted') {
              const quoteAmount = o.quote?.total || orderTotal(o);
              return (
                <View style={[tx.payBox, { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' }]}>
                  <Text style={[tx.payLabel, { color: '#B45309', fontWeight: '800' }]}>Báo giá chờ duyệt</Text>
                  <Text style={[ui.price, { fontSize: 14.5, marginTop: 2, color: '#B45309' }]}>
                    {formatVND(quoteAmount)}
                  </Text>
                </View>
              );
            }
            if (qrPay) {
              return (
                <View style={[tx.payBox, { backgroundColor: isPaid ? C.greenSoft : '#FFFBEB', borderWidth: 1, borderColor: isPaid ? '#A7F3D0' : '#FDE68A' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <AppIcon name={isPaid ? 'check-circle-2' : 'qr-code'} size={11} color={isPaid ? C.green : C.goldInk} strokeWidth={2.4} />
                    <Text style={[tx.payLabel, { color: isPaid ? C.green : C.goldInk, fontWeight: '800' }]}>
                      {isPaid ? 'Đã CK QR' : 'CK QR · Không thu'}
                    </Text>
                  </View>
                  <Text style={[ui.price, { fontSize: 14.5, marginTop: 2, color: isPaid ? C.green : C.goldInk }]}>
                    {formatVND(orderTotal(o))}
                  </Text>
                </View>
              );
            }
            return (
              <View style={[tx.payBox, isPaid && { backgroundColor: C.greenSoft, borderWidth: 1, borderColor: '#A7F3D0' }]}>
                <Text style={[tx.payLabel, { color: isPaid ? C.green : C.red, fontWeight: '800' }]}>
                  {isPaid ? 'Đã thu TM' : 'Thu tiền mặt'}
                </Text>
                <Text style={[ui.price, { fontSize: 15, marginTop: 2, color: isPaid ? C.green : C.red }]}>
                  {formatVND(isPaid ? orderTotal(o) : cashToCollect(o))}
                </Text>
              </View>
            );
          })()}
        </View>
        {match ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <Badge
              text={match.skillMatch ? '✓ Đúng chuyên môn' : '⚠ Trái chuyên môn'}
              fg={match.skillMatch ? C.green : C.orange}
              bg={match.skillMatch ? C.greenSoft : C.orangeSoft}
            />
            <Badge
              text={match.areaMatch ? 'Trong khu vực' : 'Ngoài khu vực'}
              fg={match.areaMatch ? C.primary : C.muted}
              bg={match.areaMatch ? C.primarySoft : '#F1F5F9'}
            />
          </View>
        ) : null}
        <View style={tx.metaBlock}>
          <MetaLine icon="calendar" text={`${o.dateLabel} · ${o.slot}`} />
          {o.device ? (
            <MetaLine
              icon={catIcon(o.device.category)}
              text={`${catLabel(o.device.category)}${o.device.brand ? ` · ${o.device.brand}` : ''}${o.device.room ? ` (${o.device.room})` : ''}`}
            />
          ) : null}
          <MetaLine icon="user" text={who} last={compact} />
          {!compact ? <MetaLine icon="map-pin" text={o.address?.full || ''} last /> : null}
        </View>
        <View style={tx.cardFoot}>
          {!compact && o.status === 'pending' ? (
            <View style={{ width: '100%', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn title="Gọi khách" small variant="ghost" icon="phone-call" style={{ flex: 1 }} onPress={() => callPhone(o.address?.phone)} />
                <Btn title="Chỉ đường" small variant="ghost" icon="compass" style={{ flex: 1 }} onPress={() => openMap(o.address?.full)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn title="Từ chối ca" small variant="dangerSoft" style={{ flex: 1 }} onPress={() => (onDecline ? onDecline(o) : null)} />
                <Btn title={accepting ? 'Đang nhận…' : 'Tiếp nhận ca'} icon="handshake" small style={{ flex: 1.45 }} disabled={accepting} onPress={() => run(acceptKey, () => a.acceptJob(o.code))} />
              </View>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn title="Gọi" small variant="ghost" icon="phone-call" onPress={() => callPhone(o.address?.phone)} />
                {!compact ? <Btn title="Chỉ đường" small variant="ghost" icon="compass" onPress={() => openMap(o.address?.full)} /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexShrink: 1 }}>
                {compact ? (
                  <Btn title="Chi tiết" small variant="soft" onPress={open} />
                ) : next ? (
                  <Btn title={next.label} icon={next.icon} small variant={next.variant || 'soft'} disabled={Boolean(next.disabled)} onPress={next.run} />
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

// =========================================================== TAB: VIỆC LÀM
export function TechJobsScreen() {
  const { s, a, d, nav, ui: u } = useApp();
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
  const { run, isBusy } = useBusyRunner();
  const declining = declineTarget ? isBusy(`decline:${declineTarget.code}`) : false;
  const filteredNewJobs = d.newJobs.filter((o) => {
    if (newFilter === 'all') return true;
    const m = matchJobForTech(o, me);
    if (newFilter === 'skill') return m.skillMatch;
    if (newFilter === 'area') return m.areaMatch;
    return true;
  });
  const list = tab === 'new' ? filteredNewJobs : tab === 'working' ? working : done;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={tx.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={tx.avatar}><AppIcon name="hard-hat" size={28} color={C.primary} strokeWidth={2.1} /></View>
            <View style={{ flex: 1 }}>
              <Text style={tx.hello}>Kỹ thuật viên Minh Đức</Text>
              <Text style={tx.techName} numberOfLines={1}>{me.name}</Text>
              <Text style={tx.techSub}>{me.code} · ★ {me.rating != null ? me.rating : '—'} ({me.ratingCount || 0} đánh giá dịch vụ)</Text>
            </View>
            <IconBtn icon="bell" dark badge={d.techUnread} onPress={() => nav.go('tech-notifs')} label="Thông báo" />
          </View>
        </View>

        <View style={tx.stats}>
          {[
            { v: d.newJobs.length, l: 'Việc mới', onPress: () => setTab('new'), on: tab === 'new' },
            { v: d.workingJobs.length, l: 'Đang làm', onPress: () => setTab('working'), on: tab === 'working' },
            { v: doneToday.length, l: 'Xong hôm nay', onPress: () => setTab('done'), on: tab === 'done' },
          ].map((x, i) => (
            <Tap key={x.l} style={[tx.statItem, i > 0 && tx.statSplit, x.on && tx.statOn]} onPress={x.onPress}>
              <Text style={[tx.statV, x.on && { color: C.primary }]}>{x.v}</Text>
              <Text style={[tx.statL, x.on && { color: C.primary }]}>{x.l}</Text>
            </Tap>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
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
                <Text style={{ color: C.primaryDark, marginTop: 4, lineHeight: 18 }}>Bấm “Đang đến” đúng giờ để phục vụ khách hàng chu đáo và nhận đánh giá 5 sao.</Text>
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
                  <Btn title="Gọi khách" icon="phone" small variant="primary" style={{ flex: 1 }} onPress={() => callPhone(nextJob.address?.phone)} />
                  <Btn
                    title={nextAct?.label || 'Xem chi tiết'}
                    icon={nextAct?.icon || 'wrench'}
                    small
                    variant="soft"
                    style={{ flex: 1.15 }}
                    disabled={Boolean(nextAct?.disabled)}
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
              <Chip label={`📍 Trong khu vực (${me.area?.trim() || 'Hà Nội'})`} on={newFilter === 'area'} onPress={() => setNewFilter('area')} />
            </HScroll>
          ) : null}
          <View style={{ marginTop: 14 }}>
            {list.length === 0 ? (
              <EmptyState
                icon={tab === 'new' ? 'inbox' : tab === 'working' ? 'briefcase' : 'clipboard-check'}
                title={tab === 'new' ? 'Chưa có việc mới' : tab === 'working' ? 'Không có việc đang làm' : 'Chưa có việc hoàn thành'}
                body={
                  tab === 'new'
                    ? 'Khi hệ thống phân công việc mới trong khu vực của bạn, đơn sẽ hiện tại đây.'
                    : tab === 'working'
                      ? 'Nhận việc ở mục “Việc mới” để bắt đầu ca làm.'
                      : 'Các việc đã xong trong ngày và trước đó sẽ hiện tại đây.'
                }
                action={tab === 'working' ? 'Xem việc mới' : null}
                onAction={() => {
                  if (tab === 'working') setTab('new');
                }}
              />
            ) : list.map((o) => (
              <JobCard
                key={o.code}
                o={o}
                onDecline={(job) => { setReason(DECLINE_REASONS[0]); setReasonNote(''); setDeclineTarget(job); }}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={!!declineTarget}
        onClose={() => { if (!declining) setDeclineTarget(null); }}
        title="Lý do từ chối"
        footer={(
          <Btn
            title={declining ? 'Đang gửi…' : 'Xác nhận từ chối'}
            variant="danger"
            disabled={declining}
            onPress={async () => {
              if (!declineTarget) return;
              const target = declineTarget;
              const note = reason === 'Lý do khác' ? reasonNote.trim() : '';
              if (reason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do từ chối.', 'pencil');
                return;
              }
              const res = await run(`decline:${target.code}`, () => a.declineJob(target.code, note ? `${reason}: ${note}` : reason));
              if (res !== undefined && res !== false) setDeclineTarget(null);
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
const slotStartMinutes = (slot) => {
  const m = /(\d{1,2})[h:](\d{2})/.exec(String(slot || ''));
  if (!m) return 9999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
const slotBucketFor = (slot) => {
  if (!slot) return null;
  if (TIME_SLOTS.includes(slot)) return slot;
  const m = /(\d{1,2})[h:](\d{2})/.exec(String(slot));
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (h >= 6 && h < 10) return '08h00 - 10h00';
  if (h >= 10 && h < 12) return '10h00 - 12h00';
  if (h >= 12 && h < 14) return '12h00 - 14h00';
  if (h >= 14 && h < 16) return '14h00 - 16h00';
  if (h >= 16 && h < 18) return '16h00 - 18h00';
  if (h >= 18 && h <= 22) return '18h00 - 20h00';
  return null;
};

export function TechScheduleScreen() {
  const { d, nav } = useApp();
  const [day, setDay] = useState(0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    return { key: todayKey(i), label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : WEEKDAYS[dt.getDay()], dd: String(dt.getDate()).padStart(2, '0') };
  });
  // Lịch gồm việc của tôi (trừ đã huỷ) + việc mới chưa nhận (so theo mã đơn, không theo tham chiếu object)
  const myCodes = new Set(d.myJobs.map((o) => o.code));
  const all = [...d.myJobs.filter((o) => o.status !== 'cancelled'), ...d.newJobs.filter((o) => !myCodes.has(o.code))];
  const key = days[day].key;
  const dayJobs = all
    .filter((o) => dateKeyOf(o) === key)
    .sort((a, b) => slotStartMinutes(a.slot) - slotStartMinutes(b.slot));
  const others = dayJobs.filter((o) => !slotBucketFor(o.slot));

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
            icon="calendar"
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
          const jobs = dayJobs.filter((o) => slotBucketFor(o.slot) === sl);
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {list.some((n) => !n.read) ? (
              <Tap onPress={a.readAllTech}><Text style={ui.link}>Đọc hết</Text></Tap>
            ) : null}
            {list.length > 0 ? (
              <Tap onPress={a.clearAllTechNotifs}><Text style={[ui.link, { color: C.muted }]}>Dọn sạch</Text></Tap>
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
            icon="bell"
            title={filter === 'unread' ? 'Đã đọc hết' : 'Chưa có thông báo'}
            body="Việc mới được giao, khách duyệt/từ chối báo giá, huỷ đơn hay đánh giá sẽ hiện ở đây."
            action="Về trang công việc"
            onAction={() => nav.go('tech-jobs')}
          />
        ) : filtered.map((n) => {
          const sem = resolveSemanticTone({ tone: n.tone, title: n.title, message: n.body, icon: n.icon, fallback: 'info' });
          return (
            <Tap
              key={n.id}
              style={[
                tx.notif,
                !n.read && { backgroundColor: sem.unreadBg, borderColor: sem.border },
                { borderLeftWidth: 4, borderLeftColor: sem.accent },
              ]}
              onPress={() => { a.readTechNotif(n.id); nav.open(n.link); }}
            >
              <IconBox icon={n.icon || sem.icon} size={42} bg={sem.bg} color={sem.accent} radius={14} />
              <View style={{ flex: 1 }}>
                <Text style={[tx.notifTitle, !n.read && { color: C.ink }]}>{n.title}</Text>
                {n.body ? <Text style={tx.notifBody}>{n.body}</Text> : null}
                <Text style={[ui.meta, { marginTop: 4 }]}>{timeAgo(n.at)}</Text>
              </View>
              {!n.read ? <View style={[tx.dot, { backgroundColor: sem.accent }]} /> : null}
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

// =========================================================== TAB: TÀI KHOẢN THỢ
export function TechAccountScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const me = s.techProfile || TECH_ME;
  const [showProfile, setShowProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [name, setName] = useState(me.name || '');
  const [phone, setPhone] = useState(me.phone || '');
  const [dob, setDob] = useState(me.dob || s.user?.dob || s.auth?.dob || '');
  const [area, setArea] = useState(me.area || 'Hà Nội');

  const done = d.myJobs.filter((o) => o.status === 'done');
  const rated = done.filter((o) => o.rating);
  const avg = me.rating != null
    ? Number(me.rating).toFixed(1)
    : (rated.length ? (rated.reduce((sum, o) => sum + o.rating.stars, 0) / rated.length).toFixed(1) : '—');
  const backendReviews = Array.isArray(me.reviews) ? me.reviews : [];
  // Tỉ lệ nhận việc = đã nhận / (đã nhận + đã từ chối). Đơn bị khách/văn phòng huỷ không tính.
  const acceptedJobs = d.myJobs.filter((o) => !cancelledNotByTech(o));
  const acceptedCodes = new Set(d.myJobs.map((o) => o.code));
  const accepted = acceptedJobs.length;
  const declined = declinedCodesOf(s, d).filter((code) => !acceptedCodes.has(code)).length;
  const rate = accepted + declined ? Math.round((accepted / (accepted + declined)) * 100) : 100;
  const completedCount = done.length;
  const refreshProfile = async () => {
    setRefreshing(true);
    try { await Promise.resolve(a.syncFromBackend()); } catch (_e) { /* giữ dữ liệu cũ */ } finally { setRefreshing(false); }
  };

  const openProfile = () => {
    setName(me.name || '');
    setPhone(me.phone || '');
    setDob(me.dob || s.user?.dob || s.auth?.dob || '');
    setArea(me.area || 'Hà Nội');
    setShowProfile(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshProfile} tintColor={C.primary} colors={[C.primary]} />}
      >
        <View style={[tx.header, { paddingBottom: 28 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[tx.avatar, { width: 68, height: 68, borderRadius: 24 }]}><AppIcon name="hard-hat" size={34} color={C.primary} strokeWidth={2.1} /></View>
            <View style={{ flex: 1 }}>
              <Text style={tx.techName}>{me.name}</Text>
              <Text style={tx.techSub}>{me.code} · {me.phone}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Badge text="Kỹ thuật viên" fg={C.primary} bg="#fff" />
              </View>
            </View>
            <IconBtn icon="pencil" dark onPress={openProfile} label="Sửa hồ sơ" />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: -18, zIndex: 2 }}>
          {(() => {
            const satisfactionRate = me.satisfactionPercent != null ? me.satisfactionPercent : null;
            const topFeedback = backendReviews.find((r) => r.review_text)?.review_text || rated.find((r) => r.rating?.text)?.rating?.text || '';
            return (
              <Card style={{ marginBottom: 0, borderColor: '#E8EEF5', backgroundColor: '#fff', ...shadow.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <AppIcon name="star" size={26} color="#D97706" fill="#D97706" strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontWeight: '900', color: C.ink, fontSize: 19 }}>★ {avg} / 5.0</Text>
                      {satisfactionRate != null ? <Badge text={`${satisfactionRate}% Hài lòng`} fg="#059669" bg="#ECFDF5" /> : null}
                    </View>
                    <Text style={[ui.meta, { marginTop: 2, lineHeight: 18 }]}>
                      Đánh giá dịch vụ của khách hàng ({completedCount} đơn hoàn thành)
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  {[
                    { l: '5★ Tuyệt đối', v: satisfactionRate != null ? `${satisfactionRate}%` : '—' },
                    { l: 'Tỷ lệ nhận việc', v: `${rate}%` },
                    { l: 'Lượt đánh giá', v: `${me.ratingCount || 0}` },
                  ].map((x) => (
                    <View key={x.l} style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{x.l}</Text>
                      <Text style={{ fontWeight: '900', color: C.ink, fontSize: 16, marginTop: 4 }}>{x.v}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#F0F3F8', paddingTop: 10 }}>
                  <Text style={{ fontSize: 11.5, color: C.muted, fontWeight: '600', marginBottom: 4 }}>Nhận xét tiêu biểu từ khách hàng:</Text>
                  <Text style={{ fontSize: 12.5, color: C.ink, fontStyle: 'italic', lineHeight: 18 }}>
                    {topFeedback ? `“${topFeedback}”` : 'Chưa có nhận xét.'}
                  </Text>
                </View>
              </Card>
            );
          })()}

          <Text style={[tx.h, { marginTop: 18, marginBottom: 10 }]}>Hiệu suất làm việc</Text>
          <View style={[tx.kpis, { marginHorizontal: 0, marginTop: 0 }]}>
            {[
              { i: 'check-circle-2', v: completedCount, l: 'Việc hoàn thành' },
              { i: 'star', v: avg, l: 'Đánh giá TB' },
              { i: 'handshake', v: `${rate}%`, l: 'Tỉ lệ nhận việc' },
            ].map((k) => (
              <View key={k.l} style={tx.kpi}>
                <AppIcon icon={k.i} size={22} color={C.primary} strokeWidth={2.1} />
                <Text style={tx.kpiV} numberOfLines={1}>{k.v}</Text>
                <Text style={tx.kpiL}>{k.l}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {me.specialtiesAvailable ? (
            <Card style={{ marginTop: 14 }}>
              <Text style={[tx.h, { marginBottom: 0 }]}>Chuyên môn</Text>
              {me.specialties?.length && !me.acceptsAllCategories ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {me.specialties.map((specialty) => <Chip key={specialty} label={specialty} />)}
                </View>
              ) : (
                <Text style={[ui.meta, { marginTop: 10 }]}>Nhận mọi loại dịch vụ</Text>
              )}
              <Text style={[ui.meta, { marginTop: 10 }]}>📍 Khu vực phục vụ: {me.area?.trim() || 'Hà Nội'}</Text>
            </Card>
          ) : (
            <Card style={{ marginTop: 14 }}>
              <Text style={[ui.meta, { marginTop: 2 }]}>📍 Khu vực phục vụ: {me.area?.trim() || 'Hà Nội'}</Text>
            </Card>
          )}

          {backendReviews.length ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={tx.h}>Đánh giá gần đây</Text>
              {backendReviews.slice(0, 5).map((r) => {
                const code = r.request_code;
                const open = code && s.orders.some((o) => o.code === code) ? () => nav.push('tech-job', { code }) : undefined;
                return (
                  <Tap key={r.review_id} style={tx.reviewRow} onPress={open}>
                    <Stars value={r.rating} size={12} />
                    <Text style={{ color: C.ink2, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{r.review_text || 'Không có nhận xét'}</Text>
                    <Text style={ui.meta}>{code || ''}</Text>
                  </Tap>
                );
              })}
            </Card>
          ) : (
            <Card style={{ marginTop: 12 }}>
              <Text style={tx.h}>Đánh giá gần đây</Text>
              <Text style={ui.meta}>Chưa có đánh giá. Hoàn thành việc để khách chấm điểm.</Text>
            </Card>
          )}

          <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink, marginTop: 20, marginBottom: 10, marginLeft: 2, letterSpacing: -0.2 }}>Tài khoản & Công việc</Text>
          <View style={tx.menu}>
            <ListRow icon="briefcase" label="Công việc của tôi" value={d.workingJobs.length ? `${d.workingJobs.length} đang làm` : ''} onPress={() => nav.go('tech-jobs')} />
            <ListRow icon="calendar-clock" label="Lịch làm việc" onPress={() => nav.go('tech-schedule')} />
            <ListRow icon="bell" label="Thông báo" value={d.techUnread ? `${d.techUnread} mới` : ''} onPress={() => nav.go('tech-notifs')} />
            <ListRow icon="circle-user-round" label="Sửa thông tin kỹ thuật viên" onPress={openProfile} />
            <ListRow icon="lock" label="Đổi mật khẩu" onPress={() => { setCurPw(''); setNewPw(''); setNewPw2(''); setShowPw(true); }} />
          </View>

          <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink, marginTop: 20, marginBottom: 10, marginLeft: 2, letterSpacing: -0.2 }}>Hỗ trợ kỹ thuật viên</Text>
          <View style={tx.menu}>
            <ListRow icon="headphones" label="Liên hệ điều phối" value={HOTLINE} onPress={u.call} last />
          </View>
          <Btn
            title="Đăng xuất tài khoản Thợ"
            icon="log-out"
            variant="dangerSoft"
            style={{ marginTop: 18 }}
            onPress={() => u.confirm('Thông báo', 'Bạn có muốn đăng xuất?', a.logout, 'Đồng ý', false)}
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
            onPress={async () => {
              const nameErr = validateContactName(name);
              if (nameErr) { u.alert('Họ tên không hợp lệ', nameErr, '✏️'); return; }
              const phoneErr = validateVietnamesePhone(phone);
              if (phoneErr) { u.alert('SĐT không hợp lệ', phoneErr, '📞'); return; }
              if (dob && dob.trim()) {
                const match = dob.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (!match) {
                  u.alert('Ngày sinh không hợp lệ', 'Vui lòng nhập theo định dạng DD/MM/YYYY (VD: 15/08/1995).', '🎂');
                  return;
                }
                const dNum = parseInt(match[1], 10);
                const mNum = parseInt(match[2], 10);
                const yNum = parseInt(match[3], 10);
                const nowYear = new Date().getFullYear();
                if (mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31 || yNum < 1920 || yNum > nowYear - 5) {
                  u.alert('Ngày sinh không hợp lệ', `Vui lòng kiểm tra lại ngày tháng năm sinh (1920 - ${nowYear - 5}).`, '🎂');
                  return;
                }
              }
              const saved = await a.updateTechProfile({
                name: name.trim(),
                phone: String(phone).replace(/\D/g, ''),
                dob: dob.trim(),
                area: area.trim() || TECH_ME.area,
              });
              if (saved) setShowProfile(false);
            }}
          />
        )}
      >
        <Field label="Họ và tên" value={name} onChangeText={setName} placeholder="Tên thợ" />
        <Field
          label="Số điện thoại"
          value={phone}
          onChangeText={(t) => {
            let p = t.replace(/[^0-9]/g, '').slice(0, 10);
            if (p.length > 0 && !p.startsWith('0')) {
              p = '0' + p.slice(0, 9);
            }
            setPhone(p);
          }}
          placeholder="10 chữ số (bắt đầu bằng số 0)"
          keyboardType="phone-pad"
        />
        <Field
          label="Ngày tháng năm sinh"
          value={dob}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '').slice(0, 8);
            let formatted = digits;
            if (digits.length > 4) {
              formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
            } else if (digits.length > 2) {
              formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
            }
            setDob(formatted);
          }}
          keyboardType="numeric"
          placeholder="DD/MM/YYYY (VD: 15/08/1995)"
        />
        <Field label="Khu vực phục vụ" value={area} onChangeText={setArea} placeholder="Ví dụ: Hà Nội" />
        {me.specialtiesAvailable ? (
          <>
            <Text style={[ui.fieldLabel, { marginTop: 12 }]}>Chuyên môn</Text>
            {me.specialties?.length && !me.acceptsAllCategories ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {me.specialties.map((specialty) => <Chip key={specialty} label={specialty} />)}
              </View>
            ) : <Text style={[ui.meta, { marginTop: 8 }]}>Nhận mọi loại dịch vụ</Text>}
          </>
        ) : null}
        <Text style={[ui.meta, { marginTop: 12 }]}>Mã thợ: {me.code}</Text>
      </Sheet>



      <Sheet
        visible={showPw}
        onClose={() => setShowPw(false)}
        title="Đổi mật khẩu"
        footer={(
          <Btn
            title="Cập nhật mật khẩu"
            onPress={async () => {
              if (newPw !== newPw2) { u.alert('Không khớp', 'Mật khẩu mới nhập lại chưa khớp.', '🔐'); return; }
              if (String(newPw).length < PASSWORD_MIN_LENGTH) { u.alert('Mật khẩu quá ngắn', `Mật khẩu mới cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`, '🔐'); return; }
              let res = null;
              try {
                res = await Promise.resolve(a.changePassword({ currentPassword: curPw, newPassword: newPw }));
              } catch (e) {
                res = { ok: false, error: (e && e.message) || 'Vui lòng thử lại.' };
              }
              if (!res?.ok) { u.alert('Không đổi được', res?.error || 'Vui lòng thử lại.', '🔐'); return; }
              setShowPw(false);
            }}
          />
        )}
      >
        <Field label="Mật khẩu hiện tại" value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="••••••" style={{ marginTop: -8 }} />
        <Field label="Mật khẩu mới" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự`} />
        <Field label="Nhập lại mật khẩu mới" value={newPw2} onChangeText={setNewPw2} secureTextEntry placeholder="Nhập lại" />
      </Sheet>
    </View>
  );
}

// =========================================================== CHI TIẾT CÔNG VIỆC
// Biên lai linh kiện mua ngoài (báo giá đã duyệt): backend bắt gắn ảnh biên lai cho từng dòng trước khi nộp hoàn thành.
function ReceiptCard({ o, editable }) {
  const { a, ui: u } = useApp();
  const [busyId, setBusyId] = useState(null);
  const parts = o.externalParts || [];
  if (!parts.length) return null;
  const attach = async (part) => {
    if (busyId) return;
    let uri = await pickCamera();
    if (uri === null) uri = await pickImage();
    if (uri == null) {
      if (uri === null) u.alert('Chưa hỗ trợ camera', 'Cho phép camera hoặc chọn ảnh từ thư viện.', '📷');
      return;
    }
    setBusyId(part.itemId);
    try {
      await Promise.resolve(a.uploadPartReceipt(o.code, part.itemId, uri));
    } catch (e) {
      u.alert('Không tải được biên lai', (e && e.message) || 'Vui lòng thử lại.', '📷');
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={tx.h}>🧾 Biên lai linh kiện mua ngoài</Text>
      <Text style={[ui.meta, { marginBottom: 8 }]}>Chụp hoá đơn mua cho từng linh kiện. Thiếu biên lai thì chưa nộp hoàn thành được.</Text>
      {parts.map((p) => (
        <View key={p.itemId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }} numberOfLines={2}>{p.name}</Text>
          {p.receiptId ? (
            <Badge text="Đã có biên lai" fg={C.green} bg={C.greenSoft} />
          ) : editable ? (
            <Btn title={busyId === p.itemId ? 'Đang tải…' : 'Chụp biên lai'} small variant="soft" disabled={Boolean(busyId)} onPress={() => attach(p)} />
          ) : (
            <Badge text="Thiếu biên lai" fg={C.orange} bg={C.orangeSoft} />
          )}
        </View>
      ))}
    </Card>
  );
}

// Các bước thực hiện của việc: checklist, chỉ số đo, ảnh (nếu bước yêu cầu) -> "Xong bước" gửi backend.
function ProcedureCard({ o, editable }) {
  const { a, ui: u } = useApp();
  const [openId, setOpenId] = useState(null);
  const [checked, setChecked] = useState([]);
  const [measures, setMeasures] = useState({});
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const proc = o.procedure;
  if (!proc) return null;
  const steps = (proc.services || []).flatMap((sv) => sv.steps.map((st) => ({ ...st, service_name: sv.service_name })));
  const open = (st) => {
    if (!editable || st.status !== 'PENDING') return;
    setOpenId(openId === st.step_id ? null : st.step_id);
    setChecked([...(st.items || [])]);
    setMeasures(Object.fromEntries((st.measures || []).map((m) => [m.key, st.measurements?.[m.key] != null ? String(st.measurements[m.key]) : ''])));
    setPhotos([]);
  };
  const addPhoto = async () => {
    let uri = await pickCamera();
    if (uri === null) uri = await pickImage();
    if (uri == null) {
      if (uri === null) u.alert('Chưa hỗ trợ camera', 'Cho phép camera hoặc chọn ảnh từ thư viện.', '📷');
      return;
    }
    setPhotos((p) => [...p, uri]);
  };
  const finish = async (st) => {
    const missing = (st.measures || []).filter((m) => String(measures[m.key] ?? '').trim() === '' || Number.isNaN(Number(measures[m.key])));
    if (missing.length) { u.alert('Thiếu chỉ số đo', `Nhập số cho: ${missing.map((m) => m.label).join(', ')}.`, 'ruler'); return; }
    if (st.require_photo && !photos.length && !(st.photo_ids || []).length) { u.alert('Thiếu ảnh', 'Bước này cần ít nhất 1 ảnh.', '📷'); return; }
    if (busy) return;
    setBusy(true);
    let res = null;
    try {
      res = await Promise.resolve(a.completeProcedureStep(o.code, st, {
        checkedItems: checked,
        measurements: Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, Number(v)])),
        photoUris: photos,
      }));
    } catch (e) {
      res = { ok: false, error: (e && e.message) || 'Vui lòng thử lại.' };
    } finally {
      setBusy(false);
    }
    if (!res?.ok) { u.alert('Chưa xong bước', res?.error || 'Vui lòng thử lại.', '⚠️'); return; }
    setOpenId(null);
    u.toast(`Đã xong bước ${st.step_no}`, '✅');
  };
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[tx.h, { marginBottom: 0 }]}>📋 Các bước thực hiện</Text>
        <Badge text={`${proc.done_steps}/${proc.total_steps} bước`} fg={proc.done_steps === proc.total_steps ? C.green : C.primary} bg={proc.done_steps === proc.total_steps ? C.greenSoft : C.primarySoft} />
      </View>
      <Text style={[ui.meta, { marginTop: 4, marginBottom: 6 }]}>Đánh dấu xong các bước bắt buộc rồi mới nộp biên bản.</Text>
      {steps.map((st) => {
        const done = st.status !== 'PENDING';
        const isOpen = openId === st.step_id;
        return (
          <View key={st.step_id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10 }}>
            <Tap onPress={() => open(st)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? C.green : C.primarySoft }}>
                <Text style={{ color: done ? '#fff' : C.primary, fontWeight: '800', fontSize: 12 }}>{done ? '✓' : st.step_no}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>{st.title}{st.is_required ? '' : ' (không bắt buộc)'}</Text>
                <Text style={ui.meta}>
                  {st.service_name}{st.require_photo ? ' · cần ảnh' : ''}{(st.measures || []).length ? ' · có chỉ số đo' : ''}
                  {done ? ` · ${st.status === 'SKIPPED' ? 'Bỏ qua' : 'Đã xong'}` : (editable ? ' · bấm để làm' : '')}
                </Text>
              </View>
            </Tap>
            {isOpen ? (
              <View style={{ marginTop: 10, gap: 6 }}>
                {(st.items || []).map((it) => (
                  <Checkbox key={it} on={checked.includes(it)} label={it}
                    onPress={() => setChecked((p) => (p.includes(it) ? p.filter((x) => x !== it) : [...p, it]))} />
                ))}
                {(st.measures || []).map((m) => (
                  <Field key={m.key} label={`${m.label}${m.unit ? ` (${m.unit})` : ''}`} value={measures[m.key] ?? ''} keyboardType="decimal-pad"
                    onChangeText={(t) => setMeasures((p) => ({ ...p, [m.key]: t.replace(',', '.').replace(/[^0-9.-]/g, '') }))} />
                ))}
                {st.require_photo ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {photos.map((uri, i) => (
                      <View key={`${i}`} style={tx.thumb}>
                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
                        <Tap style={tx.thumbX} onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text></Tap>
                      </View>
                    ))}
                    <Tap style={[tx.thumb, tx.thumbAdd]} onPress={addPhoto}>
                      <Text style={{ fontSize: 22, color: C.primary }}>＋</Text>
                      <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700' }}>Ảnh bước</Text>
                    </Tap>
                  </View>
                ) : null}
                <Btn title={busy ? 'Đang gửi…' : `Xong bước ${st.step_no}`} disabled={busy} onPress={() => finish(st)} />
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

export function TechJobScreen({ params }) {
  const { s, a, d, nav, ui: u } = useApp();
  const o = s.orders.find((x) => x.code === params.code);
  const cats = useMemo(() => [...new Set((o?.items || []).map((it) => getService(it.id)?.category).filter(Boolean))], [o]);
  const draft = useQuoteDraft(o);
  const next = useNextAction({ inDetail: true })(o);
  const { run, isBusy } = useBusyRunner();
  const [matMode, setMatMode] = useState(null); // 'quote' | 'usage'
  const [showPreQuote, setShowPreQuote] = useState(false);
  const [matAll, setMatAll] = useState(false);
  const [percent, setPercent] = useState(50);
  const [progressNote, setProgressNote] = useState('');
  const [repairNote, setRepairNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [releaseReason, setReleaseReason] = useState(RELEASE_REASONS[0]);
  const [releaseNote, setReleaseNote] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [summary, setSummary] = useState('');

  if (!o) return <View style={{ flex: 1 }}><TopBar title="Không tìm thấy công việc" /></View>;
  const meta = STATUS_META[o.status] || STATUS_META.pending;
  const step = techStepIndexOf(o.status);
  const mine = o.tech?.code === (s.techProfile?.code || TECH_ME.code);
  const editable = mine || o.status === 'pending';
  const techDesc = TECH_STATUS_DESC[o.status] || '';
  const canRelease = mine && ['confirmed', 'onway', 'diagnosing', 'quoted', 'repairing'].includes(o.status);
  const releaseAssess = canRelease ? assessCancelAfterAccept(o) : null;
  const iDeclined = declinedCodesOf(s, d).includes(o.code);

  // Cờ đang xử lý (chống bấm đúp)
  const K = {
    accept: `accept:${o.code}`,
    decline: `decline:${o.code}`,
    quote: `quote:${o.code}`,
    progress: `progress:${o.code}`,
    note: `note:${o.code}`,
    cash: `cash:${o.code}`,
    release: `release:${o.code}`,
  };
  const busyAccept = isBusy(K.accept);
  const busyDecline = isBusy(K.decline);
  const busyQuote = isBusy(K.quote);
  const busyProgress = isBusy(K.progress);
  const busyNote = isBusy(K.note);
  const busyCash = isBusy(K.cash);
  const busyRelease = isBusy(K.release);
  const succeeded = (res) => res !== undefined && res !== false && !(res && typeof res === 'object' && res.ok === false);

  // ---- báo giá ----
  const qTotal = draft.total;
  const diff = qTotal - bookedValue(o);
  const mats = MATERIALS.filter((m) => matAll || m.category === 'all' || cats.includes(m.category));
  const addPart = (m) => {
    if (matMode === 'usage') { a.addMaterial(o.code, m); setMatMode(null); return; }
    draft.setLines((p) => (p.some((l) => l.key === m.id) ? p.map((l) => (l.key === m.id ? { ...l, qty: l.qty + 1 } : l)) : [...p, { key: m.id, type: 'part', matId: m.id, name: m.name, unit: m.unit, qty: 1, price: m.price }]));
    setMatMode(null);
  };
  const sendQuote = () => {
    const symptoms = draft.tags.join(', ');
    const diag = draft.diagnosis.trim();
    const reco = draft.recommendation.trim();
    if (!symptoms && !diag) {
      u.alert('Thiếu chẩn đoán', 'Chọn triệu chứng hoặc nhập kết luận chẩn đoán trước khi gửi.', '🔍');
      return;
    }
    if (!reco) {
      u.alert('Thiếu đề xuất', 'Ghi đề xuất xử lý trước khi gửi báo giá.', '🧾');
      return;
    }
    if (!draft.lines.length) {
      u.alert('Báo giá trống', 'Thêm ít nhất một dòng công / vật tư trước khi gửi.', '🧾');
      return;
    }
    const text = [symptoms, diag].filter(Boolean).join('. ');
    run(K.quote, () => a.submitQuote(o.code, {
      diagnosis: text,
      symptoms,
      recommendation: reco,
      lines: draft.lines.map(({ key, ...l }) => l),
    })).then((res) => {
      if (succeeded(res)) { draft.markSaved(); setShowPreQuote(false); }
    });
  };
  const submitProgress = () => {
    const note = progressNote.trim();
    if (!note) { u.alert('Thiếu nội dung', 'Ghi ngắn công việc đã làm cho mốc tiến độ này.', '📝'); return; }
    run(K.progress, () => a.addProgress(o.code, { note, percent })).then((res) => {
      if (succeeded(res)) setProgressNote('');
    });
  };
  const submitRepairNote = () => {
    const note = repairNote.trim();
    if (!note) { u.alert('Thiếu nội dung', 'Nhập ghi chú công việc đã làm.', '📝'); return; }
    run(K.note, () => a.addRepairNote(o.code, note)).then((res) => {
      if (succeeded(res)) setRepairNote('');
    });
  };

  const evidence = o.evidence || [];
  const openComplete = () => {
    const pendingSteps = (o.procedure?.services || []).flatMap((sv) => sv.steps || []).filter((st) => st.is_required && st.status === 'PENDING');
    if (pendingSteps.length) {
      u.alert('Chưa xong các bước thực hiện', `Còn ${pendingSteps.length} bước bắt buộc chưa xong:\n${pendingSteps.map((st) => `• Bước ${st.step_no}: ${st.title}`).join('\n')}`, '📋');
      return;
    }
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
        {o.status === 'pending' && iDeclined ? (
          <View style={tx.offline}><Text style={{ color: C.orange, fontWeight: '700' }}>Bạn đã từ chối việc này. Vẫn có thể nhận lại nếu còn trống lịch.</Text></View>
        ) : null}
        {o.status === 'onway' ? <TrackingCard order={o} compact /> : null}

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

        {/* ===== Chờ Văn phòng nghiệm thu ===== */}
        {o.status === 'pending_review' ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: '#6D28D9', fontSize: 13.5 }}>🏢 CHỜ VĂN PHÒNG NGHIỆM THU</Text>
            </View>
            <Text style={{ color: '#4C1D95', fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              Bạn đã nộp biên bản và hình ảnh hiện trường. Hệ thống đang chuyển đến Văn phòng Minh Đức để đối soát biên bản nghiệm thu trước khi chốt đơn.
            </Text>
          </Card>
        ) : null}

        {['pending_payment', 'partially_paid'].includes(o.status) ? (
          <Card style={{ marginTop: 12, backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
            <Text style={{ fontWeight: '800', color: '#92400E', fontSize: 13.5 }}>
              {o.status === 'partially_paid' ? 'KHÁCH ĐÃ TRẢ MỘT PHẦN' : 'CHỜ KHÁCH KIỂM TRA & THANH TOÁN'}
            </Text>
            <Text style={{ color: '#78350F', fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              Biên bản đã gửi lên hệ thống. Khi khách thanh toán đủ, đơn sẽ chuyển sang chờ Văn phòng nghiệm thu.
            </Text>
            {/* Tiền mặt: khách bấm "đã trả" chỉ là báo; thợ xác nhận đã nhận thì đơn mới tính là đã trả. */}
            {mine && !isQRPayment(o) && !o.report?.paid ? (
              <>
                {o.bill?.cashClaimPending ? (
                  <Text style={{ color: '#92400E', fontSize: 12.5, marginTop: 6, fontWeight: '700' }}>Khách báo đã trả tiền mặt — xác nhận nếu bạn đã nhận đủ.</Text>
                ) : null}
                <Btn
                  title={busyCash ? 'Đang xác nhận…' : `Đã nhận tiền mặt ${formatVND(cashToCollect(o))}`}
                  icon="banknote"
                  small
                  disabled={busyCash}
                  style={{ marginTop: 10 }}
                  onPress={() => u.confirm(
                    'Xác nhận đã nhận tiền mặt?',
                    `Bạn xác nhận đã nhận đủ ${formatVND(cashToCollect(o))} tiền mặt của khách cho đơn ${o.code}.`,
                    () => run(K.cash, () => a.confirmCashReceived(o.code)),
                    'Đã nhận',
                  )}
                />
              </>
            ) : null}
          </Card>
        ) : null}

        {/* ===== Đã gửi yêu cầu tái khám ===== */}
        {o.followUpRequested ? (
          <Card style={{ marginTop: 12, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }}>
            <Text style={{ fontWeight: '800', color: '#1D4ED8', fontSize: 13.5 }}>📅 ĐÃ GỬI YÊU CẦU HẸN TÁI KHÁM</Text>
            <Text style={{ color: '#1E3A8A', fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              Lý do: <Text style={{ fontWeight: '700' }}>{o.followUpReason || 'Chờ linh kiện phụ tùng'}</Text>. Quản lý kỹ thuật Minh Đức đang lên lịch hẹn tái khám tiếp theo.
            </Text>
          </Card>
        ) : null}

        {o.status === 'pending' ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: '#0369A1', fontSize: 13.5 }}>📋 CA ĐƯỢC HỆ THỐNG PHÂN CÔNG</Text>

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
            <IconBox icon="user" size={46} bg={C.primarySoft} radius={15} />
            <View style={{ flex: 1 }}>
              <Text style={tx.name}>{o.address?.gender === 'Nữ' ? 'Chị' : 'Anh'} {o.address?.name}</Text>
              <Text style={ui.meta}>{o.address?.phone}</Text>
            </View>
            <IconBtn icon="phone-call" onPress={() => callPhone(o.address?.phone)} style={{ backgroundColor: C.greenSoft }} label="Gọi khách" />
          </View>
          <Tap style={tx.addrBox} onPress={() => openMap(o.address?.full)}>
            <AppIcon name="map-pin" size={16} color={C.primary} strokeWidth={2.2} />
            <Text style={{ flex: 1, color: C.ink, fontWeight: '600', lineHeight: 20 }}>{o.address?.full}</Text>
            <Text style={ui.link}>Chỉ đường</Text>
          </Tap>
        </Card>

        {/* Lịch hẹn + dịch vụ */}
        <Card style={{ marginTop: 12 }}>
          <Text style={tx.h}>Lịch hẹn & yêu cầu</Text>
          {o.customerTierLabel ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <Badge text={`👑 Khách hạng ${o.customerTierLabel} · BH ${o.warrantyDays || BASE_WARRANTY_DAYS} ngày`} fg={C.primary} bg={C.primarySoft} />
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
                  {att.uri ? <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} /> : <AppIcon name="image" size={22} color={C.muted} />}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={[tx.info, { marginTop: 6 }]}>💳 {o.payment}</Text>
          {o.kind !== 'warranty' ? (
            isQRPayment(o) ? (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: R.md,
                  backgroundColor: o.report?.paid ? C.greenSoft : '#FFFBEB',
                  borderWidth: 1.5,
                  borderColor: o.report?.paid ? '#A7F3D0' : '#FDE68A',
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <AppIcon name={o.report?.paid ? 'check-circle-2' : 'alert-triangle'} size={16} color={o.report?.paid ? C.green : C.orange} strokeWidth={2.3} />
                    <Text style={{ fontWeight: '800', color: o.report?.paid ? C.green : C.goldInk, fontSize: 13, flex: 1 }}>
                      {o.report?.paid ? 'Khách đã chuyển khoản VietQR thành công' : 'Khách chuyển khoản QR · KHÔNG THU TIỀN MẶT'}
                    </Text>
                  </View>
                  <Badge
                    text={o.report?.paid ? 'ĐÃ THANH TOÁN QR' : 'KHÔNG THU TIỀN'}
                    fg="#fff"
                    bg={o.report?.paid ? C.green : C.orange}
                  />
                </View>
                <Text style={{ fontSize: 12.5, color: o.report?.paid ? '#065F46' : C.goldInk, lineHeight: 18 }}>
                  {o.report?.paid
                    ? `Khách đã chuyển khoản đủ ${formatVND(orderTotal(o))} qua VietQR.`
                    : `Khách thanh toán ${formatVND(orderTotal(o))} qua mã VietQR trên ứng dụng Khách hàng. Kỹ thuật viên tuyệt đối KHÔNG thu tiền mặt.`}
                </Text>
              </View>
            ) : (
              <View
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: R.md,
                  backgroundColor: o.report?.paid ? C.greenSoft : C.redSoft,
                  borderWidth: 1,
                  borderColor: o.report?.paid ? '#A7F3D0' : '#FECACA',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: o.report?.paid ? C.green : C.red, fontSize: 13 }}>
                    {o.report?.paid ? '✓ Đã thu tiền mặt tại nhà' : `💵 Đơn thu tiền mặt tại nhà: ${formatVND(cashToCollect(o))}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.ink2, marginTop: 2 }}>
                    {o.report?.paid ? 'Đã đối soát thanh toán hoàn tất.' : 'Kỹ thuật viên trực tiếp thu tiền mặt từ khách sau khi nghiệm thu.'}
                  </Text>
                </View>
                <Badge text={o.report?.paid ? 'Hoàn thành' : 'Thu trực tiếp'} fg={o.report?.paid ? C.green : C.red} bg="#fff" />
              </View>
            )
          ) : null}
          <View style={{ marginTop: 10, gap: 8 }}>
            {o.items.map((it) => {
              const sv = getService(it.id);
              return (
                <View key={it.id} style={tx.svcRow}>
                  <AppIcon icon={sv?.icon} size={20} color={C.primary} strokeWidth={2.1} />
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
          <QuoteEditor o={o} draft={draft} cats={cats} matsCount={mats.length} onOpenMaterials={() => setMatMode('quote')} evidence={evidence} />
        ) : null}

        {/* ===== Báo giá đã gửi ===== */}
        {o.quote && !(o.status === 'diagnosing' && o.quote.revisionRequested) ? (
          <Card style={{ marginTop: 12 }}>
            {(() => {
              // Báo giá trước khi đi (status confirmed) chưa duyệt và chưa bị từ chối = đang chờ khách.
              const waiting = !o.quote.approved && (o.status === 'quoted' || (o.status === 'confirmed' && !o.quote.rejectReason && !o.quote.revisionRequested));
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={tx.h}>🧾 Chẩn đoán & báo giá</Text>
                  <Badge text={o.quote.approved ? 'Đã duyệt' : waiting ? 'Chờ khách duyệt' : 'Bị từ chối'} fg={o.quote.approved ? C.green : waiting ? C.goldInk : C.red} bg={o.quote.approved ? C.greenSoft : waiting ? C.goldSoft : C.redSoft} />
                </View>
              );
            })()}
            <Text style={[tx.info, { marginBottom: 6 }]}>{o.quote.diagnosis}</Text>
            {(o.quote.lines || []).map((l, i) => (
              <View key={`${l.name}-${i}`} style={tx.qRow}>
                <AppIcon name={l.type === 'part' ? 'settings' : 'hammer'} size={13} color={C.ink2} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, color: C.ink2 }} numberOfLines={1}>{l.name} x{l.qty}</Text>
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
                  <Btn title="Sửa báo giá / Phát sinh" icon="pencil" variant="outline" small style={{ flex: 1.15 }} onPress={() => a.reopenQuote(o.code)} />
                  <Btn title="Nhắc khách duyệt" icon="send" variant="soft" small style={{ flex: 1 }} onPress={() => a.remindQuote(o.code)} />
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
                <Btn title={busyProgress ? 'Đang gửi…' : 'Cập nhật tiến độ'} variant="soft" small style={{ marginTop: 10 }} disabled={busyProgress || !progressNote.trim()} onPress={submitProgress} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Nhật ký ghi chú sửa chữa */}
        {(o.status === 'repairing' && mine) || (o.repairNotes || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={tx.h}>📝 Ghi chú sửa chữa</Text>
              {(o.repairNotes || []).length > 0 ? (
                <Badge text={`${(o.repairNotes || []).length} ghi chú`} fg={C.ink2} bg="#F1F5F9" />
              ) : null}
            </View>
            {(o.repairNotes || []).map((n) => (
              <View key={n.id} style={[tx.progRow, { borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 10, marginBottom: 8 }]}>
                {editingNoteId === n.id ? (
                  <View style={{ marginTop: 4, padding: 10, backgroundColor: '#F8FAFC', borderRadius: R.md, borderWidth: 1, borderColor: '#CBD5E1' }}>
                    <Field
                      value={editingNoteText}
                      onChangeText={setEditingNoteText}
                      multiline
                      placeholder="Nội dung ghi chú sửa chữa…"
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <Btn title="Huỷ" variant="ghost" small onPress={() => setEditingNoteId(null)} />
                      <Btn
                        title="Lưu"
                        small
                        onPress={() => {
                          a.updateRepairNote(o.code, n.id, editingNoteText);
                          setEditingNoteId(null);
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.ink, fontWeight: '600', lineHeight: 20 }}>{n.text}</Text>
                      <Text style={[ui.meta, { marginTop: 2 }]}>{fmtDateTime(n.at)}</Text>
                    </View>
                    {mine ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Tap
                          style={{ padding: 6, borderRadius: 6, backgroundColor: '#F1F5F9' }}
                          hitSlop={6}
                          onPress={() => {
                            setEditingNoteId(n.id);
                            setEditingNoteText(n.text);
                          }}
                        >
                          <AppIcon name="pencil" size={13} color={C.ink2} />
                        </Tap>
                        <Tap
                          style={{ padding: 6, borderRadius: 6, backgroundColor: '#FEF2F2' }}
                          hitSlop={6}
                          onPress={() => {
                            u.dialog({
                              icon: 'trash-2',
                              title: 'Xoá ghi chú này?',
                              message: 'Bạn có chắc muốn xoá dòng ghi chú này?',
                              actions: [
                                { label: 'Huỷ', variant: 'ghost' },
                                {
                                  label: 'Xác nhận xoá',
                                  variant: 'danger',
                                  onPress: () => a.deleteRepairNote(o.code, n.id),
                                },
                              ],
                            });
                          }}
                        >
                          <AppIcon name="trash-2" size={13} color={C.red} />
                        </Tap>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            ))}
            {o.status === 'repairing' && mine ? (
              <View style={{ marginTop: 6 }}>
                <Field value={repairNote} onChangeText={setRepairNote} placeholder="Thêm ghi chú công việc đã làm / phát hiện thêm…" multiline />
                <Btn title={busyNote ? 'Đang lưu…' : '＋ Thêm ghi chú mới'} variant="soft" small style={{ marginTop: 10 }} disabled={busyNote || !repairNote.trim()} onPress={submitRepairNote} />
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

        {/* ===== Các bước thực hiện (backend: bắt buộc xong trước khi nộp biên bản) ===== */}
        {o.procedure && (mine || o.procedure.progress_percent > 0) ? <ProcedureCard o={o} editable={mine && ['diagnosing', 'repairing'].includes(o.status)} /> : null}
        {mine ? <ReceiptCard o={o} editable={['diagnosing', 'repairing'].includes(o.status)} /> : null}

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
                ? (isQRPayment(o)
                  ? `Khách đã chuyển khoản VietQR ${formatVND(orderTotal(o))} về hệ thống (Thợ không thu tiền mặt)`
                  : `Đã thu tiền mặt ${formatVND(orderTotal(o))}${o.report.paidBy === 'customer' ? ' (khách xác nhận)' : ''}`)
                : (isQRPayment(o)
                  ? `Chờ khách quét mã VietQR ${formatVND(orderTotal(o))} trên App Khách (Thợ không thu tiền mặt)`
                  : 'Chưa thu tiền / chờ khách xác nhận')}
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

        {o.status === 'cancelled' ? (
          <Card style={{ marginTop: 12, backgroundColor: (o.inspectionFee || 0) > 0 ? '#FEF3C7' : '#F1F5F9', borderColor: (o.inspectionFee || 0) > 0 ? '#F5D77A' : C.line }}>
            <Text style={[tx.h, { color: (o.inspectionFee || 0) > 0 ? '#92400E' : C.ink }]}>
              {(o.inspectionFee || 0) > 0 ? `💰 Phí kiểm tra tại nhà: ${formatVND(o.inspectionFee)}` : 'Đơn huỷ không thu phí (0đ)'}
            </Text>
            <Text style={{ color: (o.inspectionFee || 0) > 0 ? '#92400E' : C.ink2, lineHeight: 20 }}>
              {(o.inspectionFee || 0) > 0
                ? `Khách huỷ sau khi thợ đã tới kiểm tra thiết bị trực tiếp tại nhà. Khách thanh toán ${formatVND(o.inspectionFee)} phí kiểm tra cho thợ.`
                : 'Chính sách Minh Đức miễn phí 100% kiểm tra tại nhà khi khách từ chối sửa chữa (0đ).'}
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      {/* ===== Thanh hành động ===== */}
      {o.status === 'pending' ? (
        <View style={tx.dock}>
          <Btn title="Từ chối ca" variant="ghost" style={{ flex: 1 }} disabled={busyAccept || busyDecline} onPress={() => { setReason(DECLINE_REASONS[0]); setReasonNote(''); setShowDecline(true); }} />
          <Btn title={busyAccept ? 'Đang nhận…' : 'Tiếp nhận ca'} icon="handshake" style={{ flex: 2 }} disabled={busyAccept || busyDecline} onPress={() => run(K.accept, () => a.acceptJob(o.code))} />
        </View>
      ) : null}
      {o.status === 'quoted' && mine ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          <View style={{ flex: 1.15, alignItems: 'center' }}>
            <Text style={[ui.meta, { marginTop: 0 }]}>Chờ khách duyệt</Text>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15, marginTop: 1 }}>{formatVND(o.quote?.total || 0)}</Text>
          </View>
          <Btn title="Nhắc" icon="send" variant="soft" style={{ flex: 1 }} onPress={() => a.remindQuote(o.code)} />
        </View>
      ) : null}
      {mine && ['confirmed', 'onway'].includes(o.status) ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          {o.status === 'confirmed' && showPreQuote ? (
            <Btn title={busyQuote ? 'Đang gửi…' : 'Gửi báo giá trước khi đi'} icon="receipt-text" style={{ flex: 2 }} disabled={busyQuote} onPress={sendQuote} />
          ) : next ? (
            <Btn title={next.label} icon={next.icon} variant={next.variant || 'primary'} style={{ flex: 2 }} disabled={Boolean(next.disabled)} onPress={next.run} />
          ) : null}
        </View>
      ) : null}
      {mine && o.status === 'diagnosing' ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }}>
          <Tap onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }}>
            <Text style={{ color: C.red, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>Không thể tiếp tục? Trả việc cho điều phối</Text>
          </Tap>
        </View>
      ) : null}
      {mine && o.status === 'diagnosing' ? (
        <View style={tx.dock}>
          <View style={{ flex: 1 }}>
            <Text style={ui.meta}>Tổng báo giá</Text>
            <Text style={[ui.price, { fontSize: 18 }]}>{formatVND(qTotal)}</Text>
          </View>
          <Btn title={busyQuote ? 'Đang gửi…' : diff > 0 ? 'Gửi báo giá cho khách' : 'Xác nhận & bắt đầu'} style={{ flex: 2 }} disabled={busyQuote} onPress={sendQuote} />
        </View>
      ) : null}
      {mine && o.status === 'repairing' ? (
        <View style={tx.dock}>
          <Btn
            title="Hẹn tái khám"
            variant="soft"
            style={{ flex: 1 }}
            onPress={() => {
              u.dialog({
                icon: 'calendar',
                title: 'Yêu cầu hẹn tái khám',
                message: 'Chưa thể hoàn thành ca trong hôm nay? Chọn lý do để Quản lý kỹ thuật Minh Đức xếp lịch quay lại.',
                actions: [
                  { label: 'Đóng', variant: 'ghost' },
                  {
                    label: 'Chờ linh kiện kho',
                    onPress: () => a.requestFollowUp(o.code, 'Chờ linh kiện phụ tùng từ kho điều phối'),
                  },
                  {
                    label: 'Hết giờ toà nhà',
                    onPress: () => a.requestFollowUp(o.code, 'Hết giờ làm việc của toà nhà / Hẹn ngày mai tiếp tục'),
                  },
                ],
              });
            }}
          />
          <Btn title="Hoàn thành" icon="check-circle-2" style={{ flex: 1.6 }} onPress={openComplete} />
        </View>
      ) : null}
      {!editable && o.status !== 'done' && o.status !== 'cancelled' ? (
        <View style={tx.dock}><Text style={[ui.meta, { flex: 1, textAlign: 'center' }]}>Việc này do thợ khác phụ trách.</Text></View>
      ) : null}

      {/* ===== Sheets ===== */}
      <Sheet visible={!!matMode} onClose={() => setMatMode(null)} title={matMode === 'usage' ? 'Ghi nhận vật tư' : 'Thêm vật tư / linh kiện'}>
        <Checkbox on={matAll} onPress={() => setMatAll(!matAll)} label="Hiện tất cả loại vật tư" />
        <View style={{ height: 8 }} />
        {mats.map((m) => (
          <Tap key={m.id} style={tx.option} onPress={() => addPart(m)}>
            <IconBox icon={m.category === 'all' ? 'package' : catIcon(m.category)} size={38} bg={m.category === 'all' ? '#F1F4F9' : toneOf(m.category).bg} radius={12} />
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
        onClose={() => { if (!busyDecline) setShowDecline(false); }}
        title="Lý do từ chối"
        footer={(
          <Btn
            title={busyDecline ? 'Đang gửi…' : 'Xác nhận từ chối'}
            variant="danger"
            disabled={busyDecline}
            onPress={async () => {
              const note = reason === 'Lý do khác' ? reasonNote.trim() : '';
              if (reason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do từ chối.', '✏️');
                return;
              }
              const res = await run(K.decline, () => a.declineJob(o.code, note ? `${reason}: ${note}` : reason));
              if (!succeeded(res)) return;
              setShowDecline(false);
              nav.back();
            }}
          />
        )}
      >
        <Text style={[ui.meta, { marginBottom: 8 }]}>Bạn có thể từ chối ca nếu bận lịch hoặc ngoài khu vực phục vụ.</Text>
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
        onClose={() => { if (!busyRelease) setShowRelease(false); }}
        title="Trả việc sau khi nhận"
        footer={(
          <Btn
            title={busyRelease ? 'Đang gửi…' : releaseAssess?.free ? 'Trả việc (hợp lệ)' : 'Xác nhận trả việc'}
            variant="danger"
            disabled={busyRelease}
            onPress={async () => {
              const note = releaseReason === 'Lý do khác' ? releaseNote.trim() : '';
              if (releaseReason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do trả việc.', '✏️');
                return;
              }
              const res = await run(K.release, () => a.releaseJob(o.code, note ? `${releaseReason}: ${note}` : releaseReason));
              if (res?.ok) { setShowRelease(false); nav.back(); }
            }}
          />
        )}
      >
        {releaseAssess ? (
          <View style={[tx.offline, { marginBottom: 12, backgroundColor: releaseAssess.free ? C.greenSoft : C.redSoft }]}>
            <Text style={{ fontWeight: '800', color: releaseAssess.free ? C.green : C.red }}>{releaseAssess.label}</Text>
            <Text style={{ marginTop: 4, lineHeight: 18, color: releaseAssess.free ? C.green : C.red }}>
              {releaseAssess.free
                ? 'Trong 15 phút đầu sau khi nhận — trả việc hợp lệ.'
                : 'Trả việc sau thời gian quy định sẽ ảnh hưởng đến đánh giá dịch vụ. Khách được điều phối lại.'}
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
      <CompleteSheet
        o={o}
        visible={showDone}
        onClose={() => setShowDone(false)}
        initialSummary={summary}
        evidence={evidence}
      />
    </View>
  );
}
