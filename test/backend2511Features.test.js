import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const {
  LOCATION_PING_MS,
  shouldPingTechLocation,
  parseValidCoordinates,
  buildAddressCoordinatesPayload,
  canShowOnsiteQuoteApproval,
  validateOnsiteApprovalInput,
} = await import('../src/utils/dispatchHelpers.js');
const {
  getServiceSectionKey,
  getServiceSectionStats,
  findCurrentServiceKey,
  getDefaultOpenServiceKeys,
  computeNextOpenServiceKeysAfterTick,
  getIncompleteRequiredServiceKeys,
  formatProcedureIncompleteAlert,
} = await import('../src/utils/procedureHelpers.js');
const {
  mapBackendAddressToApp,
  mapBackendTechJobToOrder,
  mapBackendOpenRequestToOrder,
  mergeBackendOrdersWithLocal,
} = await import('../src/services/syncService.js');
const { viNotification, viServerMessage, viFieldError } = await import('../src/utils/viText.js');

describe('25/11 Dispatch & Location Ping helpers', () => {
  test('shouldPingTechLocation chỉ cho phép role tech có token và giãn cách 3 phút trừ khi force', () => {
    assert.equal(LOCATION_PING_MS, 180000);
    assert.equal(shouldPingTechLocation({ role: 'customer', hasToken: true, force: true }), false);
    assert.equal(shouldPingTechLocation({ role: 'tech', hasToken: false, force: true }), false);
    assert.equal(
      shouldPingTechLocation({ role: 'tech', hasToken: true, lastPingAt: 1000, now: 1000 + 179999, force: false }),
      false,
    );
    assert.equal(
      shouldPingTechLocation({ role: 'tech', hasToken: true, lastPingAt: 1000, now: 1000 + 180000, force: false }),
      true,
    );
    assert.equal(
      shouldPingTechLocation({ role: 'tech', hasToken: true, lastPingAt: 1000, now: 2000, force: true }),
      true,
    );
  });

  test('buildAddressCoordinatesPayload gửi cả latitude và longitude hoặc không gửi cả hai', () => {
    assert.deepEqual(parseValidCoordinates(21.0285, 105.8542), { latitude: 21.0285, longitude: 105.8542 });
    assert.equal(parseValidCoordinates(null, 105.8542), null);
    assert.equal(parseValidCoordinates(21.0285, ''), null);
    assert.equal(parseValidCoordinates(95, 105.8542), null);
    assert.deepEqual(buildAddressCoordinatesPayload(21.0285, 105.8542), { latitude: 21.0285, longitude: 105.8542 });
    assert.deepEqual(buildAddressCoordinatesPayload(21.0285, null), {});
    assert.deepEqual(buildAddressCoordinatesPayload(undefined, undefined), {});
  });
});

describe('24-25/11 Onsite quotation approval helpers', () => {
  test('canShowOnsiteQuoteApproval chỉ hiện với thợ chính, đã check-in, đang chờ duyệt và khách chưa xác nhận dùng app', () => {
    const baseOrder = {
      status: 'quoted',
      backendStatus: 'DIAGNOSED_PENDING_QUOTATION',
      arrivedAt: 1700000000000,
      customerHasApp: null,
      quote: { status: 'SENT', approved: false, revisionRequested: false },
    };
    assert.equal(canShowOnsiteQuoteApproval(baseOrder, { mine: true, isSupport: false }), true);
    assert.equal(canShowOnsiteQuoteApproval({ ...baseOrder, customerHasApp: false }, { mine: true, isSupport: false }), true);
    assert.equal(canShowOnsiteQuoteApproval({ ...baseOrder, customerHasApp: true }, { mine: true, isSupport: false }), false);
    assert.equal(canShowOnsiteQuoteApproval(baseOrder, { mine: true, isSupport: true }), false);
    assert.equal(canShowOnsiteQuoteApproval(baseOrder, { mine: false, isSupport: false }), false);
    assert.equal(canShowOnsiteQuoteApproval({ ...baseOrder, arrivedAt: null, checkIn: null }, { mine: true, isSupport: false }), false);
    assert.equal(canShowOnsiteQuoteApproval({ ...baseOrder, quote: { approved: true } }, { mine: true, isSupport: false }), false);
  });

  test('validateOnsiteApprovalInput kiểm tra 1-5 ảnh và ghi chú <= 500 ký tự', () => {
    assert.equal(validateOnsiteApprovalInput({ photoUris: [] }).ok, false);
    assert.equal(validateOnsiteApprovalInput({ photoUris: ['1', '2', '3', '4', '5', '6'] }).ok, false);
    assert.equal(validateOnsiteApprovalInput({ photoUris: ['file:///a.jpg'], note: 'x'.repeat(501) }).ok, false);
    const okRes = validateOnsiteApprovalInput({ photoUris: ['file:///a.jpg'], note: '  Khách ký giấy  ' });
    assert.equal(okRes.ok, true);
    assert.equal(okRes.note, 'Khách ký giấy');
  });
});

