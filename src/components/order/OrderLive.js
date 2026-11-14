/** Định vị hành trình kỹ thuật viên (GPS Realtime Tracking) — dùng chung Khách hàng / Kỹ thuật viên */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../../theme';
import { useApp, timeAgo } from '../../context';
import { Card, Progress, ui, AppIcon } from '../common';

const TICK_MS = 15000;

/**
 * Theo dõi tiến độ di chuyển GPS của kỹ thuật viên.
 * - Phía THỢ (đúng thợ phụ trách đơn): gửi vị trí thật của máy lên server định kỳ.
 * - Phía KHÁCH: chỉ đọc vị trí thợ từ server định kỳ.
 * (a.tickTracking tự rẽ nhánh theo s.auth.role; ở đây chặn để mỗi máy chỉ chạy đúng vai của mình,
 *  vd. tài khoản thợ xem việc của thợ khác thì không gửi vị trí của mình vào đơn đó.)
 */
export function TrackingCard({ order, compact }) {
  const { s, a } = useApp();
  const o = order;
  const tr = o.tracking;
  const active = o.status === 'onway';
  const role = s?.auth?.role || s?.role || 'customer';
  const myTechCode = s?.techProfile?.code;
  const isTechSide = role === 'tech';
  // Thợ chỉ gửi vị trí cho việc của chính mình; khách luôn được đọc.
  const shouldTick = active && (!isTechSide || !o.tech?.code || !myTechCode || o.tech.code === myTechCode);

  // Ref tới `a` mới nhất: interval không giữ closure cũ (a.tickTracking đọc s.orders tại thời điểm tạo).
  const aRef = useRef(a);
  aRef.current = a;

  useEffect(() => {
    if (!shouldTick) return undefined;
    let cancelled = false;
    let running = false;
    const tick = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        await Promise.resolve(aRef.current?.tickTracking?.(o.code));
      } catch (_e) {
        // Lỗi mạng / GPS tạm thời: bỏ qua, lần sau thử lại.
      } finally {
        running = false;
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [shouldTick, o.code, role]);

  if (!active && !tr) return null;
  if (!active && tr) {
    return (
      <Card style={{ marginTop: 12, backgroundColor: C.greenSoft, borderColor: '#CDEFDD' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppIcon name="map-pin" size={16} color={C.green} strokeWidth={2.3} />
          <Text style={st.h}>Thợ đã đến nơi</Text>
        </View>
        <Text style={st.body}>Hành trình kết thúc khi check-in GPS.</Text>
      </Card>
    );
  }

  // Backend không luôn trả quãng đường / ETA: chỉ vẽ chấm vị trí khi THẬT SỰ có tiến độ, không giả lập giữa đường.
  const hasProgress = tr?.progress != null && Number.isFinite(Number(tr.progress));
  const progress = hasProgress ? Math.min(0.98, Math.max(0.05, Number(tr.progress))) : null;
  const hasCoords = tr?.lat != null && tr?.lng != null;
  const eta = tr?.etaMin ?? null;

  return (
    <Card style={{ marginTop: 12, backgroundColor: '#F0F7FF', borderColor: '#D6E4FF' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppIcon name="navigation" size={16} color={C.primary} strokeWidth={2.3} />
          <Text style={st.h}>{isTechSide ? 'Đang chia sẻ vị trí' : 'Theo dõi thợ realtime'}</Text>
        </View>
        {eta != null ? <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>~{eta} phút</Text> : null}
      </View>
      <Text style={st.body}>
        {tr?.label || (isTechSide ? 'Vị trí của bạn được gửi cho khách trong lúc di chuyển.' : 'Thợ đang di chuyển tới địa chỉ của bạn.')}
      </Text>
      {hasProgress ? <Progress value={progress} color={C.primary} style={{ marginTop: 10 }} /> : null}
      <View style={st.trackMap}>
        <View style={st.route}>
          <View style={[st.dot, { backgroundColor: C.primary }]} />
          <View style={st.dash} />
          {hasProgress ? (
            <View style={[st.dot, { backgroundColor: C.green, left: `${Math.round(progress * 86)}%` }]}>
              <AppIcon name="hard-hat" size={11} color="#fff" strokeWidth={2.5} />
            </View>
          ) : null}
          <View style={[st.dot, { backgroundColor: C.primary, right: 0, left: undefined }]}>
            <AppIcon name="home" size={11} color="#fff" strokeWidth={2.5} />
          </View>
        </View>
        <Text style={[ui.meta, { marginTop: 8 }]}>
          {hasCoords ? `${Number(tr.lat).toFixed(4)}, ${Number(tr.lng).toFixed(4)}` : 'Đang chờ vị trí…'}
          {hasCoords && tr?.updatedAt ? ` · ${timeAgo(tr.updatedAt)}` : ''}
        </Text>
      </View>
      {!compact ? (
        <Text style={[ui.meta, { marginTop: 8, lineHeight: 18 }]}>
          Vị trí của kỹ thuật viên được cập nhật trực tiếp theo hành trình.
        </Text>
      ) : null}
    </Card>
  );
}

/** Chat giữa thợ và khách đã được hủy theo yêu cầu (giữ export để không vỡ import cũ). */
export const ChatCard = () => null;

const st = StyleSheet.create({
  h: { fontWeight: '800', color: C.ink, fontSize: 15 },
  body: { color: C.ink2, marginTop: 6, lineHeight: 20 },
  trackMap: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4EAF3' },
  route: { height: 28, justifyContent: 'center', marginTop: 4 },
  dash: { height: 3, backgroundColor: '#D6E4FF', borderRadius: 2, marginHorizontal: 10 },
  dot: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    top: 3, left: 0, borderWidth: 2, borderColor: '#fff',
  },
});
