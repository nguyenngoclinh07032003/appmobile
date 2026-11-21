import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_VERSION,
  PASSWORD_MIN_LENGTH,
  OTP_TTL_MINUTES,
  BASE_WARRANTY_DAYS,
  FREE_CANCEL_MIN_BEFORE,
} from '../src/constants/appPolicy.js';
import { TECH_POLICY, getCancellationWindowStatus } from '../src/constants/techPolicy.js';
import { HOTLINE } from '../src/constants/data.js';

test('appPolicy: hằng số chính sách nhất quán', () => {
  assert.equal(APP_VERSION, '3.0.8');
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(OTP_TTL_MINUTES, 10);
  assert.equal(BASE_WARRANTY_DAYS, 60);
  assert.equal(FREE_CANCEL_MIN_BEFORE, 60);
});

test('techPolicy: cấu hình kỷ luật thợ', () => {
  assert.equal(TECH_POLICY.maxActiveJobs, 3);
  assert.equal(TECH_POLICY.reputationDefault, 100);
  assert.equal(TECH_POLICY.freeCancelMs, 15 * 60 * 1000); // 15 phút
});

test('techPolicy: getCancellationWindowStatus dùng đúng HOTLINE hiện hành', () => {
  const now = Date.UTC(2026, 10, 21, 5, 0, 0); // 12:00 VN
  const nearOrder = { status: 'confirmed', preferredTimeAt: now + 30 * 60 * 1000, slot: '12h30 - 14h30' };
  const res = getCancellationWindowStatus(nearOrder, now);
  assert.equal(res.allowed, false);
  assert.equal(res.reason.includes(HOTLINE), true);
  assert.equal(res.reason.includes('1900 6868'), false);
});