describe('25/11 Collapsible procedure helpers', () => {
  const sampleProc = {
    total_steps: 4,
    done_steps: 2,
    progress_percent: 50,
    current_step: { step_id: 21, request_service_id: 102 },
    services: [
      {
        request_service_id: 101,
        service_id: 1,
        service_name: 'Vệ sinh máy lạnh',
        steps: [
          { step_id: 11, step_no: 1, status: 'DONE', is_required: true },
          { step_id: 12, step_no: 2, status: 'SKIPPED', is_required: false },
        ],
      },
      {
        request_service_id: 102,
        service_id: 2,
        service_name: 'Sửa máy giặt',
        steps: [
          { step_id: 21, step_no: 1, status: 'PENDING', is_required: true },
          { step_id: 22, step_no: 2, status: 'PENDING', is_required: false },
        ],
      },
    ],
  };

  test('getServiceSectionKey, getServiceSectionStats và getDefaultOpenServiceKeys', () => {
    assert.equal(getServiceSectionKey(sampleProc.services[0], 0), '101');
    assert.deepEqual(getServiceSectionStats(sampleProc.services[0]), {
      total: 2,
      done: 2,
      allDone: true,
      hasRequiredPending: false,
    });
    assert.deepEqual(getServiceSectionStats(sampleProc.services[1]), {
      total: 2,
      done: 0,
      allDone: false,
      hasRequiredPending: true,
    });
    assert.equal(findCurrentServiceKey(sampleProc), '102');
    assert.deepEqual([...getDefaultOpenServiceKeys(sampleProc)], ['102']);
    assert.deepEqual(
      [...getDefaultOpenServiceKeys({ services: [sampleProc.services[0]] })],
      ['101'],
    );
    assert.deepEqual([...getDefaultOpenServiceKeys(null)], []);
  });

  test('computeNextOpenServiceKeysAfterTick tự đóng dịch vụ vừa xong và mở dịch vụ tiếp theo', () => {
    const nextProc = {
      ...sampleProc,
      current_step: { step_id: 21, request_service_id: 102 },
      services: [
        sampleProc.services[0],
        {
          ...sampleProc.services[1],
          steps: [
            { step_id: 21, step_no: 1, status: 'DONE', is_required: true },
            { step_id: 22, step_no: 2, status: 'PENDING', is_required: false },
          ],
        },
      ],
    };
    const stillOpen = computeNextOpenServiceKeysAfterTick(new Set(['102']), sampleProc, nextProc, 21);
    assert.deepEqual([...stillOpen], ['102']);

    const doneProc = {
      ...nextProc,
      current_step: null,
      services: [
        {
          ...sampleProc.services[0],
          steps: [{ step_id: 11, step_no: 1, status: 'DONE', is_required: true }],
        },
        {
          ...sampleProc.services[1],
          steps: [
            { step_id: 21, step_no: 1, status: 'DONE', is_required: true },
            { step_id: 22, step_no: 2, status: 'DONE', is_required: false },
          ],
        },
      ],
    };
    const closedAfterLast = computeNextOpenServiceKeysAfterTick(new Set(['102']), nextProc, doneProc, 22);
    assert.deepEqual([...closedAfterLast], []);
  });

  test('getIncompleteRequiredServiceKeys và formatProcedureIncompleteAlert phân biệt phần thợ chính vs thợ phụ', () => {
    assert.deepEqual(getIncompleteRequiredServiceKeys(sampleProc, []), ['102']);
    const allDoneOwnProc = {
      services: [sampleProc.services[0]],
    };
    const msgSupport = formatProcedureIncompleteAlert(allDoneOwnProc, [
      { message: 'Sửa điện: Bước 2 chưa xong' },
    ]);
    assert.match(msgSupport, /Phần việc của thợ phụ chưa hoàn thành, liên hệ thợ phụ/);
    assert.match(msgSupport, /Sửa điện: Bước 2 chưa xong/);

    const msgOwn = formatProcedureIncompleteAlert(sampleProc, [
      { message: 'Sửa máy giặt: Bước 1 chưa xong' },
    ]);
    assert.match(msgOwn, /Các bước thực hiện/);
    assert.match(msgOwn, /Sửa máy giặt: Bước 1 chưa xong/);
  });
});

