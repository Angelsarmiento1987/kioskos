import test from "node:test";
import assert from "node:assert/strict";
import { createOrderMonitor } from "../shared/order-alerts.mjs";
const order = (id, status = "received") => ({ id, status, code: `R-${id}` });
test("Abrir el panel no dispara alarmas por pedidos antiguos", () => {
 const monitor = createOrderMonitor();
 assert.deepEqual(monitor.accept([order("old")], { fromCache: true }), []);
 assert.deepEqual(monitor.accept([order("old"), order("also-old")]), []);
 assert.deepEqual(monitor.accept([order("new"), order("old"), order("also-old")]).map(x=>x.id), ["new"]);
});
test("Los cambios de estado y las lecturas repetidas no duplican el aviso", () => {
 const monitor=createOrderMonitor(); monitor.accept([]);
 assert.deepEqual(monitor.accept([order("a"),order("b")]).map(x=>x.id),["a","b"]);
 assert.deepEqual(monitor.accept([order("a","preparing"),order("b")]),[]);
 monitor.accept([]);
 assert.deepEqual(monitor.accept([order("a"),order("b")]),[]);
});
test("No suena por escrituras sin confirmar; detecta las nuevas al reconectar", () => {
 const monitor=createOrderMonitor(); monitor.accept([order("old")]);
 assert.deepEqual(monitor.accept([order("new")], {hasPendingWrites:true}),[]);
 assert.deepEqual(monitor.accept([order("new")], {fromCache:true}),[]);
 assert.deepEqual(monitor.accept([order("old"),order("new")]).map(x=>x.id),["new"]);
});
test("Ignora cobros de mostrador y pedidos ya cerrados o preparados", () => {
 const monitor=createOrderMonitor(); monitor.accept([]);
 assert.deepEqual(monitor.accept([order("delivered","delivered"),order("cancelled","cancelled"),order("ready","ready"),{...order("counter"),source:"counter"}]),[]);
 assert.deepEqual(monitor.accept([order("cancelled")]),[]);
});
test("Cambiar de kiosko reinicia la referencia sin mezclar avisos", () => {
 const first=createOrderMonitor();first.accept([]);first.accept([order("x")]);
 const next=createOrderMonitor(); assert.deepEqual(next.accept([order("x"),order("z")]),[]);
 assert.deepEqual(next.accept([order("x"),order("z"),order("y")]).map(x=>x.id),["y"]);
});
