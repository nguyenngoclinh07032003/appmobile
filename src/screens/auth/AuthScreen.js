import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image, BackHandler,
} from 'react-native';
import { C, R, shadow, grad } from '../../theme';
import { useApp } from '../../context';
import { Btn, Tap, AppIcon } from '../../components';
import { authErrorMessage } from '../../utils/authErrorMessages';

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
        {icon ? (
          <View style={st.inputIcon}>
            <AppIcon icon={icon} size={18} color={focused ? C.primary : C.muted} strokeWidth={2.1} />
          </View>
        ) : null}
        <TextInput
          style={[st.input, webNoOutline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
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

export default function AuthScreen({ initialMode = 'login', onBackHome }) {
  const { a, ui: u } = useApp();

  const [mode, setMode] = useState(initialMode === 'tech_partner' ? 'login' : initialMode); // login | register | forgot
  const [name, setName] = useState('');
  const [username, setUsername] = useState(''); // Tên đăng nhập cho đăng ký
  const [identifier, setIdentifier] = useState(''); // Nhập Email hoặc Username (Đăng nhập / Quên mật khẩu)
  const [email, setEmail] = useState(''); // Cho đăng ký
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendLeft, setResendLeft] = useState(0);
  const submittingRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (resendLeft <= 0) return undefined;
    const t = setTimeout(() => setResendLeft((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendLeft]);

  useEffect(() => {
    if (Platform.OS !== 'android' || mode !== 'forgot') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) handleModeChange('login');
      return true;
    });
    return () => sub.remove();
  }, [mode, busy]);

  const handleModeChange = (nextMode) => {
    if (busy || submittingRef.current) return;
    setMode(nextMode);
    setFormErr('');
    setPassword('');
    setPassword2('');
    setOtp('');
    setOtpSent(false);
    setResendLeft(0);
  };

  const submit = async () => {
    if (submittingRef.current || busy) return;
    if (mode === 'login') {
      if (!identifier.trim()) { setFormErr('Vui lòng nhập thư điện tử hoặc tên đăng nhập.'); return; }
      if (!password) { setFormErr('Vui lòng nhập mật khẩu.'); return; }
    }
    if (mode === 'forgot' && !otpSent && !identifier.trim()) {
      setFormErr('Vui lòng nhập thư điện tử hoặc tên đăng nhập.');
      return;
    }
    if ((mode === 'register' || (mode === 'forgot' && otpSent)) && password !== password2) {
      setFormErr('Mật khẩu nhập lại không khớp.');
      return;
    }
    const opMode = mode;
    submittingRef.current = true;
    setBusy(true);
    let res;
    try {
      if (opMode === 'login') {
        // Đăng nhập bằng Email hoặc Username (áp dụng đồng bộ cho cả Thợ và Khách)
        res = await a.login({ identifier: identifier.trim(), password });
      } else if (opMode === 'forgot') {
        if (!otpSent) {
          res = await a.requestPasswordReset({ identifier: identifier.trim() });
          if (res?.ok && modeRef.current === 'forgot') {
            setOtpSent(true);
            setResendLeft(30);
            setFormErr('');
          }
        } else {
          res = await a.resetPassword({ identifier: identifier.trim(), otp, newPassword: password });
          if (res?.ok && modeRef.current === 'forgot') {
            setMode('login');
            setPassword('');
            setPassword2('');
            setOtp('');
            setOtpSent(false);
            setResendLeft(0);
            setFormErr('');
          }
        }
      } else if (opMode === 'register') {
        // Khách hàng đăng ký bằng Email & Username (không cần SĐT)
        res = await a.register({
          role: 'customer',
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        });
      }
    } catch (err) {
      res = { ok: false, error: authErrorMessage({ message: err?.message, status: 0 }, opMode) };
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
    if (res && !res.ok && modeRef.current === opMode) setFormErr(authErrorMessage(res, opMode));
  };

  const resendResetOtp = async () => {
    if (submittingRef.current || busy || resendLeft > 0 || !identifier.trim()) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const res = await a.requestPasswordReset({ identifier: identifier.trim() });
      if (modeRef.current !== 'forgot') return;
      if (res?.ok) {
        setFormErr('');
        setOtp('');
        setResendLeft(30);
        u.toast('Đã gửi lại mã xác thực tới thư điện tử của bạn', '📧');
      } else {
        setFormErr(authErrorMessage(res, 'forgot'));
      }
    } catch (err) {
      if (modeRef.current === 'forgot') {
        setFormErr(authErrorMessage({ message: err?.message, status: 0 }, 'forgot'));
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
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
          {onBackHome ? (
            <Tap onPress={onBackHome} style={st.homeLink}>
              <AppIcon name="arrow-left" size={16} color="rgba(255,255,255,0.9)" />
              <Text style={st.homeLinkText}>Trang chủ</Text>
            </Tap>
          ) : null}
          
          <View style={st.brandRow}>
            <View style={st.brandMark}>
              <Image source={require('../../../assets/app-icon.png')} style={st.authBrandLogo} resizeMode="cover" accessibilityLabel="Biểu trưng Thợ Minh Đức" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.brand}>Thợ Minh Đức</Text>
              <Text style={st.brandSlogan}>HỆ THỐNG DỊCH VỤ SỬA CHỮA & BẢO TRÌ TẬN NHÀ</Text>
            </View>
          </View>

          <View style={st.welcomeBox}>
            <Text style={st.heroTitle}>
              {mode === 'login'
                ? 'Đăng nhập tài khoản'
                : mode === 'register'
                  ? 'Tạo tài khoản mới'
                  : 'Đặt lại mật khẩu'}
            </Text>
            <Text style={st.heroSub}>
              {mode === 'login'
                ? 'Nhập thư điện tử hoặc tên đăng nhập để truy cập đơn dịch vụ và hồ sơ của bạn.'
                : mode === 'register'
                  ? 'Đăng ký tài khoản để đặt lịch sửa chữa, bảo dưỡng tận nhà và theo dõi bảo hành điện tử.'
                  : 'Nhập thư điện tử hoặc tên đăng nhập đã đăng ký để tạo mật khẩu bảo vệ mới.'}
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
                    style={[st.tabItem, on && st.tabItemOn, busy && !on && { opacity: 0.5 }]}
                    disabled={busy}
                    onPress={() => handleModeChange(m.id)}
                  >
                    <Text style={[st.tabText, on && st.tabTextOn]}>{m.label}</Text>
                  </Tap>
                );
              })}
            </View>
          ) : (
            <View style={st.forgotHeader}>
              <Tap onPress={() => handleModeChange('login')} style={st.backLink} disabled={busy}>
                <Text style={[st.backLinkText, busy && { opacity: 0.5 }]}>← Quay lại đăng nhập</Text>
              </Tap>
              <Text style={st.forgotNote}>
                {otpSent
                  ? 'Nhập mã 6 số đã gửi tới thư điện tử của tài khoản (hiệu lực 10 phút) và mật khẩu mới'
                  : 'Nhập thư điện tử hoặc tên đăng nhập để nhận mã đặt lại mật khẩu qua thư điện tử'}
              </Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={st.formBody}>
            {mode === 'register' && (
              <>
                <ModernField
                  label="Họ và tên"
                  icon="👤"
                  value={name}
                  onChangeText={(t) => { setName(t); if (formErr) setFormErr(''); }}
                  placeholder="Nguyễn Văn An"
                  autoCapitalize="words"
                />

                <ModernField
                  label="Tên đăng nhập"
                  icon="🆔"
                  value={username}
                  onChangeText={(t) => { setUsername(t); if (formErr) setFormErr(''); }}
                  placeholder="VD: nguyenvanan"
                  autoCapitalize="none"
                />

                <ModernField
                  label="Địa chỉ thư điện tử"
                  icon="✉️"
                  value={email}
                  onChangeText={(t) => { setEmail(t); if (formErr) setFormErr(''); }}
                  placeholder="tenban@gmail.com (dùng đăng nhập & nhận hoá đơn)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            )}

            {(mode === 'login' || mode === 'forgot') && (
              <ModernField
                label="Thư điện tử hoặc Tên đăng nhập"
                icon="👤"
                value={identifier}
                onChangeText={(t) => {
                  setIdentifier(t);
                  if (formErr) setFormErr('');
                  if (mode === 'forgot' && otpSent) {
                    setOtpSent(false);
                    setOtp('');
                    setResendLeft(0);
                  }
                }}
                placeholder="Nhập thư điện tử hoặc tên đăng nhập của bạn"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}

            {mode === 'forgot' && otpSent && (
              <View>
                <ModernField
                  label="Mã xác nhận (6 số)"
                  icon="shield-check"
                  value={otp}
                  onChangeText={(t) => { setOtp(t.replace(/\D/g, '').slice(0, 6)); if (formErr) setFormErr(''); }}
                  placeholder="Mã gửi trong thư điện tử"
                  keyboardType="number-pad"
                />
                <Tap onPress={resendResetOtp} style={{ alignSelf: 'flex-end', marginTop: -8, marginBottom: 10 }} disabled={busy || resendLeft > 0}>
                  <Text style={[st.forgotLink, (busy || resendLeft > 0) && { color: C.muted }]}>
                    {resendLeft > 0 ? `Gửi lại mã xác thực (${resendLeft} giây)` : 'Gửi lại mã xác thực'}
                  </Text>
                </Tap>
              </View>
            )}

            {!(mode === 'forgot' && !otpSent) && (
            <ModernField
              label={mode === 'forgot' ? 'Mật khẩu mới' : 'Mật khẩu'}
              icon="lock"
              value={password}
              onChangeText={(t) => { setPassword(t); if (formErr) setFormErr(''); }}
              placeholder={mode === 'login' ? 'Nhập mật khẩu của bạn' : 'Tối thiểu 8 ký tự'}
              secure={!showPw}
              right={(
                <Tap onPress={() => setShowPw(!showPw)} style={st.eyeToggle} hitSlop={10}>
                  <AppIcon name={showPw ? 'eye' : 'eye-off'} size={18} color={C.muted} strokeWidth={2} />
                </Tap>
              )}
            />
            )}

            {(mode === 'register' || (mode === 'forgot' && otpSent)) && (
              <ModernField
                label="Xác nhận mật khẩu"
                icon="shield-check"
                value={password2}
                onChangeText={(t) => { setPassword2(t); if (formErr) setFormErr(''); }}
                placeholder="Nhập lại mật khẩu"
                secure={!showPw}
              />
            )}

            {formErr ? (
              <View style={st.errorBox}>
                <AppIcon name="alert-triangle" size={18} color={C.red} strokeWidth={2.2} />
                <Text style={st.errorText}>{formErr}</Text>
              </View>
            ) : null}

            {mode === 'login' && (
              <View style={st.forgotRow}>
                <Tap onPress={() => handleModeChange('forgot')} hitSlop={8} disabled={busy}>
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
                      ? (otpSent ? 'Lưu mật khẩu mới' : 'Gửi mã xác nhận')
                      : 'Tạo tài khoản'
              }
              variant="primary"
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
                <AppIcon name="lock" size={14} color={C.primary} strokeWidth={2.2} />
                <Text style={st.securityText}>Bảo mật thông tin người dùng theo tiêu chuẩn an toàn Minh Đức</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  homeLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginBottom: 16 },
  homeLinkText: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, fontWeight: '700' },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  authBrandLogo: { width: 44, height: 44, borderRadius: 14 },
  brand: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  brandSlogan: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 2 },
  
  welcomeBox: { marginTop: 20 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.4 },
  heroSub: { marginTop: 6, fontSize: 13.5, color: 'rgba(255, 255, 255, 0.82)', lineHeight: 20, maxWidth: 330 },

  // Card Content Sheet
  sheet: {
    marginTop: -22,
    backgroundColor: C.card,
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
    backgroundColor: C.surface,
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
    backgroundColor: C.card,
    ...shadow.sm,
  },
  tabText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: C.muted,
  },
  tabTextOn: {
    color: C.navy,
  },

  // Forgot Password Header
  forgotHeader: { marginBottom: 16 },
  backLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  backLinkText: { fontSize: 13.5, fontWeight: '700', color: C.primary },
  forgotNote: { fontSize: 13, color: C.muted, marginTop: 4 },

  // Fields
  formBody: {},
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink2, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.card,
    paddingHorizontal: 14,
  },
  inputWrapFocused: {
    borderColor: C.primary,
    backgroundColor: C.card,
    ...shadow.sm,
  },
  inputWrapError: {
    borderColor: C.red,
    backgroundColor: C.redSoft,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 14.5,
    color: C.ink,
    fontWeight: '500',
  },
  eyeToggle: { padding: 6 },
  eyeIcon: { fontSize: 16 },

  // Error Banner
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.redSoft,
    borderWidth: 1,
    borderColor: C.redBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: { fontSize: 12.5, color: C.redInk, fontWeight: '600', flex: 1, lineHeight: 18 },

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
    color: C.muted,
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
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  securityIcon: { fontSize: 12 },
  securityText: { fontSize: 11, color: C.faint, fontWeight: '600' },
});
