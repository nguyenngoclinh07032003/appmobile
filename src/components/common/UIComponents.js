import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Platform, Animated, Easing, KeyboardAvoidingView,
} from 'react-native';
import { C, R, shadow, toneOf, STATUS_META, grad } from '../../theme';
import { formatVND, discountOf, isEstimate, isClean, durationText } from '../../constants/data';
import { formatMinutesToSlotStr } from '../../utils/dateTime';
import { useApp } from '../../context';
import { AppIcon, resolveIconColor } from './AppIcon';

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

export function Tap({ style, children, disabled, onPress, onPressIn, onPressOut, scaleTo = 0.97, ...rest }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled}
      onPress={onPress ? (e) => { e?.stopPropagation?.(); onPress(e); } : undefined}
      onPressIn={(e) => { e?.stopPropagation?.(); setPressed(true); onPressIn?.(e); }}
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
      onPress={onPress ? (e) => { e?.stopPropagation?.(); onPress(e); } : undefined}
      onPressIn={(e) => { e?.stopPropagation?.(); setPressed(true); }}
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
      {icon ? <AppIcon icon={icon} size={small ? 14 : 17} color={v.text.color} strokeWidth={2.2} /> : null}
      <Text style={[ui.btnText, small && ui.btnTextSm, v.text, textStyle]} numberOfLines={1}>{title}</Text>
    </TouchableOpacity>
  );
}
const BTN = {
  primary: { box: { backgroundColor: C.primary, ...grad.primaryBtn, ...shadow.primary }, text: { color: C.card } },
  dark: { box: { backgroundColor: C.navy, ...grad.navyCard, ...shadow.md }, text: { color: C.card } },
  gold: { box: { backgroundColor: C.gold, ...grad.warningBtn, ...shadow.gold }, text: { color: C.card } },
  warning: { box: { backgroundColor: C.gold, ...grad.warningBtn, ...shadow.gold }, text: { color: C.card } },
  warningSoft: { box: { backgroundColor: C.goldSoft, borderWidth: 1, borderColor: C.goldBorder }, text: { color: C.goldInk } },
  success: { box: { backgroundColor: C.green, ...grad.successBtn, ...shadow.success }, text: { color: C.card } },
  successSoft: { box: { backgroundColor: C.greenSoft, borderWidth: 1, borderColor: C.greenBorder }, text: { color: C.greenInk } },
  soft: { box: { backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryBorder }, text: { color: C.primary } },
  ghost: { box: { backgroundColor: C.surface }, text: { color: C.ink2 } },
  outline: { box: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line }, text: { color: C.ink } },
  danger: { box: { backgroundColor: C.red, ...grad.dangerBtn, ...shadow.danger }, text: { color: C.card } },
  dangerSoft: { box: { backgroundColor: C.redSoft, borderWidth: 1, borderColor: C.redBorder }, text: { color: C.redInk } },
};

