import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Platform, Animated, Easing,
} from 'react-native';
import { C, R, shadow, toneOf, STATUS_META, grad } from '../../theme';
import { formatVND, discountOf, isEstimate, isClean, durationText } from '../../constants/data';
import { useApp } from '../../context';

const webTapStyle = Platform.select({
  web: {
    cursor: 'pointer',
    userSelect: 'none',
    transitionProperty: 'transform, opacity, background-color, border-color, box-shadow',
    transitionDuration: '150ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  default: {},
});

export function Tap({ style, children, disabled, onPressIn, onPressOut, scaleTo = 0.97, ...rest }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled}
      onPressIn={(e) => { setPressed(true); onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e); }}
      style={[
        webTapStyle,
        style,
        pressed && { transform: [{ scale: scaleTo }] },
        disabled && Platform.OS === 'web' ? { cursor: 'not-allowed' } : null,
      ]}
      {...rest}
    >
      {children}
    </TouchableOpacity>
  );
}

// ------------------------------------------------------------------ Buttons
export function Btn({ title, onPress, variant = 'primary', small, style, disabled, icon, textStyle }) {
  const v = BTN[variant] || BTN.primary;
  const [pressed, setPressed] = React.useState(false);
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      style={[
        ui.btn,
        small && ui.btnSm,
        v.box,
        webTapStyle,
        style,
        pressed && !disabled && { transform: [{ scale: 0.97 }] },
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon ? <Text style={[ui.btnIcon, small && { fontSize: 13 }, v.text]}>{icon}</Text> : null}
      <Text style={[ui.btnText, small && ui.btnTextSm, v.text, textStyle]} numberOfLines={1}>{title}</Text>
    </TouchableOpacity>
  );
}
const BTN = {
  primary: { box: { backgroundColor: C.primary, ...grad.primaryBtn, ...shadow.primary }, text: { color: '#fff' } },
  dark: { box: { backgroundColor: C.navy, ...grad.navyCard, ...shadow.md }, text: { color: '#fff' } },
  gold: { box: { backgroundColor: C.primary, ...grad.primaryBtn, ...shadow.primary }, text: { color: '#fff' } },
  soft: { box: { backgroundColor: C.primarySoft, borderWidth: 1, borderColor: '#D6E4FF' }, text: { color: C.primary } },
  ghost: { box: { backgroundColor: '#F1F5F9' }, text: { color: C.ink2 } },
  outline: { box: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line }, text: { color: C.ink } },
  danger: { box: { backgroundColor: C.red, ...grad.dangerBtn }, text: { color: '#fff' } },
  dangerSoft: { box: { backgroundColor: C.redSoft, borderWidth: 1, borderColor: '#FAD4D0' }, text: { color: C.red } },
};

export function IconBtn({ icon, onPress, badge, dark, style, size = 40, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={label}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: dark ? 'rgba(255,255,255,0.14)' : '#F1F5F9',
          borderWidth: dark ? 1 : 0,
          borderColor: dark ? 'rgba(255,255,255,0.16)' : 'transparent',
        },
        webTapStyle,
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.42, color: dark ? '#fff' : C.ink }}>{icon}</Text>
      {badge ? (
        <View style={[ui.badge, dark && { borderColor: C.navy }]}><Text style={ui.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>
      ) : null}
    </TouchableOpacity>
  );
}

// ------------------------------------------------------------------ Layout
export function Card({ children, style, onPress }) {
  if (onPress) return <Tap onPress={onPress} scaleTo={0.985} style={[ui.card, style]}>{children}</Tap>;
  return <View style={[ui.card, style]}>{children}</View>;
}

export function IconBox({ icon, size = 44, bg = C.primarySoft, radius, style }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: radius ?? size * 0.34, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: size * 0.46 }}>{icon}</Text>
    </View>
  );
}

