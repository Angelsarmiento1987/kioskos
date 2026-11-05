import { useCallback, useEffect, useRef, useState } from "react";
import { createOrderSound } from "./order-sound.js";
function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("rekreo-order-alerts") || "null");
    return { enabled: stored?.enabled === true, volume: Math.max(0.1, Math.min(1, Number(stored?.volume) || 0.55)) };
  } catch { return { enabled: false, volume: 0.55 }; }
}
export function useOrderAlerts(scope) {
  const [settings, setSettings] = useState(readSettings), [ready, setReady] = useState(false);
  const [pending, setPending] = useState([]), [error, setError] = useState("");
  const sound = useRef(null), timers = useRef([]), current = useRef(settings), generation = useRef(0);
  current.current = settings;
  if (!sound.current) sound.current = createOrderSound();
  const stop = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; sound.current.stop(); }, []);
  useEffect(() => {
    try { localStorage.setItem("rekreo-order-alerts", JSON.stringify(settings)); } catch {}
    if (!settings.enabled) stop();
  }, [settings, stop]);
  useEffect(() => {
    generation.current++; stop(); setPending([]); setError(""); setReady(sound.current.ready);
    return () => { generation.current++; stop(); };
  }, [scope, stop]);
  useEffect(() => {
    if (!scope || !settings.enabled) return;
    const prime = () => { sound.current.unlock().then(setReady).catch(() => {}); };
    const refresh = () => setReady(sound.current.ready);
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [scope, settings.enabled]);
  useEffect(() => () => sound.current.close(), []);
  const receive = useCallback((orders) => {
    if (!orders.length) return;
    setPending((previous) => [...orders, ...previous.filter((old) => !orders.some((fresh) => fresh.id === old.id))]);
    stop();
    if (!current.current.enabled) return;
    const ring = () => {
      try { setReady(sound.current.play(current.current.volume)); }
      catch { setReady(false); setError("No se pudo reproducir el sonido. El aviso visual sigue disponible; probá habilitar el audio nuevamente."); }
    };
    ring();
    timers.current = [setTimeout(ring, 4000), setTimeout(ring, 8000)];
  }, [stop]);
  useEffect(() => { if (!pending.length) stop(); }, [pending.length, stop]);
  const test = async () => {
    const version = generation.current;
    try {
      setError("");
      const unlocked = await sound.current.unlock();
      if (version !== generation.current) return;
      setReady(unlocked);
      if (!unlocked) throw Error("Tocá Activar sonido para habilitar el audio.");
      setSettings((old) => ({ ...old, enabled: true }));
      sound.current.play(current.current.volume);
    } catch (failure) { setError(failure.message); setReady(false); }
  };
  return { pending, settings, ready, error, receive, test,
    mute: () => { stop(); setSettings((old) => ({ ...old, enabled: false })); },
    volume: (volume) => setSettings((old) => ({ ...old, volume })),
    acknowledge: () => { stop(); setPending([]); },
    reconcile: (orders) => setPending((previous) => {
      const open = previous.filter((order) => orders.some((row) => row.id === order.id && row.status === "received"));
      return open.length === previous.length ? previous : open;
    }),
  };
}