// Hệ thống phân loại 3 màu ngữ nghĩa:
// - Đỏ (danger): Thông báo nguy hiểm / lỗi / huỷ / xoá / từ chối
// - Vàng (warning): Alert thường / cảnh báo / nhắc nhở / chờ duyệt
// - Xanh lá (success): Hoàn thành / thành công / đã duyệt
export function resolveSemanticTone({ tone, title = '', message = '', text = '', icon = '', danger = false, fallback = 'warning' } = {}) {
  const combined = `${title} ${message} ${text}`.toLowerCase();
  const ic = String(icon || '').trim().toLowerCase();

  const hasExplicitTone = ['success', 'info', 'warning'].includes(tone);
  const isDanger =
    tone === 'danger' ||
    tone === 'error' ||
    danger === true ||
    (!hasExplicitTone && (
      ['🚫', '❌', '✖️', '✖', '🗑️', '🗑', '↩️', 'ban', 'x-circle', 'trash-2', 'shield-alert'].includes(ic) ||
      /lỗi|không hợp lệ|không khớp|không thể|sai phân quyền|từ chối|đã huỷ|huỷ đơn|xoá tài khoản|vĩnh viễn|nguy hiểm|quá hạn|vi phạm|bị khoá|thất bại|trả việc|trừ \d+ điểm/i.test(combined)
    ));

  if (isDanger) {
    return {
      key: 'danger',
      label: 'Nguy hiểm / Lỗi',
      fg: C.redInk,
      accent: C.red,
      bg: C.redSoft,
      unreadBg: C.card,
      border: C.redBorder,
      icon: icon || 'alert-triangle',
      btnVariant: 'danger',
    };
  }

  const isSuccess =
    tone === 'success' ||
    ['✅', '✓', '🎉', '👍', '🟢', '💸', 'check', 'check-circle-2', 'party-popper', 'thumbs-up', 'shield-check'].includes(ic) ||
    /thành công|hoàn thành|hoàn tất|đã duyệt|đã đồng ý|đã lưu|đã nhận việc|đã nhận đơn|đã xác nhận|đã xác thực|đã thanh toán|mới nhất|đã đồng bộ|đã sao chép|cảm ơn|đánh giá [45]★/i.test(combined);

  if (isSuccess && tone !== 'warning' && tone !== 'info') {
    return {
      key: 'success',
      label: 'Hoàn thành',
      fg: C.greenInk,
      accent: C.green,
      bg: C.greenSoft,
      unreadBg: C.card,
      border: C.greenBorder,
      icon: icon || 'check-circle-2',
      btnVariant: 'success',
    };
  }

  const isWarning =
    tone !== 'info' && (
      tone === 'warning' ||
      tone === 'alert' ||
      fallback === 'warning' ||
      ['⚠️', '⚠', '⏰', '⏳', '🔔', '📝', '✏️', '🔄', '🧾', 'alert-triangle', 'clock', 'timer', 'bell'].includes(ic) ||
      /cảnh báo|thiếu|chưa|chờ|lưu ý|nhắc|phát sinh|muộn|trễ|tối thiểu|giới hạn|báo giá|kiểm tra|tạm ngưng|đổi lịch/i.test(combined)
    );

  if (isWarning) {
    return {
      key: 'warning',
      label: 'Cảnh báo',
      fg: C.goldInk,
      accent: C.gold,
      bg: C.goldSoft,
      unreadBg: C.card,
      border: C.goldBorder,
      icon: icon || 'alert-triangle',
      btnVariant: 'warning',
    };
  }

  return {
    key: 'info',
    label: 'Thông báo',
    fg: C.primary,
    accent: C.primary,
    bg: C.primarySoft,
    unreadBg: C.card,
    border: C.primaryBorder,
    icon: icon || 'bell',
    btnVariant: 'primary',
  };
}

export function IconBtn({ icon, onPress, badge, dark, style, size = 40, label, iconColor }) {
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
          backgroundColor: dark ? 'rgba(255,255,255,0.14)' : C.surface,
          borderWidth: dark ? 1 : 0,
          borderColor: dark ? 'rgba(255,255,255,0.16)' : 'transparent',
        },
        webTapStyle,
        style,
      ]}
    >
      <AppIcon icon={icon} size={Math.round(size * 0.46)} color={iconColor || (dark ? '#fff' : C.ink)} strokeWidth={2.2} />
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

export function IconBox({ icon, size = 44, bg = C.primarySoft, color, radius, style }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: radius ?? size * 0.34, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <AppIcon icon={icon} size={Math.round(size * 0.48)} color={color || resolveIconColor(bg, C.primary)} strokeWidth={2.1} />
    </View>
  );
}

