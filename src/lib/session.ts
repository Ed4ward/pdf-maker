import type { ViewMode, PageEntry, Replacement, TextBox } from "@/types";

/** 本地会话快照(IndexedDB):刷新或稍后回来原样还原全部编辑状态 */
export interface StoredSession {
  version: 1;
  savedAt: number;
  fileName: string;
  /** 原始 PDF 字节(未经 pdf.js 转移的副本) */
  pdfBytes: Uint8Array;
  pageList: PageEntry[];
  replacements: Record<string, Replacement>;
  textBoxes: TextBox[];
  current: number;
  viewMode: ViewMode;
  zoom: number;
}

const DB_NAME = "pdfmaker";
const STORE = "session";
const KEY = "session";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

export async function saveSession(session: StoredSession): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(session, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    // 配额不足 / 隐私模式等场景:静默降级为无持久化
    console.warn("会话保存失败(不影响使用)", err);
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const session = await new Promise<StoredSession | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as StoredSession | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return session?.pdfBytes ? session : null;
  } catch (err) {
    console.warn("会话读取失败", err);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
