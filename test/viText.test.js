import test from 'node:test';
import assert from 'node:assert/strict';
import { viNotification, viServerMessage, toVietnamese, viFieldError } from '../src/utils/viText.js';
import { applyServerWarrantyEligibility } from '../src/utils/warrantyPolicy.js';

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

test('viText: thông báo và mã lỗi chấm công ra tiếng Việt chuẩn', () => {
  assert.equal(viServerMessage('Duplicate shift', 'ATTENDANCE_SHIFT_DUPLICATE', 409), 'Bạn đã vào ca này rồi.');
  assert.equal(
    viServerMessage('Not usable', 'TECHNICIAN_SHIFT_NOT_USABLE', 422),
    'Ca này không còn hiệu lực (đã hủy hoặc không phải ca hôm nay).',
  );
  assert.equal(viServerMessage('Locked', 'ATTENDANCE_LOCKED', 422), 'Ngày công đã chốt, không chấm được.');
  assert.equal(viNotification({ type: 'SHIFT_ASSIGNED' }).title, 'Bạn được xếp ca làm mới');
  assert.equal(viNotification({ type: 'ATTENDANCE_APPROVED' }).title, 'Chấm công đã được duyệt');
  assert.equal(viNotification({ type: 'ATTENDANCE_REJECTED' }).title, 'Chấm công bị từ chối');
  assert.equal(viNotification({ type: 'VIOLATION_RECORDED' }).title, 'Ghi nhận vi phạm mới');
  assert.equal(viNotification({ type: 'ATTENDANCE_PERIOD_LOCKED' }).title, 'Đã chốt kỳ công');
});

test('viText: dịch chuỗi tiếng Anh 1 từ, chuỗi hỗn hợp, bảo toàn mã đơn & thư điện tử, và các mã lỗi mới', () => {
  for (const w of ['Failed', 'Pending', 'Timeout', 'Error', 'Cancelled']) {
    const res = toVietnamese(w, 'Có lỗi xảy ra');
    assert.ok(VI.test(res), `expected Vietnamese for ${w}, got: ${res}`);
    assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(res), `leaked English word ${w}: ${res}`);
  }

  const stMixed = toVietnamese('Đơn REQ-1602621059 đang ở trạng thái PENDING_PAYMENT', 'Đơn có cập nhật');
  assert.ok(stMixed.includes('REQ-1602621059'));
  assert.ok(stMixed.includes('Chờ thanh toán'));
  assert.ok(!/PENDING_PAYMENT/.test(stMixed));

  const checkInMixed = toVietnamese('Bạn chưa check-in tại nhà khách', '');
  assert.ok(!/check-?in/i.test(checkInMixed), `leaked check-in: ${checkInMixed}`);

  const timeoutMixed = toVietnamese('Lỗi timeout khi gọi server', '');
  assert.ok(!/timeout|server/i.test(timeoutMixed), `leaked timeout/server: ${timeoutMixed}`);

  const mailPreserved = toVietnamese('Đã gửi mã OTP tới email khachhang@gmail.com', '');
  assert.ok(mailPreserved.includes('khachhang@gmail.com'), `email address altered: ${mailPreserved}`);
  assert.ok(!/\botp\b|\bemail\b/i.test(mailPreserved.replace('khachhang@gmail.com', '')));

  for (const code of ['CHECK_IN_REQUIRED', 'RECEIPT_REQUIRED', 'PROCEDURE_INCOMPLETE', 'WARRANTY_FINAL_DAY_CUTOFF', 'NOT_PAYABLE_YET', 'CUSTOMER_PAYS_BY_QR']) {
    const msg = viServerMessage('Error', code, 400);
    assert.ok(VI.test(msg), `missing Vietnamese for ${code}: ${msg}`);
    assert.ok(!/voucher|check-?in|timeout|bill|hotline/i.test(msg), `loanword in ${code}: ${msg}`);
  }

  const vNotif = viNotification({ type: 'VOUCHER_RECEIVED' });
  assert.ok(!/voucher/i.test(`${vNotif.title} ${vNotif.body}`), `voucher leaked: ${JSON.stringify(vNotif)}`);

  const wSrv = applyServerWarrantyEligibility({ totalDays: 60, text: 'Hết bảo hành' }, { eligible: false, warranty_days: 60, message: 'Warranty has expired on server' });
  assert.ok(VI.test(wSrv.text));
  assert.ok(!/warranty|expired|server/i.test(wSrv.text), `warranty English leaked: ${wSrv.text}`);
});