export function TopBar({ title, sub, onBack, right }) {
  const { nav } = useApp();
  return (
    <View style={ui.topBar}>
      <IconBtn icon="‹" onPress={onBack || nav.back} size={38} label="Quay lại" style={{ backgroundColor: C.surface }} />
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
      {icon ? <AppIcon icon={icon} size={15} color={on ? '#fff' : C.primary} strokeWidth={2.1} style={{ marginRight: 6 }} /> : null}
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
  const compact = items.length >= 4;
  return (
    <View style={[ui.segment, style]}>
      {items.map((it) => {
        const on = value === it.id;
        return (
          <Tap
            key={it.id}
            onPress={() => onChange(it.id)}
            scaleTo={0.97}
            style={[
              ui.segmentItem,
              compact && { height: 'auto', minHeight: 44, paddingVertical: 5, paddingHorizontal: 2 },
              on && ui.segmentOn,
            ]}
          >
            {compact ? (
              <>
                <Text style={[ui.segmentText, { fontSize: 11.5 }, on && ui.segmentTextOn]} numberOfLines={1}>{it.label}</Text>
                {it.count != null ? (
                  <Text style={{ fontSize: 10.5, fontWeight: on ? '800' : '600', color: on ? C.primary : C.faint, marginTop: 1 }}>
                    {it.count}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={[ui.segmentText, on && ui.segmentTextOn]} numberOfLines={1}>{it.label}{it.count ? ` (${it.count})` : ''}</Text>
            )}
          </Tap>
        );
      })}
    </View>
  );
}

export function Badge({ text, fg = C.primary, bg = C.primarySoft, style }) {
  return <View style={[ui.pill, { backgroundColor: bg }, style]}><Text style={[ui.pillText, { color: fg }]}>{text}</Text></View>;
}

export function StatusChip({ status, meta }) {
  const m = meta || STATUS_META[status] || STATUS_META.pending;
  return <Badge text={m.label} fg={m.fg} bg={m.bg} />;
}

export function Stars({ value = 5, size = 12, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 8 : 2, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const active = i <= value;
        const star = (
          <AppIcon
            name="star"
            size={size + 2}
            color={active ? C.gold : C.line}
            fill={active ? C.gold : 'none'}
            strokeWidth={2}
          />
        );
        return onChange ? (
          <Tap key={i} onPress={() => onChange(i)} scaleTo={0.9}>{star}</Tap>
        ) : (
          <View key={i}>{star}</View>
        );
      })}
    </View>
  );
}

export function Progress({ value, color = C.primary, style }) {
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <View style={[{ height: 7, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }, style]}>
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

export function Checkbox({ on, label, onPress, style }) {
  return (
    <Tap onPress={onPress} scaleTo={0.98} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }, style]}>
      <View style={[ui.checkbox, on && ui.checkboxOn]}>{on ? <AppIcon name="check" size={14} color="#fff" strokeWidth={3} /> : null}</View>
      <Text style={{ fontSize: 14, color: C.ink, fontWeight: '500', flex: 1 }}>{label}</Text>
    </Tap>
  );
}

