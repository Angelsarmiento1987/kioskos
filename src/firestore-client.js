// Small reference facade over the public browser SDK; all reads/writes obey Rules.
import * as fs from "firebase/firestore";
export const FieldValue = {
  serverTimestamp: fs.serverTimestamp,
  arrayUnion: fs.arrayUnion,
  arrayRemove: fs.arrayRemove,
  delete: fs.deleteField,
};
export function browserDatabase(database) {
  const snapshot = (s) => ({
    id: s.id,
    exists: s.exists(),
    data: () => s.data(),
    ref: reference(s.ref),
  });
  const querySnapshot = (s) => ({ size: s.size, docs: s.docs.map(snapshot) });
  function reference(native) {
    return {
      native,
      id: native.id,
      collection: (name) => collection(fs.collection(native, name)),
      get: async () => snapshot(await fs.getDocFromServer(native)),
      set: (data, options) =>
        options ? fs.setDoc(native, data, options) : fs.setDoc(native, data),
      update: (data) => fs.updateDoc(native, data),
      delete: () => fs.deleteDoc(native),
    };
  }
  function collection(native, query = native) {
    return {
      native: query,
      isQuery: true,
      doc: (id) => reference(id ? fs.doc(native, id) : fs.doc(native)),
      where: (key, op, value) =>
        collection(native, fs.query(query, fs.where(key, op, value))),
      get: async () => querySnapshot(await fs.getDocsFromServer(query)),
      add: async (data) => reference(await fs.addDoc(native, data)),
    };
  }
  return {
    collection: (name) => collection(fs.collection(database, name)),
    runTransaction: (work) =>
      fs.runTransaction(database, async (tx) =>
        work({
          // Browser transactions read individual docs. Query snapshots below are
          // informational; financial guards also use transactional member counters.
          get: async (ref) =>
            ref.isQuery ? ref.get() : snapshot(await tx.get(ref.native)),
          create: (ref, data) => tx.set(ref.native, data),
          set: (ref, data, options) =>
            options
              ? tx.set(ref.native, data, options)
              : tx.set(ref.native, data),
          update: (ref, data) => tx.update(ref.native, data),
          delete: (ref) => tx.delete(ref.native),
        }),
      ),
    batch: () => {
      const batch = fs.writeBatch(database);
      return {
        update: (ref, data) => batch.update(ref.native, data),
        commit: () => batch.commit(),
      };
    },
  };
}
