import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVietnamesePhone,
  validateStreetAddress,
  validateContactName,
  parseDobToIso,
  isValidDob,
} from '../src/utils/validators.js';

test('validateVietnamesePhone: chấp nhận số hợp lệ', () => {
  assert.equal(validateVietnamesePhone('0912345678'), '');
  assert.equal(validateVietnamesePhone('0389998877'), '');
  assert.equal(validateVietnamesePhone('0866554433'), '');
  assert.equal(validateVietnamesePhone('0771234567'), '');
  assert.equal(validateVietnamesePhone('0581234567'), '');
});

test('validateVietnamesePhone: từ chối số không hợp lệ', () => {
  assert.match(validateVietnamesePhone(''), /Vui lòng nhập/);
  assert.match(validateVietnamesePhone('091234'), /10 chữ số/);
  assert.match(validateVietnamesePhone('1912345678'), /bắt đầu bằng/);
  assert.match(validateVietnamesePhone('0112345678'), /đầu số di động/);
  assert.match(validateVietnamesePhone('0888888888'), /không có thực/);
  assert.match(validateVietnamesePhone('0123456789'), /đầu số di động/);
});

test('validateContactName: kiểm tra họ tên', () => {
  assert.equal(validateContactName('Nguyễn Văn A'), '');
  assert.equal(validateContactName('Lê Thị Bích'), '');
  assert.match(validateContactName(''), /Vui lòng nhập/);
  assert.match(validateContactName('A'), /ít nhất 2 ký tự/);
  assert.match(validateContactName('Nguyễn 123'), /chỉ được chứa chữ cái/);
});

test('validateStreetAddress: kiểm tra địa chỉ chi tiết', () => {
  assert.equal(validateStreetAddress('Số 12 ngõ 45 phố Kim Mã'), '');
  assert.equal(validateStreetAddress('Tòa Golden Park số 2 Phạm Văn Bạch'), '');
  assert.match(validateStreetAddress(''), /Vui lòng nhập/);
  assert.match(validateStreetAddress('HN'), /quá ngắn/);
  assert.match(validateStreetAddress('12345 67890 bcdfgh'), /không chứa từ có nghĩa/);
});

test('isValidDob & parseDobToIso: kiểm tra ngày sinh và chặn ngày ảo 31/02', () => {
  assert.equal(parseDobToIso('15/08/1995'), '1995-08-15');
  assert.equal(parseDobToIso('1/1/2000'), '2000-01-01');
  assert.equal(isValidDob('15/08/1995'), true);

  // Ngày không có thật
  assert.equal(parseDobToIso('31/02/1995'), null);
  assert.equal(isValidDob('31/02/1995'), false);

  // Năm không nhuận không có 29/02
  assert.equal(parseDobToIso('29/02/2023'), null);
  assert.equal(isValidDob('29/02/2023'), false);

  // Năm nhuận 2024 có 29/02
  assert.equal(parseDobToIso('29/02/2024'), '2024-02-29');
  assert.equal(isValidDob('29/02/2024'), true);

  // Ngày tương lai
  assert.equal(parseDobToIso('01/01/2099'), null);
  assert.equal(isValidDob('01/01/2099'), false);
});
