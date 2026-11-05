// Each kiosk listener owns its monitor. Only committed server snapshots can alert.
export function createOrderMonitor() {
  let ready = false;
  const seen = new Set();
  return {
    accept(rows, { fromCache = false, hasPendingWrites = false } = {}) {
      if (fromCache || hasPendingWrites) return [];
      if (!ready) {
        for (const order of rows) seen.add(order.id);
        ready = true;
        return [];
      }
      const incoming = [];
      for (const order of rows) {
        if (!order.id || seen.has(order.id)) continue;
        seen.add(order.id);
        if (order.status === "received" && order.source !== "counter") incoming.push(order);
      }
      return incoming;
    },
  };
}
