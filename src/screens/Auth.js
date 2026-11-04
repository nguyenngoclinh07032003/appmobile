import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { C, R, shadow, grad } from '../theme';
import { useApp } from '../store';
import { Btn, Tap } from '../ui';

const ROLES = {
  customer: {
    id: 'customer',
    icon: '🏠',
    title: 'Khách hàng',
    short: 'Đặt lịch & theo dõi thợ',
    body: 'Vệ sinh, sửa chữa, lắp đặt tận nhà. Theo dõi đơn và bảo hành điện tử đến 120 ngày.',
    accent: C.primary,
    soft: C.primarySoft,
    cta: 'Tiếp tục với Khách hàng',
  },
  tech: {
    id: 'tech',
    icon: '👷',
    title: 'Kỹ thuật viên',
    short: 'Nhận việc & báo giá',
    body: 'Nhận việc được giao, báo giá minh bạch, cập nhật tiến độ và nghiệm thu đơn.',
    accent: C.navy,
    soft: '#E8EEF8',
    cta: 'Tiếp tục với Thợ',
  },
};

const webNoOutline = Platform.select({ web: { outlineStyle: 'none' }, default: {} });

function Field({
  label, value, onChangeText, placeholder, secure, keyboardType, autoCapitalize, right,
}) {
  return (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <View style={st.inputWrap}>
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
        />
        {right || null}
      </View>
    </View>
  );
}

