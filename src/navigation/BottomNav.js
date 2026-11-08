import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { C, shadow } from '../theme';
import { useApp } from '../context';
import { AppIcon } from '../components';
import { CUSTOMER_TABS, TECH_TABS } from './routes';

export default function BottomNav() {
  const { s, nav, d } = useApp();
  const isDark = Boolean(s.darkMode);
  const role = s.auth?.role || s.role;
  const tabs = role === 'tech' ? TECH_TABS : CUSTOMER_TABS;
  const badges = role === 'tech'
    ? { 'tech-jobs': d.newJobs.length, 'tech-notifs': d.techUnread }
    : { activity: d.activeOrders.length };

  return (
    <View style={[styles.nav, isDark && styles.navDark]}>
      {tabs.map((t) => {
        const on = nav.tab === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={styles.navItem}
            onPress={() => nav.go(t.id)}
            activeOpacity={0.72}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.navIcon, on && (isDark ? styles.navIconOnDark : styles.navIconOn)]}>
              <AppIcon
                icon={t.icon}
                size={20}
                color={on ? (isDark ? '#60A5FA' : C.primary) : (isDark ? '#94A3B8' : C.muted)}
                strokeWidth={on ? 2.4 : 1.9}
              />
              {badges[t.id] ? (
                <View style={[styles.navBadge, isDark && { borderColor: '#0F172A' }]}>
                  <Text style={styles.navBadgeText}>{badges[t.id]}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.navLabel, isDark && styles.navLabelDark, on && (isDark ? styles.navLabelOnDark : styles.navLabelOn)]}>
              {t.label}
            </Text>
            <View style={[styles.navDot, on && isDark && styles.navDotDark, !on && styles.navDotOff]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    paddingTop: 7,
    paddingBottom: Platform.OS === 'ios' ? 24 : 9,
    ...shadow.sm,
  },
  navDark: {
    backgroundColor: '#0F172A',
    borderTopColor: '#1E293B',
  },
  navItem: { flex: 1, alignItems: 'center' },
  navIcon: { width: 48, height: 32, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navIconOn: { backgroundColor: C.primarySoft },
  navIconOnDark: { backgroundColor: '#1E293B' },
  navLabel: { fontSize: 11, color: C.muted, marginTop: 3, fontWeight: '600' },
  navLabelDark: { color: '#94A3B8' },
  navLabelOn: { color: C.primary, fontWeight: '800' },
  navLabelOnDark: { color: '#60A5FA', fontWeight: '800' },
  navDot: { width: 16, height: 3, borderRadius: 2, backgroundColor: C.primary, marginTop: 3 },
  navDotDark: { backgroundColor: '#60A5FA' },
  navDotOff: { backgroundColor: 'transparent' },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  navBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
