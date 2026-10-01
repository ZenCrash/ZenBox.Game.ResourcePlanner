export interface CatalogStorage {
  get<T extends { id: string }>(kind: string, revision: string, ids: string[]): Promise<T[]>;
  put<T extends { id: string }>(kind: string, revision: string, values: T[]): Promise<void>;
}
const MAX_ENTRIES = 5000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
let database: Promise<IDBDatabase | null> | undefined;
const diagnostics = { persistentHits: 0, networkBatches: 0 };
export const catalogCacheDiagnostics = () => ({ ...diagnostics });

function open() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return database ??= new Promise(resolve => {
    let finished = false;
    const finish = (db: IDBDatabase | null) => { if (!finished) { finished = true; clearTimeout(timer); resolve(db); } else db?.close(); };
    const timer = setTimeout(() => finish(null), 1500);
    try {
      const request = indexedDB.open("resource-planner-catalog", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("entries", { keyPath: "key" });
        store.createIndex("storedAt", "storedAt");
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        finish(db);
      };
    } catch { finish(null); }
  });
}

export const indexedCatalog: CatalogStorage = {
  async get<T extends { id: string }>(kind: string, revision: string, ids: string[]) {
    const db = await open();
    if (!db || !ids.length) return [];
    return new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction("entries", "readonly");
      const store = transaction.objectStore("entries");
      const values: T[] = [];
      for (const id of ids) {
        const request = store.get([kind, id]);
        request.onsuccess = () => {
          const entry = request.result;
          if (entry?.revision === revision && entry.storedAt > Date.now() - MAX_AGE && entry.value?.id === id)
            values.push(entry.value);
        };
      }
      transaction.oncomplete = () => resolve(values);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  },
  async put(kind, revision, values) {
    const db = await open();
    if (!db || !values.length) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("entries", "readwrite");
      const store = transaction.objectStore("entries");
      for (const value of values) store.put({ key: [kind, value.id], revision, storedAt: Date.now(), value });
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - MAX_ENTRIES;
        if (excess <= 0) return;
        const cursor = store.index("storedAt").openCursor();
        cursor.onsuccess = () => {
          if (cursor.result && excess-- > 0) { cursor.result.delete(); cursor.result.continue(); }
        };
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  },
};

export async function readCatalogBatch<T extends { id: string }>(
  kind: string, revision: string, ids: string[], read: (ids: string[]) => Promise<T[]>, storage = indexedCatalog,
) {
  // Cache failures (private browsing, quota, corrupt storage) never block loading.
  const cached = await storage.get<T>(kind, revision, ids).catch(() => []);
  diagnostics.persistentHits += cached.length;
  const found = new Map(cached.map(value => [value.id, value]));
  const missing = ids.filter(id => !found.has(id));
  if (missing.length) {
    diagnostics.networkBatches++;
    const fresh = await read(missing);
    fresh.forEach(value => found.set(value.id, value));
    void storage.put(kind, revision, fresh).catch(() => {});
  }
  return ids.flatMap(id => found.has(id) ? [found.get(id)!] : []);
}
