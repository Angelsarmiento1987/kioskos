import test from 'node:test';
import assert from 'node:assert/strict';
import {orderQrValue,parseOrderLookup,closedOrderNotice,orderForView} from '../shared/order-qr.mjs';
test('Order QR roundtrip retains kiosk and full order ID',()=>{
 assert.deepEqual(parseOrderLookup(orderQrValue('school-a','order-123'),'school-a'),{orderId:'order-123'});
});
test('Typed codes are trimmed and normalized',()=>assert.deepEqual(parseOrderLookup(' r-1042 ','school-a'),{code:'R-1042'}));
test('Another kiosk, account credentials, malformed data and paths are rejected',()=>{
 for(const value of ['recreo:order:school-b:order-123','recreo:account:school-a:user-1','recreo:order:school-a:../../orders','recreo:order:school-a:','https://example.test','']) assert.throws(()=>parseOrderLookup(value,'school-a'));
});
test('Closed states have explicit pickup warnings',()=>{
 for(const status of ['delivered','cancelled','uncollected']) assert.ok(closedOrderNotice(status));
 assert.equal(closedOrderNotice('ready'),'');
});
test('An old pending snapshot cannot override an already delivered server result',()=>{
 const delivered={id:'o',status:'delivered'}, pending={id:'o',status:'received'};
 assert.equal(orderForView(pending,delivered),delivered);
 assert.equal(orderForView(delivered,pending),delivered);
});