describe('25/11 syncService & viText updates', () => {
  test('mapBackendAddressToApp, mapBackendTechJobToOrder, mapBackendOpenRequestToOrder và mergeBackendOrdersWithLocal', () => {
    const addr = mapBackendAddressToApp({
      address_id: 10,
      address_text: '12 Trần Duy Hưng',
      latitude: 21.0123,
      longitude: 105.7987,
      is_default: true,
    });
    assert.equal(addr.lat, 21.0123);
    assert.equal(addr.lng, 105.7987);

    const job = mapBackendTechJobToOrder({
      assignment_id: 55,
      assignment_status: 'ACTIVE',
      assignment_role: 'SUPPORT',
      procedure: null,
      request: {
        request_id: 99,
        request_code: 'REQ-99',
        request_status: 'DIAGNOSED_PENDING_QUOTATION',
        customer_has_app: false,
      },
    });
    assert.equal(job.customerHasApp, false);
    assert.equal(job.procedure, null);

    const openReq = mapBackendOpenRequestToOrder({
      request_id: 100,
      request_code: 'REQ-100',
      service_location: { latitude: 21.03, longitude: 105.81 },
    });
    assert.equal(openReq.address.lat, 21.03);
    assert.equal(openReq.address.lng, 105.81);

    const merged = mergeBackendOrdersWithLocal(
      [{ dbRequestId: 99, code: 'REQ-99', status: 'quoted', customerHasApp: false }],
      [{ dbRequestId: 99, code: 'REQ-99', status: 'quoted', customerHasApp: null }],
    );
    assert.equal(merged[0].customerHasApp, false);
  });

  test('viText dịch đúng các mã lỗi và thông báo mới ngày 24-25/11', () => {
    assert.match(viServerMessage('', 'NO_LOCATION', 409), /Bật định vị/);
    assert.match(viServerMessage('', 'TOO_FAR', 409), /20 km/);
    assert.match(viServerMessage('', 'PRE_VISIT_QUOTE_NEEDS_APP', 409), /Khách không dùng app/);
    assert.match(viServerMessage('', 'CUSTOMER_HAS_APP', 409), /Khách dùng app/);
    assert.match(viServerMessage('', 'INVALID_VISIT_STATE', 409), /Chưa xác nhận đến nơi/);
    assert.match(viFieldError({ field: 'photo_ids', message: 'is required' }), /Ảnh báo giá có chữ ký/);
    const notif = viNotification({ type: 'NEW_OPEN_REQUEST', request_code: 'REQ-500' });
    assert.equal(notif.title, 'Có việc mới gần bạn');
    assert.match(notif.body, /REQ-500/);
  });
});

