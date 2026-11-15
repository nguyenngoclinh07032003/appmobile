import test from 'node:test';
import assert from 'node:assert/strict';
import { viNotification, viServerMessage, toVietnamese, viFieldError } from '../src/utils/viText.js';

const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

test('viText: thông báo tiếng Anh theo loại được Việt hoá', () => {
  const n = viNotification({ type: 'QUOTATION_SENT', title: 'New quotation', body: 'Technician sent a quotation for request HRM261108-03' });
  assert.equal(n.title, 'Có báo giá mới');
  assert.ok(VI.test(n.body));
  assert.ok(n.body.includes('HRM261108-03'));
});

test('viText: mã trạng thái trong thông báo đổi sang tiếng Việt', () => {
  const n = viNotification({ type: 'REQUEST_STATUS_CHANGED', title: 'Request updated', body: 'Request HRM261108-03 status changed to PENDING_PAYMENT' });
  assert.ok(n.body.includes('Chờ thanh toán'));
  assert.ok(!/PENDING_PAYMENT/.test(n.body));
});

test('viText: thông báo lạ vẫn ra tiếng Việt', () => {
  const n = viNotification({ type: 'SOMETHING', title: 'Something happened to your booking today', body: 'Please open the app' });
  assert.ok(VI.test(n.title));
  assert.ok(VI.test(n.body));
});

test('viText: thông báo đã là tiếng Việt giữ nguyên', () => {
  const n = viNotification({ title: 'Thợ đã nhận đơn', body: 'Đơn HRM1 đã có thợ' });
  assert.equal(n.title, 'Thợ đã nhận đơn');
  assert.equal(n.body, 'Đơn HRM1 đã có thợ');
});

test('viText: lỗi server tiếng Anh được Việt hoá', () => {
  assert.equal(viServerMessage('Invalid credentials', 'INVALID_CREDENTIALS', 401), 'Số điện thoại hoặc mật khẩu không đúng.');
  assert.ok(VI.test(viServerMessage('Some weird english error happened', null, 400)));
  assert.ok(VI.test(viServerMessage('Request not found', 'WHATEVER', 404)));
  assert.equal(toVietnamese('Payment received', ''), 'Đã nhận thanh toán');
  assert.equal(viFieldError({ field: 'phone', message: 'phone is required' }), 'Số điện thoại: là bắt buộc');
});
