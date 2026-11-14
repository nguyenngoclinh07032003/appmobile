import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { C, R, shadow } from '../../theme';
import { Btn, AppIcon } from './UIComponents';

/**
 * ErrorBoundary bắt các lỗi JavaScript bất ngờ trong cây React component,
 * ngăn ứng dụng bị crash màn hình trắng xóa và cung cấp nút thử lại thân thiện.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Ghi log lỗi để hỗ trợ debug khi cần
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] Lỗi render:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <View style={st.container}>
          <View style={st.card}>
            <View style={st.iconWrap}>
              <AppIcon name="alert-triangle" size={32} color={C.danger} strokeWidth={2.4} />
            </View>
            <Text style={st.title}>Đã xảy ra sự cố</Text>
            <Text style={st.desc}>
              Ứng dụng gặp lỗi không mong muốn trong khi hiển thị màn hình này. Dữ liệu của bạn vẫn an toàn.
            </Text>
            {typeof __DEV__ !== 'undefined' && __DEV__ && this.state.error ? (
              <View style={st.devBox}>
                <Text style={st.devText} numberOfLines={4}>
                  {String(this.state.error?.message || this.state.error)}
                </Text>
              </View>
            ) : null}
            <Btn
              label="Tải lại ứng dụng"
              icon="rotate-cw"
              variant="primary"
              size="md"
              onPress={this.handleReset}
              style={{ width: '100%', marginTop: 16 }}
            />
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: R.xl || 20,
    padding: 24,
    alignItems: 'center',
    ...shadow.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.dangerSoft || '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: C.muted,
    textAlign: 'center',
  },
  devBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
  },
  devText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: C.danger,
  },
});

export default ErrorBoundary;
