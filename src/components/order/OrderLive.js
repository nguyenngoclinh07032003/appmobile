/** Định vị hành trình kỹ thuật viên (GPS Realtime Tracking) — dùng chung Khách hàng / Kỹ thuật viên */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../../theme';
import { useApp, timeAgo } from '../../context';
import { Card, Progress, ui } from '../common';

/** Theo dõi tiến độ di chuyển GPS trực tiếp của kỹ thuật viên */
export function TrackingCard({ order, compact }) {
  const { a } = useApp();
  const o = order;
  const tr = o.tracking;
  const active = o.status === 'onway';

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => a.tickTracking(o.code), 4000);
    a.tickTracking(o.code);
    return () => clearInterval(id);
  }, [active, o.code]);

  if (!active && !tr) return null;
  if (!active && tr) {
    return (
      <Card style={{ marginTop: 12, backgroundColor: C.greenSoft, borderColor: '#CDEFDD' }}>
        <Text style={st.h}>📍 Thợ đã đến nơi</Text>
        <Text style={st.body}>Hành trình kết thúc khi check-in GPS.</Text>
      </Card>
    );
  }

  const progress = Math.min(0.98, Math.max(0.05, tr?.progress ?? 0.1));
  const eta = tr?.etaMin ?? Math.max(1, Math.round(22 * (1 - progress)));

  return (
    <Card style={{ marginTop: 12, backgroundColor: '#F0F7FF', borderColor: '#D6E4FF' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={st.h}>🛵 Theo dõi thợ realtime</Text>
        <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>~{eta} phút</Text>
      </View>
      <Text style={st.body}>{tr?.label || 'Thợ đang di chuyển tới địa chỉ của bạn.'}</Text>
      <Progress value={progress} color={C.primary} style={{ marginTop: 10 }} />
      <View style={st.trackMap}>
        <View style={st.route}>
          <View style={[st.dot, { backgroundColor: C.primary }]} />
          <View style={st.dash} />
          <View style={[st.dot, { backgroundColor: C.green, left: `${Math.round(progress * 86)}%` }]}>
            <Text style={{ fontSize: 11 }}>👷</Text>
          </View>
          <View style={[st.dot, { backgroundColor: C.primary, right: 0, left: undefined }]}>
            <Text style={{ fontSize: 11 }}>🏠</Text>
          </View>
        </View>
        <Text style={[ui.meta, { marginTop: 8 }]}>
          {tr?.lat != null ? `${Number(tr.lat).toFixed(4)}, ${Number(tr.lng).toFixed(4)}` : 'Đang cập nhật toạ độ…'}
          {tr?.updatedAt ? ` · ${timeAgo(tr.updatedAt)}` : ''}
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

/** Chat giữa thợ và khách đã được hủy theo yêu cầu */
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
