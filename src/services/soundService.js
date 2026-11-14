import { Platform, Vibration } from 'react-native';

// Trạng thái bật/tắt âm thanh
let soundMuted = false;

// Web Audio Context (khởi tạo lười khi có tương tác đầu tiên của người dùng)
let audioCtx = null;

function getAudioContext() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Mở khoá AudioContext trên trình duyệt ngay khi người dùng chạm hoặc click chuột
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    } catch (e) {}
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

/**
 * Phát âm thanh thông báo chuẩn hoá (Web Audio API & Native Vibration)
 * @param {'notification' | 'success' | 'alert'} type Loại âm thanh
 */
export function playNotificationSound(type = 'notification') {
  if (soundMuted) return;

  // 1. Phản hồi rung haptic trên thiết bị di động
  if (Platform.OS !== 'web') {
    try {
      if (type === 'alert') {
        Vibration.vibrate([0, 200, 100, 200]);
      } else {
        Vibration.vibrate(type === 'success' ? [0, 80, 50, 80] : [0, 150]);
      }
    } catch (e) {}
  }

  // 2. Tổng hợp âm thanh chuông trên nền tảng Web
  if (Platform.OS === 'web') {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; // Dạng sóng sine trong trẻo, êm tai

        if (type === 'success') {
          // Chuông thành công (Hợp âm thăng hoa C5 -> E5 -> G5)
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.setValueAtTime(659.25, now + 0.08);
          osc.frequency.setValueAtTime(783.99, now + 0.16);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.6);
        } else if (type === 'alert') {
          // Chuông cảnh báo / nhắc nhở (Hai âm giảm quãng A5 -> D5)
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.setValueAtTime(587.33, now + 0.12);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.5);
        } else {
          // Chuông thông báo việc mới / tin nhắn (Quãng 5 D5 -> A5 mượt mà như iOS/Slack)
          osc.frequency.setValueAtTime(587.33, now);
          osc.frequency.setValueAtTime(880, now + 0.1);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.52);
        }
      }
    } catch (err) {
      // Bỏ qua nếu trình duyệt đang chặn autoplay trước tương tác
    }
  }
}

export function isSoundMuted() {
  return soundMuted;
}

export function setSoundMuted(muted) {
  soundMuted = Boolean(muted);
}

export function toggleSoundMuted() {
  soundMuted = !soundMuted;
  if (!soundMuted) {
    playNotificationSound('success');
  }
  return soundMuted;
}
