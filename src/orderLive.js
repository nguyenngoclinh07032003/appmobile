/** Theo dõi thợ (mô phỏng) + chat đơn — dùng chung Khách / Thợ */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { C, R } from './theme';
import { useApp, fmtDateTime, timeAgo } from './store';
import { Btn, Card, Progress, Tap, ui } from './ui';

/** Tiến độ tracking giả lập dựa trên travelStartedAt + tick store */
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
          <View style={[st.dot, { backgroundColor: C.gold, right: 0, left: undefined }]}>
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

export function ChatCard({ order, role }) {
  const { a } = useApp();
  const [text, setText] = useState('');
  const chat = order.chat || [];
  const from = role === 'tech' ? 'tech' : 'customer';
  const send = () => {
    const t = text.trim();
    if (!t) return;
    a.sendOrderChat(order.code, t, from);
    setText('');
  };

  if (!order.tech && order.status === 'pending') {
    return (
      <Card style={{ marginTop: 12 }}>
        <Text style={st.h}>💬 Chat với thợ</Text>
        <Text style={st.body}>Chat mở sau khi thợ nhận đơn.</Text>
      </Card>
    );
  }
  if (!order.tech) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={st.h}>💬 Chat đơn {order.code}</Text>
      <Text style={[ui.meta, { marginBottom: 8 }]}>
        {role === 'tech' ? `Khách: ${order.address?.name || '—'}` : `Thợ: ${order.tech?.name || '—'}`}
      </Text>
      <View style={st.chatBox}>
        {chat.length === 0 ? (
          <Text style={[ui.meta, { textAlign: 'center', paddingVertical: 12 }]}>Chưa có tin nhắn. Gửi vị trí cổng / giờ hẹn tại đây.</Text>
        ) : chat.slice(-12).map((m) => {
          const mine = m.from === from;
          return (
            <View key={m.id} style={[st.bubble, mine ? st.bubbleMine : st.bubbleOther]}>
              <Text style={{ color: mine ? '#fff' : C.ink, lineHeight: 19 }}>{m.text}</Text>
              <Text style={{ color: mine ? 'rgba(255,255,255,0.75)' : C.muted, fontSize: 11, marginTop: 4 }}>
                {m.from === 'tech' ? 'Thợ' : 'Khách'} · {fmtDateTime(m.at)}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={st.composer}>
        <TextInput
          style={st.input}
          value={text}
          onChangeText={setText}
          placeholder={role === 'tech' ? 'Nhắn khách…' : 'Nhắn thợ…'}
          placeholderTextColor={C.faint}
          onSubmitEditing={send}
        />
        <Btn title="Gửi" small style={{ minWidth: 72 }} onPress={send} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {(role === 'tech'
          ? ['Em đang trên đường ạ', 'Tới nơi trong 5 phút', 'Cho em hỏi số nhà giúp ạ']
          : ['Cổng màu xanh', 'Gọi khi tới nhé', 'Ok anh']
        ).map((q) => (
          <Tap key={q} style={st.quick} onPress={() => a.sendOrderChat(order.code, q, from)}>
            <Text style={{ fontSize: 12, color: C.primary, fontWeight: '700' }}>{q}</Text>
          </Tap>
        ))}
      </View>
    </Card>
  );
}

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
  chatBox: { maxHeight: 220, gap: 8 },
  bubble: { maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#F1F4F9', borderBottomLeftRadius: 4 },
  composer: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  input: {
    flex: 1, minHeight: 40, borderWidth: 1, borderColor: C.line, borderRadius: 12,
    paddingHorizontal: 12, color: C.ink, backgroundColor: '#fff',
  },
  quick: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: C.primarySoft },
});