export function Stepper({ value, onChange, min = 1, max = null }) {
  return (
    <View style={ui.stepper}>
      <Tap
        style={[ui.stepBtn, value <= min && { opacity: 0.45 }]}
        scaleTo={0.9}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        hitSlop={6}
      >
        <AppIcon name="minus" size={14} color={C.ink} strokeWidth={2.5} />
      </Tap>
      <Text style={ui.stepVal}>{value}</Text>
      <Tap
        style={[ui.stepBtn, { backgroundColor: C.primarySoft }, max != null && value >= max && { opacity: 0.45 }]}
        scaleTo={0.9}
        disabled={max != null && value >= max}
        onPress={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
        hitSlop={6}
      >
        <AppIcon name="plus" size={14} color={C.primary} strokeWidth={2.5} />
      </Tap>
    </View>
  );
}

export function Field({ label, error, style, inputStyle, ...rest }) {
  return (
    <View style={style}>
      {label ? <Text style={ui.fieldLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.faint} style={[ui.input, rest.multiline && ui.inputMulti, error && { borderColor: C.red }, inputStyle]} {...rest} />
      {error ? <Text style={ui.fieldErr}>{error}</Text> : null}
    </View>
  );
}

export function SelectRow({ label, value, placeholder, onPress, icon }) {
  return (
    <View>
      {label ? <Text style={ui.fieldLabel}>{label}</Text> : null}
      <Tap onPress={onPress} scaleTo={0.985} style={ui.selectRow}>
        {icon ? <AppIcon icon={icon} size={18} color={C.primary} strokeWidth={2.1} style={{ marginRight: 10 }} /> : null}
        <Text style={[{ flex: 1, fontSize: 15, color: value ? C.ink : C.faint }]} numberOfLines={1}>{value || placeholder}</Text>
        <AppIcon name="chevron-right" size={18} color={C.faint} strokeWidth={2.2} style={{ marginLeft: 6 }} />
      </Tap>
    </View>
  );
}

export function ListRow({ icon, iconBg, label, sub, value, onPress, danger, last, right }) {
  return (
    <Tap onPress={onPress} scaleTo={0.99} style={[ui.listRow, !last && ui.listDivider]}>
      {icon ? (
        iconBg ? (
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <AppIcon icon={icon} size={18} color={danger ? C.red : resolveIconColor(iconBg, C.primary)} strokeWidth={2} />
          </View>
        ) : (
          <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
            <AppIcon icon={icon} size={22} color={danger ? C.red : C.ink2} strokeWidth={1.75} />
          </View>
        )
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[ui.listLabel, danger && { color: C.red }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={ui.meta} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right || (value ? <Text style={[ui.listValue, { maxWidth: '42%' }]} numberOfLines={1}>{value}</Text> : null)}
      {right ? null : <AppIcon name="chevron-right" size={18} color={C.faint} strokeWidth={2} style={{ marginLeft: 4 }} />}
    </Tap>
  );
}

export function EmptyState({ icon, title, body, action, onAction, style }) {
  return (
    <View style={[ui.empty, style]}>
      <View style={ui.emptyIcon}><AppIcon icon={icon || 'clipboard-list'} size={38} color={C.primary} strokeWidth={1.9} /></View>
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
      <View
        style={{
          width: emblemSize,
          height: emblemSize,
          borderRadius: emblemSize * 0.36,
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: C.line,
          alignItems: 'center',
          justifyContent: 'center',
          ...shadow.sm,
        }}
      >
        <AppIcon icon={item?.icon || 'wrench'} size={iconSize || Math.round(emblemSize * 0.5)} color={tone.fg || C.primary} strokeWidth={1.9} />
      </View>
    </View>
  );
}

export function ServiceCard({ item, style }) {
  const { a, nav } = useApp();
  const discount = discountOf(item);
  const warrantyLabel =
    item?.warrantyDays > 0
      ? `BH ${item.warrantyDays} ngày`
      : item?.warrantyDays === undefined && item?.warranty && item?.kind !== 'lifetime'
        ? item.warranty
        : '';
  return (
    <Tap scaleTo={0.975} style={[ui.sCard, style]} onPress={() => nav.push('detail', { id: item.id })}>
      <View>
        <Media item={item} height={110} />
        {discount > 0 ? <View style={ui.offTag}><Text style={ui.offTagText}>-{discount}%</Text></View> : null}
        {warrantyLabel ? (
          <View style={[ui.warrantyTag, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <AppIcon name="shield-check" size={11} color={C.primary} strokeWidth={2.4} />
            <Text style={ui.warrantyTagText}>{warrantyLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: 11, flex: 1 }}>
        <Text numberOfLines={2} style={ui.sCardName}>{item.name}</Text>
        {isEstimate(item) ? <Text style={ui.estimate}>Giá tham khảo</Text> : isClean(item) ? <Text style={ui.cleanLine}>Bao sạch · {durationText(item.id)}</Text> : <Text style={ui.cleanLine}> </Text>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={ui.price}>{formatVND(item.price)}</Text>
            {item.oldPrice ? <Text style={ui.oldPrice}>{formatVND(item.oldPrice)}</Text> : <Text style={[ui.oldPrice, { textDecorationLine: 'none' }]}> </Text>}
          </View>
          <Tap style={ui.addBtn} scaleTo={0.9} onPress={() => a.addToCart(item.id)} accessibilityLabel="Thêm vào giỏ" hitSlop={6}>
            <AppIcon name="plus" size={15} color="#fff" strokeWidth={2.6} />
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
        <KeyboardAvoidingView style={ui.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
        </KeyboardAvoidingView>
        {visible ? <ToastHost /> : null}
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
  const hasDangerAction = (cfg.actions || []).some((ac) => ac.variant === 'danger' || ac.variant === 'dangerSoft');
  const sem = resolveSemanticTone({
    tone: cfg.tone,
    title: cfg.title,
    message: cfg.message,
    icon: cfg.icon,
    danger: cfg.danger || hasDangerAction,
    fallback: cfg.fallbackTone || 'warning',
  });
  const actions = cfg.actions || [{ label: 'Đã hiểu', variant: sem.btnVariant }];
  const displayIcon = cfg.icon || sem.icon;
  const stacked = cfg.stacked !== false && !cfg.rowActions;
  const orderedActions = stacked && actions.length >= 2
    ? [
        ...actions.filter((ac) => ac.variant !== 'ghost' && ac.variant !== 'outline'),
        ...actions.filter((ac) => ac.variant === 'ghost' || ac.variant === 'outline'),
      ]
    : actions;

  return (
    <Modal visible transparent animationType="none" onRequestClose={u.closeDialog}>
      <View style={frameBox(rect)}>
        <View style={ui.dialogWrap}>
          <Animated.View style={[ui.backdrop, { opacity: fade }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={u.closeDialog} />
          </Animated.View>
          <Animated.View style={[ui.dialog, { opacity: fade, transform: [{ scale }] }]}>
            <View style={ui.dialogTopRow}>
              {displayIcon ? (
                <View style={[ui.dialogIconOuter, { backgroundColor: sem.bg }]}>
                  <View style={[ui.dialogIconInner, { backgroundColor: C.card }]}>
                    <AppIcon icon={displayIcon} size={22} color={sem.accent} strokeWidth={2.2} />
                  </View>
                </View>
              ) : <View />}
              <Tap onPress={u.closeDialog} hitSlop={10} style={ui.dialogCloseBtn} accessibilityLabel="Đóng">
                <AppIcon name="x" size={20} color={C.ink2} strokeWidth={2.2} />
              </Tap>
            </View>
            <Text style={ui.dialogTitle}>{cfg.title}</Text>
            {cfg.message ? <Text style={ui.dialogBody}>{cfg.message}</Text> : null}
            {cfg.content || null}
            <View style={[stacked ? { flexDirection: 'column', gap: 10, marginTop: 22 } : { flexDirection: 'row', gap: 10, marginTop: 22 }]}>
              {orderedActions.map((ac) => {
                const isCancelLike = ac.variant === 'ghost' || ac.variant === 'outline';
                const resolvedVariant = ac.variant === 'auto'
                  ? (cfg.danger || sem.key === 'danger' ? 'danger' : 'dark')
                  : isCancelLike && stacked
                    ? 'outline'
                    : (ac.variant || 'dark');
                return (
                  <Btn
                    key={ac.label}
                    title={ac.label}
                    variant={resolvedVariant}
                    style={[
                      stacked ? { width: '100%', minHeight: 48, borderRadius: 12 } : { flex: 1, minHeight: 46 },
                      isCancelLike && stacked ? { borderWidth: 1, borderColor: C.line, backgroundColor: C.card } : null,
                    ]}
                    textStyle={isCancelLike && stacked ? { color: C.ink2, fontWeight: '700' } : null}
                    onPress={() => { u.closeDialog(); ac.onPress?.(); }}
                  />
                );
              })}
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
  const sem = resolveSemanticTone({
    tone: u.toastMsg.tone,
    text: u.toastMsg.text,
    icon: u.toastMsg.icon,
    fallback: 'success',
  });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return (
    <Animated.View
      style={[
        ui.toast,
        {
          opacity: anim,
          transform: [{ translateY }],
          borderColor: sem.accent,
        },
      ]}
      pointerEvents="none"
    >
      <View style={[ui.toastIconWrap, { backgroundColor: sem.accent }]}>
        <AppIcon icon={u.toastMsg.icon || sem.icon || 'check'} size={14} color="#fff" strokeWidth={2.5} />
      </View>
      <Text style={ui.toastText}>{u.toastMsg.text}</Text>
    </Animated.View>
  );
}

// ------------------------------------------------------------------ Styles
const webNoOutline = Platform.select({ web: { outlineStyle: 'none' }, default: {} });

export const ui = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 6,
  },
  btnSm: {
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 11,
    gap: 5,
  },
  btnText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
    flexShrink: 1,
  },
  btnTextSm: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    flexShrink: 1,
  },
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
  price: { color: C.ink, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  oldPrice: { color: C.faint, fontSize: 11, textDecorationLine: 'line-through', marginTop: 1 },
  cleanLine: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  estimate: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, height: 36 },
  chipOn: { backgroundColor: C.navy, borderColor: C.navy, ...shadow.sm },
  chipText: { color: C.ink2, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 14, padding: 4 },
  segmentItem: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentOn: { backgroundColor: '#fff', ...shadow.sm },
  segmentText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  segmentTextOn: { color: C.ink, fontWeight: '800' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '800' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.primary },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.primary, borderColor: C.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 999, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', ...shadow.sm },
  stepVal: { minWidth: 28, textAlign: 'center', fontWeight: '800', color: C.ink, fontSize: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: C.ink2, marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 14, minHeight: 52, fontSize: 15, color: C.ink, ...webNoOutline },
  inputMulti: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  fieldErr: { color: C.red, fontSize: 12, marginTop: 6, fontWeight: '500' },
  selectRow: { minHeight: 52, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  chevron: { color: C.faint, fontSize: 22, lineHeight: 24, marginLeft: 6 },
  listRow: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14 },
  listDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  listLabel: { fontSize: 15.5, color: C.ink, fontWeight: '500' },
  listValue: { color: C.muted, fontSize: 13, fontWeight: '500' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 44 },
  emptyIcon: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.md, borderWidth: 1, borderColor: C.line },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 18, textAlign: 'center', letterSpacing: -0.2 },
  emptyBody: { color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 21, fontSize: 14 },
  sCard: { backgroundColor: '#fff', borderRadius: R.lg, overflow: 'hidden', ...shadow.sm, borderWidth: 1, borderColor: C.line },
  sCardName: { fontSize: 13, fontWeight: '700', color: C.ink, lineHeight: 18, minHeight: 36 },
  offTag: { position: 'absolute', left: 8, top: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.primaryBorder, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, ...shadow.sm },
  offTagText: { color: C.primary, fontSize: 11, fontWeight: '800' },
  warrantyTag: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, ...shadow.sm },
  warrantyTagText: { color: C.ink2, fontSize: 10, fontWeight: '800' },
  addBtn: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.primary, ...grad.primaryBtn, alignItems: 'center', justifyContent: 'center', ...shadow.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  gridItem: { width: '48.4%' },
  sRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: R.lg, padding: 10, marginBottom: 10, ...shadow.sm, borderWidth: 1, borderColor: C.line },
  sRowName: { fontSize: 14, fontWeight: '700', color: C.ink, lineHeight: 19, marginBottom: 4 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,26,58,0.55)' },
  sheet: { width: '100%', maxWidth: 430, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, maxHeight: '88%', ...shadow.lg },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.ink, flex: 1, letterSpacing: -0.2 },
  dialogWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 22, padding: 22, ...shadow.lg },
  dialogTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  dialogIconOuter: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  dialogIconInner: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dialogCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: -2, marginRight: -4 },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: C.ink, textAlign: 'left' },
  dialogBody: { fontSize: 14.5, color: C.ink2, textAlign: 'left', marginTop: 6, lineHeight: 21 },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '92%', bottom: 94, backgroundColor: 'rgba(7,26,58,0.96)', paddingLeft: 10, paddingRight: 18, paddingVertical: 9, borderRadius: 999, flexDirection: 'row', alignItems: 'center', zIndex: 100, ...shadow.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)' },
  toastIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  toastText: { color: '#fff', fontWeight: '700', fontSize: 13.5, flexShrink: 1 },
});

