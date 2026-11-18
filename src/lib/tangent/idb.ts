const DB_NAME = "tangent-slides";
const STORE = "pages";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open slide storage"));
  });
}

function finish(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Slide storage failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Slide storage aborted"));
  });
}

export async function savePages(lectureId: string, pages: readonly string[]): Promise<void> {
  const db = await openDb();
  try {
    await clearPages(lectureId, db);
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    pages.forEach((page, index) => {
      store.put(page, key(lectureId, index));
    });
    store.put(pages.length, countKey(lectureId));
    await finish(tx);
  } finally {
    db.close();
  }
}

export async function loadPages(lectureId: string): Promise<string[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const count = await request<number | undefined>(store.get(countKey(lectureId)));
    const total = typeof count === "number" ? count : 0;
    const pages: string[] = [];
    for (let index = 0; index < total; index += 1) {
      const page = await request<string | undefined>(store.get(key(lectureId, index)));
      pages.push(typeof page === "string" ? page : "");
    }
    await finish(tx);
    return pages;
  } finally {
    db.close();
  }
}

export async function clearPages(lectureId: string, existing?: IDBDatabase): Promise<void> {
  const db = existing ?? (await openDb());
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const count = await request<number | undefined>(store.get(countKey(lectureId)));
    const total = typeof count === "number" ? count : 0;
    for (let index = 0; index < total; index += 1) store.delete(key(lectureId, index));
    store.delete(countKey(lectureId));
    await finish(tx);
  } finally {
    if (!existing) db.close();
  }
}

function key(lectureId: string, index: number): string {
  return `${lectureId}:${index}`;
}

function countKey(lectureId: string): string {
  return `${lectureId}:count`;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Slide read failed"));
  });
}
