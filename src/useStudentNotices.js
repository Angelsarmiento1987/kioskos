import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";
import { studentNotices, noticeReadId } from "../shared/student-notices.mjs";
export function useStudentNotices(session, data) {
  const scope = session?.role === "student" && session.kioskId ? `${session.uid}:${session.kioskId}` : null;
  const current = useRef(scope); current.current = scope;
  const [state, setState] = useState({ scope: null, reads: new Set(), loaded: false, error: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true; setSaving(false); setState({ scope, reads: new Set(), loaded: false, error: "" });
    if (!scope) return;
    const unsubscribe = onSnapshot(query(collection(db, "usuarios", session.uid, "noticeReads"), where("kioskId", "==", session.kioskId)), { includeMetadataChanges: true }, snapshot => {
      if (!live || snapshot.metadata.hasPendingWrites) return;
      setState({ scope, reads: new Set(snapshot.docs.map(d => d.data().noticeId)), loaded: true, error: "" });
    }, () => { if (live) setState(old => ({ ...old, scope, loaded: true, error: "No pudimos sincronizar tus avisos. Revisá la conexión y que las reglas de Firestore estén publicadas." })); });
    return () => { live = false; unsubscribe(); };
  }, [scope]);
  const rows = scope ? studentNotices(session.uid, data.orders, data.movements) : [];
  const reads = state.scope === scope ? state.reads : new Set();
  const items = rows.map(n => ({ ...n, read: reads.has(n.id) }));
  async function markRead(ids) {
    if (!scope || saving || !ids.length) return;
    setSaving(true);
    try {
      const valid = new Set(items.map(n => n.id));
      const unique = [...new Set(ids)].filter(id => valid.has(id));
      for (let i = 0; i < unique.length; i += 400) {
        const batch = writeBatch(db);
        for (const id of unique.slice(i, i + 400)) batch.set(doc(db, "usuarios", session.uid, "noticeReads", noticeReadId(session.kioskId, id)), { kioskId: session.kioskId, noticeId: id, readAt: serverTimestamp() });
        let timer;
        try { await Promise.race([batch.commit(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Sin confirmación de conexión")), 15000); })]); }
        finally { clearTimeout(timer); }
        if (current.current !== scope) return;
      }
    } catch { if (current.current === scope) setState(old => ({ ...old, error: "No pudimos confirmar la lectura. Los avisos siguen disponibles; reintentá con conexión." })); }
    finally { if (current.current === scope) setSaving(false); }
  }
  return { items, unread: items.filter(n => !n.read), loaded: state.scope === scope && state.loaded, error: state.scope === scope ? state.error : "", saving, markRead };
}