export function TopBar({ title, sub, onBack, right }) {
  const { nav } = useApp();
  return (
    <View style={ui.topBar}>
      <IconBtn icon="‹" onPress={onBack || nav.back} size={38} label="Quay lại" style={{ backgroundColor: '#F1F5F9' }} />
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
        <Text style={ui.topBarTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={ui.topBarSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <View style={{ minWidth: 38, alignItems: 'flex-end' }}>{right || null}</View>
    </View>
  );
}

export function PageHead({ title, sub, right }) {
  return (
    <View style={ui.pageHead}>
      <View style={{ flex: 1 }}>
        <Text style={ui.pageHeadTitle}>{title}</Text>
        {sub ? <Text style={ui.pageHeadSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, style }) {
  return (
    <View style={[ui.sectionRow, style]}>
      <Text style={ui.section}>{title}</Text>
      {action ? <Tap onPress={onAction} hitSlop={8}><Text style={ui.link}>{action} ›</Text></Tap> : null}
    </View>
  );
}

export function Divider({ style }) { return <View style={[{ height: 1, backgroundColor: C.line }, style]} />; }

// ------------------------------------------------------------------ Bits
export function Chip({ label, icon, on, onPress, style }) {
  return (
    <Tap onPress={onPress} scaleTo={0.95} style={[ui.chip, on && ui.chipOn, style]}>
      {icon ? <Text style={{ fontSize: 14, marginRight: 6 }}>{icon}</Text> : null}
      <Text style={[ui.chipText, on && ui.chipTextOn]}>{label}</Text>
    </Tap>
  );
}

export function Pills({ items, value, onChange, style, contentStyle }) {
  const ref = React.useRef(null);
  const pos = React.useRef({});
  React.useEffect(() => {
    const x = pos.current[value];
    if (x != null) ref.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [value]);
  return (
    <HScroll ref={ref} style={style} contentContainerStyle={[{ paddingHorizontal: 16, gap: 8 }, contentStyle]}>
      {items.map((it) => (
        <View key={it.id} onLayout={(e) => { pos.current[it.id] = e.nativeEvent.layout.x; }}>
          <Chip label={it.label} icon={it.icon} on={value === it.id} onPress={() => onChange(it.id)} />
        </View>
      ))}
    </HScroll>
  );
}

// ScrollView ngang. Trên web: kéo bằng chuột + lăn chuột để cuộn ngang
export const HScroll = React.forwardRef(({ children, style, contentContainerStyle, ...rest }, outerRef) => {
  const ref = React.useRef(null);
  React.useImperativeHandle(outerRef, () => ref.current);
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const node = ref.current?.getScrollableNode?.() || ref.current;
    if (!node || !node.addEventListener) return undefined;
    let down = false;
    let dragged = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e) => {
      if (e.button !== 0) return;
      down = true; dragged = false; startX = e.clientX; startLeft = node.scrollLeft;
    };
    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) > 5) { dragged = true; node.style.cursor = 'grabbing'; }
      if (dragged) { node.scrollLeft = startLeft - dx; e.preventDefault(); }
    };
    const onUp = () => { down = false; node.style.cursor = ''; };
    const onClick = (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } };
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = node.scrollWidth - node.clientWidth;
      if (max <= 0) return;
      const next = node.scrollLeft + e.deltaY;
      if ((e.deltaY < 0 && node.scrollLeft <= 0) || (e.deltaY > 0 && node.scrollLeft >= max)) return;
      node.scrollLeft = Math.min(max, Math.max(0, next));
      e.preventDefault();
    };
    node.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    node.addEventListener('click', onClick, true);
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('wheel', onWheel);
    };
  }, []);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ flexGrow: 0 }, style]}
      contentContainerStyle={contentContainerStyle}
      {...rest}
    >
      {children}
    </ScrollView>
  );
});