export default function AuthScreen() {
  const { a, d } = useApp();
  const hint = d.roleHint;
  const [step, setStep] = useState('pick'); // pick | form
  const [role, setRole] = useState(hint === 'tech' ? 'tech' : 'customer');
  const [mode, setMode] = useState('login'); // login | register | forgot
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const meta = ROLES[role] || ROLES.customer;

  const openForm = (nextRole, nextMode = 'login') => {
    setRole(nextRole);
    setMode(nextMode);
    setStep('form');
    setFormErr('');
    setPassword('');
    setPassword2('');
  };

  const submit = () => {
    if ((mode === 'register' || mode === 'forgot') && password !== password2) {
      setFormErr('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    let res;
    if (mode === 'login') res = a.login({ role, phone, password });
    else if (mode === 'forgot') {
      res = a.resetPassword({ role, phone, newPassword: password });
      if (res.ok) {
        setMode('login');
        setPassword('');
        setPassword2('');
        setFormErr('');
      }
    } else res = a.register({ role, name, phone, email, password });
    setBusy(false);
    if (res && !res.ok) setFormErr(res.error);
  };

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={st.fill}
        contentContainerStyle={st.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={st.hero}>
          <View style={st.heroBlob} />
          <View style={[st.heroBlob, st.heroBlob2]} />
          <View style={st.brandRow}>
            <View style={st.brandMark}><Text style={{ fontSize: 18 }}>⚡</Text></View>
            <View>
              <Text style={st.brand}><Text style={{ color: C.gold }}>Thợ</Text> HRMSS</Text>
              <Text style={{ color: C.gold, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 }}>HỆ THỐNG DỊCH VỤ SỬA CHỮA & BẢO TRÌ TẠI NHÀ HRMSS</Text>
            </View>
          </View>
          <Text style={st.heroTitle}>
            {step === 'pick'
              ? 'Chọn cách bạn dùng app'
              : mode === 'login'
                ? `Đăng nhập ${meta.title}`
                : mode === 'forgot'
                  ? 'Đặt lại mật khẩu'
                  : `Tạo tài khoản ${meta.title}`}
          </Text>
          <Text style={st.heroSub}>
            {step === 'pick'
              ? 'Mỗi tài khoản chỉ mở đúng một quyền. Khách đặt dịch vụ, Thợ nhận việc.'
              : mode === 'forgot'
                ? 'Nhập SĐT đã đăng ký và mật khẩu mới để tiếp tục sử dụng.'
                : meta.short}
          </Text>
        </View>

        <View style={st.sheet}>
          {step === 'pick' ? (
            <View>
              {Object.values(ROLES).map((r) => (
                <Tap
                  key={r.id}
                  style={[st.door, { borderColor: r.id === 'tech' ? '#E8C76A' : '#D6E4FF' }]}
                  onPress={() => openForm(r.id, 'login')}
                >
                  <View style={[st.doorIcon, { backgroundColor: r.id === 'tech' ? C.gold : C.primarySoft }]}>
                    <Text style={{ fontSize: 26 }}>{r.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.doorTitle, { color: r.accent }]}>{r.title}</Text>
                    <Text style={st.doorBody}>{r.body}</Text>
                  </View>
                  <View style={[st.doorGo, { backgroundColor: r.soft }]}>
                    <Text style={[st.doorArrow, { color: r.accent }]}>›</Text>
                  </View>
                </Tap>
              ))}

              <Text style={st.helper}>
                Mỗi tài khoản gắn một vai trò. Đăng nhập đúng quyền để đặt lịch hoặc nhận việc.
              </Text>
            </View>
          ) : (
            <View>
              <View style={st.roleBar}>
                <View style={[st.rolePill, { backgroundColor: meta.soft }]}>
                  <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
                  <Text style={[st.rolePillText, { color: meta.accent }]}>{meta.title}</Text>
                </View>
                <Tap onPress={() => { setStep('pick'); setFormErr(''); }} hitSlop={8}>
                  <Text style={st.changeRole}>‹ Đổi vai trò</Text>
                </Tap>
              </View>

              {mode !== 'forgot' ? (
                <View style={st.seg}>
                  {[
                    { id: 'login', label: 'Đăng nhập' },
                    { id: 'register', label: 'Đăng ký' },
                  ].map((m) => {
                    const on = mode === m.id;
                    return (
                      <Tap
                        key={m.id}
                        style={[st.segItem, on && st.segOn]}
                        onPress={() => { setMode(m.id); setFormErr(''); setPassword(''); setPassword2(''); }}
                      >
                        <Text style={[st.segText, on && st.segTextOn]}>{m.label}</Text>
                      </Tap>
                    );
                  })}
                </View>
              ) : (
                <Tap onPress={() => { setMode('login'); setFormErr(''); }} style={{ marginBottom: 10 }}>
                  <Text style={st.changeRole}>‹ Quay lại đăng nhập</Text>
                </Tap>
              )}

              {mode === 'register' ? (
                <Field
                  label="Họ và tên"
                  value={name}
                  onChangeText={setName}
                  placeholder="Nguyễn Văn A"
                  autoCapitalize="words"
                />
              ) : null}

              <Field
                label="Số điện thoại"
                value={phone}
                onChangeText={setPhone}
                placeholder="10 chữ số"
                keyboardType="phone-pad"
              />

              {mode === 'register' ? (
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Không bắt buộc"
                  keyboardType="email-address"
                />
              ) : null}

              <Field
                label={mode === 'forgot' ? 'Mật khẩu mới' : 'Mật khẩu'}
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'login' ? 'Nhập mật khẩu' : 'Ít nhất 6 ký tự'}
                secure={!showPw}
                right={(
                  <Tap onPress={() => setShowPw((v) => !v)} style={st.eyeBtn} hitSlop={6}>
                    <Text style={st.eyeText}>{showPw ? 'Ẩn' : 'Hiện'}</Text>
                  </Tap>
                )}
              />

              {mode === 'register' || mode === 'forgot' ? (
                <Field
                  label="Nhập lại mật khẩu"
                  value={password2}
                  onChangeText={setPassword2}
                  placeholder="Nhập lại mật khẩu"
                  secure={!showPw}
                />
              ) : null}

              {formErr ? (
                <View style={st.errBox}>
                  <Text style={st.errText}>{formErr}</Text>
                </View>
              ) : null}

              <Btn
                title={mode === 'login' ? 'Đăng nhập' : mode === 'forgot' ? 'Đặt lại mật khẩu' : 'Tạo tài khoản'}
                variant={role === 'tech' ? 'dark' : 'primary'}
                style={{ marginTop: 18 }}
                disabled={busy}
                onPress={submit}
              />
              {mode === 'login' ? (
                <View style={{ marginTop: 14, alignItems: 'center', gap: 8 }}>
                  <Tap onPress={() => { setMode('forgot'); setFormErr(''); setPassword(''); setPassword2(''); }}>
                    <Text style={st.changeRole}>Quên mật khẩu?</Text>
                  </Tap>
                  <Text style={st.helper}>Chưa có tài khoản? Chọn Đăng ký phía trên.</Text>
                </View>
              ) : mode === 'forgot' ? (
                <Text style={[st.helper, { marginTop: 14, textAlign: 'center' }]}>
                  Sau khi đặt lại, dùng mật khẩu mới để đăng nhập.
                </Text>
              ) : (
                <Text style={[st.helper, { marginTop: 14, textAlign: 'center' }]}>
                  Sau khi tạo tài khoản bạn có thể đăng nhập ngay trên thiết bị này.
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingBottom: 28 },
  hero: {
    backgroundColor: C.navy,
    ...grad.navyHero,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  heroBlob: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -80,
    right: -60,
  },
  heroBlob2: {
    width: 160,
    height: 160,
    top: 40,
    left: -70,
    right: undefined,
    backgroundColor: 'rgba(255,200,61,0.12)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.gold,
  },
  brand: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroTitle: { marginTop: 18, fontSize: 26, fontWeight: '900', color: '#fff', lineHeight: 32, letterSpacing: -0.4 },
  heroSub: { marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 21, maxWidth: 320, fontWeight: '500' },
  sheet: {
    marginTop: -20,
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 20,
    flex: 1,
  },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: R.lg,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
    ...shadow.md,
  },
  doorIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  doorBody: { marginTop: 4, fontSize: 13, color: C.muted, lineHeight: 18 },
  doorGo: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorArrow: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  quickBox: {
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: R.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    ...shadow.sm,
  },
  quickTitle: { fontSize: 13, fontWeight: '800', color: C.ink },
  quickPass: { fontSize: 11, fontWeight: '700', color: C.muted, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  quickSub: { fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 17 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickBtnRole: { fontSize: 12.5, fontWeight: '800' },
  quickBtnPhone: { fontSize: 11, color: C.muted, fontWeight: '600', marginTop: 1 },
  helper: {
    marginTop: 8,
    fontSize: 12,
    color: C.muted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  roleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rolePillText: { fontWeight: '800', fontSize: 13 },
  changeRole: { color: C.primary, fontWeight: '700', fontSize: 13 },
  seg: {
    flexDirection: 'row',
    backgroundColor: '#E4EAF3',
    borderRadius: 14,
    padding: 4,
    marginBottom: 6,
  },
  segItem: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: { backgroundColor: '#fff', ...shadow.sm },
  segText: { color: C.muted, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: C.ink },
  field: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink2, marginBottom: 6 },
  inputWrap: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 12 },
  eyeBtn: { paddingLeft: 10, paddingVertical: 6 },
  eyeText: { color: C.primary, fontWeight: '700', fontSize: 13 },
  errBox: {
    marginTop: 14,
    backgroundColor: C.redSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errText: { color: C.red, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
