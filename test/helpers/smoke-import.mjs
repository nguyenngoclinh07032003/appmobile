import './register-loader.mjs';
const ctx = await import('../../src/context/AppContext.js');
const sync = await import('../../src/services/syncService.js');
console.log(typeof ctx.orderTotal, typeof ctx.customerStatusMeta, typeof ctx.warrantyInfo, typeof sync.mapBackendCustomerRequestToOrder);
