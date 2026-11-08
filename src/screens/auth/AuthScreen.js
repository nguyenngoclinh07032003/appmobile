import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { C, R, shadow, grad } from '../../theme';
import { useApp } from '../../context';
import { Btn, Tap } from '../../components';

const webNoOutline = Platform.select({ web: { outlineStyle: 'none' }, default: {} });

function ModernField({
  label, icon, value, onChangeText, placeholder, secure, keyboardType, autoCapitalize, right, error,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <View
        style={[
          st.inputWrap,
          focused && st.inputWrapFocused,
          error ? st.inputWrapError : null,
        ]}
      >
        {icon ? <Text style={st.inputIcon}>{icon}</Text> : null}
        <TextInput
          style={[st.input, webNoOutline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          secureTextEntry={secure}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize || 'none'}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {right || null}
      </View>
    </View>
  );
}

export default function AuthScreen() {
  const { a } = useApp();

  const [mode, setMode] = useState('login'); // login | register | forgot | tech_partner
  const [name, setName] = useState('');
  const [username, setUsername] = useState(''); // Tên đăng nhập cho đăng ký
  const [identifier, setIdentifier] = useState(''); // Nhập Email hoặc Username (Đăng nhập / Quên mật khẩu)
  const [email, setEmail] = useState(''); // Cho đăng ký
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setFormErr('');
    setPassword('');
    setPassword2('');
  };

  const submit = async () => {
    if ((mode === 'register' || mode === 'tech_partner' || mode === 'forgot') && password !== password2) {
      setFormErr('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    let res;
    try {
      if (mode === 'login') {
        // Đăng nhập bằng Email hoặc Username (áp dụng đồng bộ cho cả Thợ và Khách)
        res = await a.login({ identifier: identifier.trim(), password });
      } else if (mode === 'forgot') {
        res = await a.resetPassword({ identifier: identifier.trim(), newPassword: password });
        if (res.ok) {
          setMode('login');
          setPassword('');
          setPassword2('');
          setFormErr('');
        }
      } else if (mode === 'register') {
        // Khách hàng đăng ký bằng Email & Username (không cần SĐT)
        res = await a.register({
          role: 'customer',
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        });
      } else if (mode === 'tech_partner') {
        // Đăng ký hồ sơ Kỹ thuật viên đối tác bằng Email & Username (không cần SĐT)
        res = await a.register({
          role: 'tech',
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        });
      }
    } catch (err) {
      res = { ok: false, error: err?.message || 'Không thể kết nối đến máy chủ. Vui lòng thử lại.' };
    } finally {
      setBusy(false);
    }
    if (res && !res.ok) setFormErr(res.error || res.message);
  };

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={st.fill}
        contentContainerStyle={st.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Hero sang trọng & hiện đại */}
        <View style={st.hero}>
          <View style={st.heroBlob} />
          <View style={[st.heroBlob, st.heroBlob2]} />
          
          <View style={st.brandRow}>
            <View style={st.brandMark}>
              <Text style={{ fontSize: 22 }}>⚡</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.brand}>
                <Text style={{ color: C.gold }}>Thợ</Text> HRMSS
              </Text>
              <Text style={st.brandSlogan}>HỆ THỐNG DỊCH VỤ SỬA CHỮA & BẢO TRÌ TẬN NHÀ</Text>
            </View>
          </View>

          <View style={st.welcomeBox}>
            <Text style={st.heroTitle}>
              {mode === 'login'
                ? 'Đăng nhập tài khoản'
                : mode === 'register'
                  ? 'Tạo tài khoản mới'
                  : mode === 'tech_partner'
                    ? 'Đăng ký Kỹ thuật viên'
                    : 'Đặt lại mật khẩu'}
            </Text>
            <Text style={st.heroSub}>
              {mode === 'login'
                ? 'Nhập Email hoặc Tên đăng nhập để truy cập đơn dịch vụ và hồ sơ của bạn.'
                : mode === 'register'
                  ? 'Đăng ký tài khoản để đặt lịch sửa chữa, bảo dưỡng tận nhà và nhận bảo hành đến 120 ngày.'
                  : mode === 'tech_partner'
                    ? 'Gia nhập mạng lưới kỹ thuật viên chuyên nghiệp HRMSS để nhận việc và gia tăng thu nhập.'
                    : 'Nhập Email hoặc Tên đăng nhập đã đăng ký để tạo mật khẩu bảo vệ mới.'}
            </Text>
          </View>
        </View>

        {/* Khối Card tương tác chính */}
        <View style={st.sheet}>
          {/* Tab chuyển Đăng nhập / Đăng ký */}
          {mode === 'login' || mode === 'register' ? (
            <View style={st.tabBar}>
              {[
                { id: 'login', label: 'Đăng nhập' },
                { id: 'register', label: 'Đăng ký tài khoản' },
              ].map((m) => {
                const on = mode === m.id;
                return (
                  <Tap
                    key={m.id}
                    style={[st.tabItem, on && st.tabItemOn]}
                    onPress={() => handleModeChange(m.id)}
                  >
                    <Text style={[st.tabText, on && st.tabTextOn]}>{m.label}</Text>
                  </Tap>
                );
              })}
            </View>
          ) : (
            <View style={st.forgotHeader}>
              <Tap onPress={() => handleModeChange('login')} style={st.backLink}>
                <Text style={st.backLinkText}>← Quay lại đăng nhập</Text>
              </Tap>
              <Text style={st.forgotNote}>
                {mode === 'tech_partner'
                  ? 'Điền thông tin để đăng ký hồ sơ kỹ thuật viên đối tác'
                  : 'Nhập thông tin xác nhận để tạo mật khẩu mới'}
              </Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={st.formBody}>
            {(mode === 'register' || mode === 'tech_partner') && (
              <>
                <ModernField
                  label="Họ và tên"
                  icon="👤"
                  value={name}
                  onChangeText={setName}
                  placeholder={mode === 'tech_partner' ? 'Nguyễn Văn Hùng (Kỹ thuật viên)' : 'Nguyễn Văn An'}
                  autoCapitalize="words"
                />

                <ModernField
                  label="Tên đăng nhập (Username)"
                  icon="🆔"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="VD: hung_tech hoặc nguyenan99"
                  autoCapitalize="none"
                />

                <ModernField
                  label="Địa chỉ Email"
                  icon="✉️"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="example@gmail.com (dùng đăng nhập & nhận hóa đơn)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            )}

            {(mode === 'login' || mode === 'forgot') && (
              <ModernField
                label="Email hoặc Tên đăng nhập"
                icon="👤"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Nhập email hoặc username của bạn"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}

            <ModernField
              label={mode === 'forgot' ? 'Mật khẩu mới' : 'Mật khẩu'}
              icon="🔒"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'login' ? 'Nhập mật khẩu của bạn' : 'Tối thiểu 6 ký tự'}
              secure={!showPw}
              right={(
                <Tap onPress={() => setShowPw(!showPw)} style={st.eyeToggle} hitSlop={10}>
                  <Text style={st.eyeIcon}>{showPw ? '👁️' : '👁️‍🗨️'}</Text>
                </Tap>
              )}
            />

            {(mode === 'register' || mode === 'forgot' || mode === 'tech_partner') && (
              <ModernField
                label="Xác nhận mật khẩu"
                icon="🛡️"
                value={password2}
                onChangeText={setPassword2}
                placeholder="Nhập lại mật khẩu"
                secure={!showPw}
              />
            )}

            {formErr ? (
              <View style={st.errorBox}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <Text style={st.errorText}>{formErr}</Text>
              </View>
            ) : null}

            {mode === 'login' && (
              <View style={st.forgotRow}>
                <Tap onPress={() => handleModeChange('forgot')} hitSlop={8}>
                  <Text style={st.forgotLink}>Quên mật khẩu?</Text>
                </Tap>
              </View>
            )}

            <Btn
              title={
                busy
                  ? 'Đang xử lý...'
                  : mode === 'login'
                    ? 'Đăng nhập'
                    : mode === 'forgot'
                      ? 'Lưu mật khẩu mới'
                      : mode === 'tech_partner'
                        ? 'Đăng ký Kỹ thuật viên'
                        : 'Tạo tài khoản'
              }
              variant={mode === 'tech_partner' ? 'dark' : 'primary'}
              style={st.submitButton}
              disabled={busy}
              onPress={submit}
            />

            {/* Thông tin phụ */}
            <View style={st.footerGuide}>
              {mode === 'login' ? (
                <Text style={st.guideText}>
                  Chưa có tài khoản?{' '}
                  <Text style={st.guideLink} onPress={() => handleModeChange('register')}>
                    Đăng ký ngay
                  </Text>
                </Text>
              ) : mode === 'register' ? (
                <Text style={st.guideText}>
                  Đã có tài khoản?{' '}
                  <Text style={st.guideLink} onPress={() => handleModeChange('login')}>
                    Đăng nhập tại đây
                  </Text>
                </Text>
              ) : null}

              <View style={st.securityBadge}>
                <Text style={st.securityIcon}>🔒</Text>
                <Text style={st.securityText}>Bảo mật thông tin người dùng theo tiêu chuẩn an toàn HRMSS</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  // Hero Section
  hero: {
    backgroundColor: C.navy,
    ...grad.navyHero,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 42,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBlob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    top: -70,
    right: -60,
  },
  heroBlob2: {
    width: 170,
    height: 170,
    borderRadius: 85,
    top: 50,
    left: -60,
    right: undefined,
    backgroundColor: 'rgba(255, 200, 61, 0.1)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.gold,
  },
  brand: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  brandSlogan: { color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 2 },
  
  welcomeBox: { marginTop: 20 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.4 },
  heroSub: { marginTop: 6, fontSize: 13.5, color: '#CBD5E1', lineHeight: 20, maxWidth: 330 },

  // Card Content Sheet
  sheet: {
    marginTop: -22,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    ...shadow.md,
    flex: 1,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemOn: {
    backgroundColor: '#FFFFFF',
    ...shadow.sm,
  },
  tabText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#64748B',
  },
  tabTextOn: {
    color: C.navy,
  },

  // Forgot Password / Tech Partner Header
  forgotHeader: { marginBottom: 16 },
  backLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  backLinkText: { fontSize: 13.5, fontWeight: '700', color: C.primary },
  forgotNote: { fontSize: 13, color: '#64748B', marginTop: 4 },

  // Fields
  formBody: {},
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  inputWrapFocused: {
    borderColor: C.primary,
    backgroundColor: '#FAF5FF',
    ...shadow.sm,
  },
  inputWrapError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  inputIcon: { fontSize: 16, marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 14.5,
    color: '#0F172A',
    fontWeight: '500',
  },
  eyeToggle: { padding: 6 },
  eyeIcon: { fontSize: 16 },

  // Error Banner
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: { fontSize: 12.5, color: '#DC2626', fontWeight: '600', flex: 1, lineHeight: 18 },

  // Action links & Submit
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 14,
    marginTop: -4,
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  submitButton: {
    height: 52,
    borderRadius: 14,
    marginTop: 4,
  },

  // Footer & Partner link
  footerGuide: {
    marginTop: 18,
    alignItems: 'center',
  },
  guideText: {
    fontSize: 13.5,
    color: '#64748B',
    fontWeight: '500',
  },
  guideLink: {
    color: C.primary,
    fontWeight: '800',
  },

  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  securityIcon: { fontSize: 12 },
  securityText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
});