export const minutesToTimeStr = (mins) => {
  const m = Math.max(0, Math.floor(mins || 0));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}h${String(min).padStart(2, '0')}`;
};

export const minutesToSlotStr = formatMinutesToSlotStr;

export function TimeRangeSlider({
  value,
  onChange,
  minMinutes = 8 * 60,
  maxMinutes = 20 * 60,
  step = 15,
  leadMinutes = 45,
  isToday = false,
  onSelectTomorrow,
  style,
}) {
  const clampedVal = Math.min(Math.max(value ?? minMinutes, minMinutes), maxMinutes);
  const isOutOfRange = isToday && minMinutes > maxMinutes;

  const handleChange = (newVal) => {
    const clamped = Math.min(Math.max(newVal, minMinutes), maxMinutes);
    const slotStr = minutesToSlotStr(clamped);
    onChange?.(clamped, slotStr);
  };

  const handleNudge = (delta) => {
    handleChange(clampedVal + delta);
  };

  const isExtendedRange = minMinutes < 8 * 60 || maxMinutes > 20 * 60;
  const PRESETS = isExtendedRange
    ? [
      { label: '01:00', val: 1 * 60 },
      { label: '06:00', val: 6 * 60 },
      { label: '08:30', val: 8 * 60 + 30 },
      { label: '10:00', val: 10 * 60 },
      { label: '13:30', val: 13 * 60 + 30 },
      { label: '15:30', val: 15 * 60 + 30 },
      { label: '18:00', val: 18 * 60 },
      { label: '21:00', val: 21 * 60 },
      { label: '23:00', val: 23 * 60 },
    ]
    : [
      { label: '08:30', val: 8 * 60 + 30 },
      { label: '10:00', val: 10 * 60 },
      { label: '13:30', val: 13 * 60 + 30 },
      { label: '15:30', val: 15 * 60 + 30 },
      { label: '18:00', val: 18 * 60 },
    ];

  const periodLabel =
    clampedVal < 5 * 60
      ? 'Rạng sáng'
      : clampedVal < 12 * 60
        ? 'Buổi sáng'
        : clampedVal < 18 * 60
          ? 'Buổi chiều'
          : 'Buổi tối';
  const progressPct = maxMinutes > minMinutes
    ? `${Math.max(0, Math.min(100, ((clampedVal - minMinutes) / (maxMinutes - minMinutes)) * 100))}%`
    : '0%';

  return (
    <View style={[trsStyles.card, style]}>
      {!isOutOfRange ? (
        <View style={trsStyles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={trsStyles.eyebrow}>GIỜ HẸN KỸ THUẬT VIÊN ĐẾN</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <Text style={trsStyles.bigTime}>{minutesToTimeStr(clampedVal)}</Text>
              <View style={trsStyles.periodBadge}>
                <Text style={trsStyles.periodText}>{periodLabel}</Text>
              </View>
            </View>
          </View>
          <View style={trsStyles.slotBadge}>
            <Text style={trsStyles.slotBadgeLabel}>Ca phục vụ:</Text>
            <Text style={trsStyles.slotBadgeVal}>{minutesToSlotStr(clampedVal)}</Text>
          </View>
        </View>
      ) : null}

      {isOutOfRange ? (
        <View style={[trsStyles.closedBox, { marginTop: 0 }]}>
          <Text style={trsStyles.closedText}>
            Hôm nay đã hết khung giờ nhận lịch (trước {minutesToTimeStr(maxMinutes)}
            {leadMinutes > 0 ? ` cần đặt sớm tối thiểu ${leadMinutes} phút` : ''}). Quý khách vui lòng chọn Ngày mai hoặc các ngày tiếp theo.
          </Text>
          {onSelectTomorrow && (
            <Tap style={trsStyles.tomorrowBtn} onPress={onSelectTomorrow}>
              <Text style={trsStyles.tomorrowBtnText}>Đổi sang Ngày mai</Text>
            </Tap>
          )}
        </View>
      ) : (
        <>
          {/* Draggable slider container */}
          <View style={trsStyles.trackContainer}>
            {Platform.OS === 'web' ? (
              <input
                type="range"
                min={minMinutes}
                max={maxMinutes}
                step={step}
                value={clampedVal}
                onChange={(e) => handleChange(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: 10,
                  borderRadius: 5,
                  accentColor: C.primary,
                  cursor: 'pointer',
                  outline: 'none',
                  marginTop: 10,
                  marginBottom: 6,
                }}
              />
            ) : (
              <View style={[trsStyles.nativeFallbackTrack, { overflow: 'hidden' }]}>
                <View style={{ width: progressPct, height: '100%', backgroundColor: C.primary, borderRadius: 4 }} />
              </View>
            )}
          </View>

          {/* Bound labels */}
          <View style={trsStyles.boundsRow}>
            <Text style={trsStyles.boundText}>{minutesToTimeStr(minMinutes)}</Text>
            <Text style={[trsStyles.boundText, { color: C.muted }]}>
              {Platform.OS === 'web' ? 'Kéo thanh trượt để chỉnh giờ' : `Bấm −${step}p / +${step}p hoặc mốc nhanh`}
            </Text>
            <Text style={trsStyles.boundText}>{minutesToTimeStr(maxMinutes)}</Text>
          </View>

          {/* Nudge buttons */}
          <View style={trsStyles.nudgeRow}>
            <Tap
              disabled={clampedVal <= minMinutes}
              onPress={() => handleNudge(-step)}
              style={[trsStyles.nudgeBtn, clampedVal <= minMinutes && trsStyles.nudgeBtnDisabled]}
            >
              <Text style={[trsStyles.nudgeBtnText, clampedVal <= minMinutes && { color: C.faint }]}>
                ‹ − {step} phút
              </Text>
            </Tap>
            <Tap
              disabled={clampedVal >= maxMinutes}
              onPress={() => handleNudge(step)}
              style={[trsStyles.nudgeBtn, clampedVal >= maxMinutes && trsStyles.nudgeBtnDisabled]}
            >
              <Text style={[trsStyles.nudgeBtnText, clampedVal >= maxMinutes && { color: C.faint }]}>
                + {step} phút ›
              </Text>
            </Tap>
          </View>

          {/* Milestone Presets */}
          <View style={{ marginTop: 12 }}>
            <Text style={trsStyles.presetsLabel}>Mốc giờ phổ biến:</Text>
            <View style={trsStyles.presetsGrid}>
              {PRESETS.map((p) => {
                const isAvail = p.val >= minMinutes && p.val <= maxMinutes;
                const isSelected = Math.abs(clampedVal - p.val) <= Math.max(0, Math.min(2, Math.floor(step / 2)));
                return (
                  <Tap
                    key={p.val}
                    disabled={!isAvail}
                    onPress={() => handleChange(p.val)}
                    style={[
                      trsStyles.presetPill,
                      isSelected && trsStyles.presetPillActive,
                      !isAvail && trsStyles.presetPillDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        trsStyles.presetPillText,
                        isSelected && trsStyles.presetPillTextActive,
                        !isAvail && { color: C.faint },
                      ]}
                    >
                      {minutesToTimeStr(p.val)}
                    </Text>
                  </Tap>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const trsStyles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.line,
    marginTop: 12,
    marginBottom: 6,
    ...shadow.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bigTime: {
    fontSize: 28,
    fontWeight: '900',
    color: C.primary,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  periodBadge: {
    backgroundColor: C.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  periodText: {
    fontSize: 11,
    color: C.primary,
    fontWeight: '700',
  },
  slotBadge: {
    alignItems: 'flex-end',
    backgroundColor: C.bg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  slotBadgeLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '600',
  },
  slotBadgeVal: {
    fontSize: 12,
    color: C.ink,
    fontWeight: '800',
    marginTop: 2,
  },
  closedBox: {
    padding: 14,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 3.5,
    borderLeftColor: C.gold,
    marginTop: 10,
    alignItems: 'center',
  },
  closedText: {
    fontSize: 13,
    color: C.ink2,
    lineHeight: 18,
    textAlign: 'center',
  },
  tomorrowBtn: {
    marginTop: 10,
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tomorrowBtnText: {
    color: C.card,
    fontWeight: '700',
    fontSize: 13,
  },
  trackContainer: {
    marginTop: 6,
    paddingHorizontal: 2,
  },
  nativeFallbackTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.primarySoft,
    marginVertical: 10,
  },
  boundsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  boundText: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: '600',
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  nudgeBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: C.primaryBorder,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeBtnDisabled: {
    backgroundColor: C.bg,
    borderColor: C.line,
    opacity: 0.5,
  },
  nudgeBtnText: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '700',
  },
  presetsLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
    marginBottom: 6,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
  },
  presetPillActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  presetPillDisabled: {
    backgroundColor: C.bg,
    borderColor: C.line,
    opacity: 0.4,
  },
  presetPillText: {
    fontSize: 12,
    color: C.ink,
    fontWeight: '600',
  },
  presetPillTextActive: {
    color: C.card,
    fontWeight: '800',
  },
});