export function Segmented({ items, value, onChange, style }) {
  return (
    <View style={[ui.segment, style]}>
      {items.map((it) => {
        const on = value === it.id;
        return (
          <Tap key={it.id} onPress={() => onChange(it.id)} scaleTo={0.97} style={[ui.segmentItem, on && ui.segmentOn]}>
            <Text style={[ui.segmentText, on && ui.segmentTextOn]} numberOfLines={1}>{it.label}{it.count ? ` (${it.count})` : ''}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

export function Badge({ text, fg = C.primary, bg = C.primarySoft, style }) {
  return <View style={[ui.pill, { backgroundColor: bg }, style]}><Text style={[ui.pillText, { color: fg }]}>{text}</Text></View>;
}

export function StatusChip({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return <Badge text={m.label} fg={m.fg} bg={m.bg} />;
}

export function Stars({ value = 5, size = 12, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 8 : 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} onPress={onChange ? () => onChange(i) : undefined} style={[{ fontSize: size, color: i <= value ? '#F5A623' : '#D9DEE7' }, onChange && webTapStyle]}>★</Text>
      ))}
    </View>
  );
}

export function Progress({ value, color = C.primary, style }) {
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <View style={[{ height: 7, borderRadius: 4, backgroundColor: '#E8EEF6', overflow: 'hidden' }, style]}>
      <View
        style={[
          { width: pct, height: '100%', backgroundColor: color, borderRadius: 4 },
          Platform.OS === 'web' ? { transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)' } : null,
        ]}
      />
    </View>
  );
}

export function Radio({ on }) {
  return <View style={[ui.radio, on && ui.radioOn]}>{on ? <View style={ui.radioDot} /> : null}</View>;
}

export function Checkbox({ on, label, onPress }) {
  return (
    <Tap onPress={onPress} scaleTo={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
      <View style={[ui.checkbox, on && ui.checkboxOn]}>{on ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text> : null}</View>
      <Text style={{ fontSize: 14, color: C.ink, fontWeight: '500' }}>{label}</Text>
    </Tap>
  );
}

export function Stepper({ value, onChange, min = 1 }) {
  return (
    <View style={ui.stepper}>
      <Tap style={ui.stepBtn} scaleTo={0.9} onPress={() => onChange(Math.max(min, value - 1))} hitSlop={6}><Text style={ui.stepMark}>−</Text></Tap>
      <Text style={ui.stepVal}>{value}</Text>
      <Tap style={[ui.stepBtn, { backgroundColor: C.primarySoft }]} scaleTo={0.9} onPress={() => onChange(value + 1)} hitSlop={6}><Text style={[ui.stepMark, { color: C.primary }]}>+</Text></Tap>
    </View>
  );
}

export function Field({ label, error, style, inputStyle, ...rest }) {
  return (
    <View style={style}>
      {label ? <Text style={ui.fieldLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.faint} style={[ui.input, rest.multiline && ui.inputMulti, error && { borderColor: '#F7A39C' }, inputStyle]} {...rest} />
      {error ? <Text style={ui.fieldErr}>{error}</Text> : null}
    </View>
  );
}

export function SelectRow({ label, value, placeholder, onPress, icon }) {
  return (
    <View>
      {label ? <Text style={ui.fieldLabel}>{label}</Text> : null}
      <Tap onPress={onPress} scaleTo={0.985} style={ui.selectRow}>
        {icon ? <Text style={{ fontSize: 16, marginRight: 10 }}>{icon}</Text> : null}
        <Text style={[{ flex: 1, fontSize: 15, color: value ? C.ink : C.faint }]} numberOfLines={1}>{value || placeholder}</Text>
        <Text style={ui.chevron}>›</Text>
      </Tap>
    </View>
  );
}

export function ListRow({ icon, iconBg, label, sub, value, onPress, danger, last, right }) {
  return (
    <Tap onPress={onPress} scaleTo={0.99} style={[ui.listRow, !last && ui.listDivider]}>
      {icon ? <IconBox icon={icon} size={38} bg={iconBg || '#F1F5F9'} radius={12} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[ui.listLabel, danger && { color: C.red }]}>{label}</Text>
        {sub ? <Text style={ui.meta} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right || (value ? <Text style={ui.listValue}>{value}</Text> : null)}
      {right ? null : <Text style={ui.chevron}>›</Text>}
    </Tap>
  );
}

export function EmptyState({ icon, title, body, action, onAction, style }) {
  return (
    <View style={[ui.empty, style]}>
      <View style={ui.emptyIcon}><Text style={{ fontSize: 38 }}>{icon}</Text></View>
      <Text style={ui.emptyTitle}>{title}</Text>
      {body ? <Text style={ui.emptyBody}>{body}</Text> : null}
      {action ? <Btn title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: 20 }} /> : null}
    </View>
  );
}

export function Price({ value, old, size = 15, row }) {
  return (
    <View style={row ? { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' } : null}>
      <Text style={[ui.price, { fontSize: size }]}>{formatVND(value)}</Text>
      {old ? <Text style={[ui.oldPrice, { fontSize: Math.max(11, size - 4) }]}>{formatVND(old)}</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------------ Service visuals
export function Media({ item, height, width, radius = 0, iconSize }) {
  const tone = toneOf(item?.category);
  const fs = iconSize || (height >= 180 ? 74 : height >= 100 ? 44 : 26);
  const emblemSize = height >= 180 ? 116 : height >= 100 ? 68 : 42;
  return (
    <View
      style={[
        {
          height,
          width: width || '100%',
          borderRadius: radius,
          backgroundColor: tone.bg,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        Platform.OS === 'web' && tone.grad ? { backgroundImage: tone.grad } : null,
      ]}
    >
      <View style={{ position: 'absolute', width: height * 1.15, height: height * 1.15, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.52)', top: -height * 0.45, right: -height * 0.32 }} />
      <View style={{ position: 'absolute', width: height * 0.65, height: height * 0.65, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.38)', bottom: -height * 0.25, left: -height * 0.15 }} />
      <View
        style={{
          width: emblemSize,
          height: emblemSize,
          borderRadius: emblemSize * 0.36,
          backgroundColor: 'rgba(255,255,255,0.68)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.9)',
          alignItems: 'center',
          justifyContent: 'center',
          ...shadow.sm,
        }}
      >
        <Text style={{ fontSize: fs }}>{item?.icon || '🔧'}</Text>
      </View>
    </View>
  );
}

export function ServiceCard({ item, style }) {
  const { a, nav } = useApp();
  const discount = discountOf(item);
  return (
    <Tap scaleTo={0.975} style={[ui.sCard, style]} onPress={() => nav.push('detail', { id: item.id })}>
      <View>
        <Media item={item} height={110} />
        {discount > 0 ? <View style={ui.offTag}><Text style={ui.offTagText}>-{discount}%</Text></View> : null}
        <View style={ui.warrantyTag}><Text style={ui.warrantyTagText}>🛡 BH 60 ngày</Text></View>
      </View>
      <View style={{ padding: 11, flex: 1 }}>
        <Text numberOfLines={2} style={ui.sCardName}>{item.name}</Text>
        <Text numberOfLines={1} style={ui.meta}>
          {item.rating ? `★ ${item.rating}` : '✦ Mới'}{item.sold ? ` · ${item.sold.replace('Đã bán ', '')} đã đặt` : ''}
        </Text>
        {isEstimate(item) ? <Text style={ui.estimate}>Giá tham khảo</Text> : isClean(item) ? <Text style={ui.cleanLine}>Bao sạch · {durationText(item.id)}</Text> : <Text style={ui.cleanLine}> </Text>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={ui.price}>{formatVND(item.price)}</Text>
            {item.oldPrice ? <Text style={ui.oldPrice}>{formatVND(item.oldPrice)}</Text> : <Text style={[ui.oldPrice, { textDecorationLine: 'none' }]}> </Text>}
          </View>
          <Tap style={ui.addBtn} scaleTo={0.9} onPress={() => a.addToCart(item.id)} accessibilityLabel="Thêm vào giỏ" hitSlop={6}>
            <Text style={ui.addBtnText}>+</Text>
          </Tap>
        </View>
      </View>
    </Tap>
  );
}

export function ServiceGrid({ data, style }) {
  return (
    <View style={[ui.grid, style]}>
      {data.map((item) => <View key={item.id} style={ui.gridItem}><ServiceCard item={item} style={{ flex: 1 }} /></View>)}
    </View>
  );
}

export function ServiceRow({ item, right, onPress }) {
  const { nav } = useApp();
  return (
    <Tap scaleTo={0.985} style={ui.sRow} onPress={onPress || (() => nav.push('detail', { id: item.id }))}>
      <Media item={item} height={64} width={64} radius={16} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={ui.sRowName}>{item.name}</Text>
        <Price value={item.price} old={item.oldPrice} size={14} row />
      </View>
      {right}
    </Tap>
  );
}

// ------------------------------------------------------------------ Overlays
export const FrameCtx = React.createContext(null);
const frameBox = (rect) => (rect ? { position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderRadius: 30, overflow: 'hidden' } : { flex: 1 });

export function Sheet({ visible, onClose, title, children, footer }) {
  const rect = React.useContext(FrameCtx);
  const slide = useRef(new Animated.Value(60)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      slide.setValue(48);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.spring(slide, { toValue: 0, speed: 24, bounciness: 4, useNativeDriver: false }),
      ]).start();
    }
  }, [visible, slide, fade]);
  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={frameBox(rect)}>
        <View style={ui.modalWrap}>
          <Animated.View style={[ui.backdrop, { opacity: fade }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          </Animated.View>
          <Animated.View style={[ui.sheet, { transform: [{ translateY: slide }] }]}>
            <View style={ui.handle} />
            <View style={ui.sheetHead}>
              <Text style={ui.sheetTitle}>{title}</Text>
              <IconBtn icon="✕" size={32} onPress={onClose} label="Đóng" />
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: footer ? 8 : 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingTop: 8, paddingBottom: 20 }}>{footer}</View> : null}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

export function DialogHost() {
  const { ui: u } = useApp();
  const rect = React.useContext(FrameCtx);
  const scale = useRef(new Animated.Value(0.92)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const cfg = u.dialogCfg;
  useEffect(() => {
    if (cfg) {
      scale.setValue(0.92);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: false }),
        Animated.spring(scale, { toValue: 1, speed: 28, bounciness: 6, useNativeDriver: false }),
      ]).start();
    }
  }, [cfg, scale, fade]);
  if (!cfg) return null;
  const actions = cfg.actions || [{ label: 'Đóng', variant: 'primary' }];
  return (
    <Modal visible transparent animationType="none" onRequestClose={u.closeDialog}>
      <View style={frameBox(rect)}>
        <View style={ui.dialogWrap}>
          <Animated.View style={[ui.backdrop, { opacity: fade }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={u.closeDialog} />
          </Animated.View>
          <Animated.View style={[ui.dialog, { opacity: fade, transform: [{ scale }] }]}>
            {cfg.icon ? <IconBox icon={cfg.icon} size={58} bg={C.primarySoft} radius={20} style={{ alignSelf: 'center', marginBottom: 14 }} /> : null}
            <Text style={ui.dialogTitle}>{cfg.title}</Text>
            {cfg.message ? <Text style={ui.dialogBody}>{cfg.message}</Text> : null}
            {cfg.content || null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              {actions.map((ac) => (
                <Btn
                  key={ac.label}
                  title={ac.label}
                  variant={ac.variant || 'primary'}
                  style={{ flex: 1, minHeight: 46 }}
                  onPress={() => { u.closeDialog(); ac.onPress?.(); }}
                />
              ))}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

export function ToastHost() {
  const { ui: u } = useApp();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!u.toastMsg) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [u.toastMsg?.id]);
  if (!u.toastMsg) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return (
    <Animated.View style={[ui.toast, { opacity: anim, transform: [{ translateY }] }]} pointerEvents="none">
      <View style={ui.toastIconWrap}>
        <Text style={{ fontSize: 13, color: '#fff', fontWeight: '900' }}>{u.toastMsg.icon}</Text>
      </View>
      <Text style={ui.toastText}>{u.toastMsg.text}</Text>
    </Animated.View>
  );
}

// Mã QR minh hoạ (sinh lưới ô vuông theo chuỗi)
export function PseudoQR({ value, size = 200 }) {
  const n = 21;
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const finder = (r, c) => {
    const inBox = (r0, c0) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    const boxes = [[0, 0], [0, n - 7], [n - 7, 0]];
    for (const [r0, c0] of boxes) {
      if (inBox(r0, c0)) {
        const rr = r - r0; const cc = c - c0;
        return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) ? 1 : 0;
      }
    }
    return -1;
  };
  const cell = size / n;
  const rows = [];
  for (let r = 0; r < n; r += 1) {
    const cols = [];
    for (let c = 0; c < n; c += 1) {
      const f = finder(r, c);
      const on = f === -1 ? rand() > 0.52 : f === 1;
      cols.push(<View key={c} style={{ width: cell, height: cell, backgroundColor: on ? C.navy : '#fff' }} />);
    }
    rows.push(<View key={r} style={{ flexDirection: 'row' }}>{cols}</View>);
  }
  return <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line }}>{rows}</View>;
}

// ------------------------------------------------------------------ Styles
const webNoOutline = Platform.select({ web: { outlineStyle: 'none' }, default: {} });

export const ui = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  btnSm: {
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  btnTextSm: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  btnIcon: { fontSize: 14, marginRight: 5 },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 16, ...shadow.sm, borderWidth: 1, borderColor: 'rgba(226,232,240,0.95)' },
  topBar: { height: 58, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, ...shadow.sm },
  topBarTitle: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  topBarSub: { fontSize: 12, color: C.muted, marginTop: 1, fontWeight: '600' },
  pageHead: { backgroundColor: '#fff', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  pageHeadTitle: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -0.5 },
  pageHeadSub: { color: C.muted, marginTop: 3, fontSize: 13, fontWeight: '500' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  link: { color: C.primary, fontWeight: '700', fontSize: 13 },
  meta: { color: C.muted, fontSize: 12, marginTop: 3, fontWeight: '500' },
  price: { color: C.red, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  oldPrice: { color: C.faint, fontSize: 11, textDecorationLine: 'line-through', marginTop: 1 },
  cleanLine: { color: C.green, fontSize: 11, fontWeight: '700', marginTop: 4 },
  estimate: { color: C.orange, fontSize: 11, fontWeight: '700', marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, height: 36 },
  chipOn: { backgroundColor: C.navy, borderColor: C.navy, ...shadow.sm },
  chipText: { color: C.ink2, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: '#E3E9F2', borderRadius: 14, padding: 4 },
  segmentItem: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentOn: { backgroundColor: '#fff', ...shadow.sm },
  segmentText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  segmentTextOn: { color: C.ink, fontWeight: '800' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '800' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.primary },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#CBD3DF', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.primary, borderColor: C.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 999, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', ...shadow.sm },
  stepMark: { fontSize: 17, color: C.ink, fontWeight: '700', lineHeight: 20 },
  stepVal: { minWidth: 28, textAlign: 'center', fontWeight: '800', color: C.ink, fontSize: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: C.ink2, marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 14, minHeight: 52, fontSize: 15, color: C.ink, ...webNoOutline },
  inputMulti: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  fieldErr: { color: C.red, fontSize: 12, marginTop: 6, fontWeight: '500' },
  selectRow: { minHeight: 52, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  chevron: { color: C.faint, fontSize: 22, lineHeight: 24, marginLeft: 6 },
  listRow: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  listDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8EEF5' },
  listLabel: { fontSize: 15, color: C.ink, fontWeight: '700' },
  listValue: { color: C.muted, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 44 },
  emptyIcon: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.md, borderWidth: 1, borderColor: '#EEF2F7' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 18, textAlign: 'center', letterSpacing: -0.2 },
  emptyBody: { color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 21, fontSize: 14 },
  sCard: { backgroundColor: '#fff', borderRadius: R.lg, overflow: 'hidden', ...shadow.sm, borderWidth: 1, borderColor: 'rgba(226,232,240,0.95)' },
  sCardName: { fontSize: 13, fontWeight: '700', color: C.ink, lineHeight: 18, minHeight: 36 },
  offTag: { position: 'absolute', left: 8, top: 8, backgroundColor: C.red, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, ...shadow.sm },
  offTagText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  favBtn: { position: 'absolute', right: 8, top: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  warrantyTag: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, ...shadow.sm },
  warrantyTagText: { color: C.green, fontSize: 10, fontWeight: '800' },
  addBtn: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.primary, ...grad.primaryBtn, alignItems: 'center', justifyContent: 'center', ...shadow.primary },
  addBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  gridItem: { width: '48.4%' },
  sRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: R.lg, padding: 10, marginBottom: 10, ...shadow.sm, borderWidth: 1, borderColor: 'rgba(226,232,240,0.95)' },
  sRowName: { fontSize: 14, fontWeight: '700', color: C.ink, lineHeight: 19, marginBottom: 4 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,26,58,0.55)' },
  sheet: { width: '100%', maxWidth: 430, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, maxHeight: '88%', ...shadow.lg },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D8DEE8', alignSelf: 'center', marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.ink, flex: 1, letterSpacing: -0.2 },
  dialogWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 24, padding: 22, ...shadow.lg },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: C.ink, textAlign: 'center' },
  dialogBody: { fontSize: 14, color: C.ink2, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 94, backgroundColor: 'rgba(7,26,58,0.96)', paddingLeft: 10, paddingRight: 18, paddingVertical: 9, borderRadius: 999, flexDirection: 'row', alignItems: 'center', zIndex: 100, ...shadow.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  toastIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  toastText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
});

export const isWeb = Platform.OS === 'web';
