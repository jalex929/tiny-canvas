import { parseDrawing, type Drawing, type DrawingStore, type DrawingSummary } from "./drawing";

const DB_NAME = "tiny-canvas";
const DB_VERSION = 1;
/** Summaries are small (title, dates, thumbnail) so the shelf loads fast. */
const SUMMARIES = "summaries";
/** Full action lists, read only when a drawing is opened. */
const DOCUMENTS = "documents";

/**
 * Saves drawings in this browser with IndexedDB. Work stays on this device and in this
 * browser profile only; clearing site data removes it.
 */
export class BrowserDrawingStore implements DrawingStore {
  readonly label = "this browser";
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  async list(): Promise<DrawingSummary[]> {
    const db = await this.open();
    const rows = await request<unknown[]>(
      db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll(),
    );
    return rows
      .map((row) => parseDrawing({ ...(row as object), actions: [] }))
      .filter((d): d is Drawing => d !== null)
      .map(toSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Drawing | null> {
    const db = await this.open();
    const tx = db.transaction([SUMMARIES, DOCUMENTS]);
    const [summary, doc] = await Promise.all([
      request<unknown>(tx.objectStore(SUMMARIES).get(id)),
      request<{ actions?: unknown } | undefined>(tx.objectStore(DOCUMENTS).get(id)),
    ]);
    if (!summary) return null;
    return parseDrawing({ ...(summary as object), actions: doc?.actions ?? [] });
  }

  async save(drawing: Drawing): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([SUMMARIES, DOCUMENTS], "readwrite");
    tx.objectStore(SUMMARIES).put(toSummary(drawing));
    tx.objectStore(DOCUMENTS).put({ id: drawing.id, actions: drawing.actions });
    await done(tx);
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([SUMMARIES, DOCUMENTS], "readwrite");
    tx.objectStore(SUMMARIES).delete(id);
    tx.objectStore(DOCUMENTS).delete(id);
    await done(tx);
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SUMMARIES))
          db.createObjectStore(SUMMARIES, { keyPath: "id" });
        if (!db.objectStoreNames.contains(DOCUMENTS))
          db.createObjectStore(DOCUMENTS, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Could not open storage"));
      req.onblocked = () => reject(new Error("Storage is blocked by another tab"));
    });
    // Let a later call retry instead of caching a failure forever.
    this.db.catch(() => (this.db = null));
    return this.db;
  }
}

function toSummary({ id, title, createdAt, updatedAt, thumbnail }: DrawingSummary): DrawingSummary {
  return { id, title, createdAt, updatedAt, thumbnail };
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error("Storage request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Storage write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Storage write was cancelled"));
  });
}

/** Returns a store, or null when this browser blocks IndexedDB (some private modes). */
export function createBrowserStore(): DrawingStore | null {
  try {
    if (typeof indexedDB === "undefined") return null;
    return new BrowserDrawingStore(indexedDB);
  } catch {
    return null;
  }
}
