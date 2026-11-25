import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import './helpers/register-loader.mjs';

// Cho phép test import bản thật của src/services/api.js qua query ?real=1.
register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier.includes('api.js?real=1')) {
        return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  `)}`,
  import.meta.url,
);

const {
  isTechAssignmentViewable,
  isTechBillPriorityJob,
  selectTechJobsForHydration,
} = await import('../src/services/syncService.js');
const { hrmssApi, authTokens } = await import('../src/services/api.js?real=1');

const makeJwt = (expOffsetSec) => {
  const hdr = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const pay = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSec })).toString('base64url');
  return `${hdr}.${pay}.sig`;
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('isTechAssignmentViewable: chỉ cho phép ACTIVE và ENDED, loại CANCELLED và trạng thái thu hồi', () => {
  assert.equal(isTechAssignmentViewable({ assignment_id: 1, assignment_status: 'ACTIVE' }), true);
  assert.equal(isTechAssignmentViewable({ assignment_id: 2, assignment_status: 'ENDED' }), true);
  assert.equal(isTechAssignmentViewable({ assignment_id: 3, assignment_status: 'CANCELLED' }), false);
  assert.equal(isTechAssignmentViewable({ assignment_id: 4, assignment_status: 'cancelled' }), false);
  assert.equal(isTechAssignmentViewable({ assignment_id: 5, assignment_status: 'RELEASED' }), false);
  assert.equal(isTechAssignmentViewable({ assignment_id: 6, assignment_status: 'REASSIGNED' }), false);
  assert.equal(isTechAssignmentViewable({ assignment_id: 7, assignment_status: 'REVOKED' }), false);
  assert.equal(isTechAssignmentViewable({ assignment_id: 8, assignment_status: 'EXPIRED' }), false);
  assert.equal(isTechAssignmentViewable({ assignment_status: 'ACTIVE' }), false);
});

test('selectTechJobsForHydration: bỏ qua phân công CANCELLED dù đơn sang thanh toán hoặc có phí kiểm tra', () => {
  const jobs = [
    // Case thực tế gây 404: phân công 1 đã CANCELLED, đơn 5 đã đi tiếp sang PENDING_PAYMENT với thợ khác
    { assignment_id: 1, assignment_status: 'CANCELLED', request: { request_id: 5, request_status: 'PENDING_PAYMENT' } },
    // Phân công CANCELLED trên đơn CANCELLED có arrived_at vẫn không được gọi bill/ảnh
    { assignment_id: 2, assignment_status: 'CANCELLED', arrived_at: '2026-11-26T00:00:00Z', request: { request_id: 6, request_status: 'CANCELLED_BY_CUSTOMER' } },
    // Phân công ENDED đã xong, đơn đang chờ thanh toán -> cần lấy bill & ảnh
    { assignment_id: 3, assignment_status: 'ENDED', request: { request_id: 7, request_status: 'PENDING_PAYMENT' } },
    // Phân công ENDED trên đơn CANCELLED nhưng thợ đã tới hiện trường -> cần lấy bill kiểm tra phí
    { assignment_id: 4, assignment_status: 'ENDED', arrived_at: '2026-11-26T00:10:00Z', request: { request_id: 8, request_status: 'CANCELLED_BY_CUSTOMER' } },
    // Phân công ACTIVE hiện tại -> ưu tiên đầu danh sách
    { assignment_id: 5, assignment_status: 'ACTIVE', request: { request_id: 9, request_status: 'IN_PROGRESS' } },
  ];
  const openItems = [
    { request_id: 5 }, // đơn 5 thợ đã bị CANCELLED -> không được gọi /uploads?request_id=5
    { request_id: 99 }, // đơn bắn tự do chưa có phân công ACTIVE/ENDED -> không được gọi /uploads?request_id=99
    { request_id: 9 }, // đơn trùng phân công ACTIVE của thợ -> được phép
  ];

  assert.equal(isTechBillPriorityJob(jobs[0]), false);
  assert.equal(isTechBillPriorityJob(jobs[1]), false);
  assert.equal(isTechBillPriorityJob(jobs[2]), true);
  assert.equal(isTechBillPriorityJob(jobs[3]), true);

  const { activeJobsList, billJobIds, openItemsWithPhotoAccess } = selectTechJobsForHydration(jobs, openItems);
  assert.deepEqual(activeJobsList.map((j) => j.assignment_id), [5, 3, 4]);
  assert.deepEqual(billJobIds, ['5', '3', '4']);
  assert.deepEqual(openItemsWithPhotoAccess.map((r) => r.request_id), [9]);
});

test('api: 404 JOB_NOT_FOUND / REQUEST_NOT_FOUND ở bill và uploads trả noAccess=true và không log warn', async () => {
  const prevFetch = globalThis.fetch;
  const prevWarn = console.warn;
  const warnings = [];
  authTokens.clear();
  authTokens.set(makeJwt(3600));
  console.warn = (...args) => warnings.push(args);
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/technician/jobs/1/bill')) {
      return jsonResponse(404, { code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }
    if (u.includes('/uploads?request_id=5')) {
      return jsonResponse(404, { code: 'REQUEST_NOT_FOUND', message: 'Request not found.' });
    }
    if (u.includes('/uploads?job_id=1')) {
      return jsonResponse(404, { code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }
    return jsonResponse(500, { code: 'ERROR', message: 'Unexpected URL' });
  };

  try {
    const billRes = await hrmssApi.getTechnicianJobBill(1);
    assert.equal(billRes.ok, false);
    assert.equal(billRes.status, 404);
    assert.equal(billRes.code, 'JOB_NOT_FOUND');
    assert.equal(billRes.noAccess, true);

    const reqPhotoRes = await hrmssApi.listRequestPhotos(5);
    assert.equal(reqPhotoRes.ok, false);
    assert.equal(reqPhotoRes.status, 404);
    assert.equal(reqPhotoRes.code, 'REQUEST_NOT_FOUND');
    assert.equal(reqPhotoRes.noAccess, true);

    const jobPhotoRes = await hrmssApi.listJobPhotos(1);
    assert.equal(jobPhotoRes.ok, false);
    assert.equal(jobPhotoRes.status, 404);
    assert.equal(jobPhotoRes.code, 'JOB_NOT_FOUND');
    assert.equal(jobPhotoRes.noAccess, true);

    assert.equal(warnings.length, 0);
  } finally {
    globalThis.fetch = prevFetch;
    console.warn = prevWarn;
    authTokens.clear();
  }
});
