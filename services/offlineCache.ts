import { openSyncDb, type SyncDb } from "./sqliteAdapter";
import Constants from "expo-constants";

const DB_NAME = "portfolio_offline_v1.db";

type SyncStatus = "idle" | "syncing" | "error";

export interface SyncMeta {
  lastSync: string;
  status: SyncStatus;
  conflictCount: number;
}

type HoldingRow = {
  symbol: string;
  name: string | null;
  quantity: number;
  price: number;
  pnl: number;
  synced_at: string;
};

type NewsRow = {
  id: string;
  title: string | null;
  source: string | null;
  published_at: string | null;
  content_hash: string | null;
  synced_at: string;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const fallbackMeta = new Map<string, string | number>();

const metaStorage: {
  getString: (key: string) => string | undefined;
  getNumber: (key: string) => number | undefined;
  set: (key: string, value: string | number) => void;
} = (() => {
  const runtimeInfo = Constants as {
    appOwnership?: string;
    executionEnvironment?: string;
  };
  const isExpoGoRuntime =
    runtimeInfo.appOwnership === "expo" ||
    runtimeInfo.executionEnvironment === "storeClient";
  type MMKVMetaStore = {
    getString: (key: string) => string | undefined;
    getNumber: (key: string) => number | undefined;
    set: (key: string, value: string | number) => void;
  };

  let mmkvMetaStore: MMKVMetaStore | null | undefined;
  const getMMKVMetaStore = (): MMKVMetaStore | null => {
    if (isExpoGoRuntime) return null;
    if (mmkvMetaStore !== undefined) return mmkvMetaStore;
    try {
      // Avoid static native dependency initialization issues on web/dev runtimes.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MMKV } = require("react-native-mmkv") as {
        MMKV: new (cfg: { id: string }) => MMKVMetaStore;
      };
      mmkvMetaStore = new MMKV({ id: "sync-metadata" });
    } catch {
      mmkvMetaStore = null;
    }
    return mmkvMetaStore;
  };

  return {
    getString: (key: string) => {
      const store = getMMKVMetaStore();
      if (store) {
        try {
          return store.getString(key);
        } catch {
          const v = fallbackMeta.get(key);
          return typeof v === "string" ? v : undefined;
        }
      }
      const v = fallbackMeta.get(key);
      return typeof v === "string" ? v : undefined;
    },
    getNumber: (key: string) => {
      const store = getMMKVMetaStore();
      if (store) {
        try {
          return store.getNumber(key);
        } catch {
          const v = fallbackMeta.get(key);
          return typeof v === "number" ? v : undefined;
        }
      }
      const v = fallbackMeta.get(key);
      return typeof v === "number" ? v : undefined;
    },
    set: (key: string, value: string | number) => {
      const store = getMMKVMetaStore();
      if (store) {
        try {
          store.set(key, value);
          return;
        } catch {
          // Fall through to in-memory fallback.
        }
      }
      fallbackMeta.set(key, value);
    },
  };
})();

const memoryHoldings = new Map<string, HoldingRow>();
const memoryNews = new Map<string, NewsRow>();

const db = (() => {
  try {
    return openSyncDb(DB_NAME);
  } catch {
    return null;
  }
})();

if (db) {
  db.execSync(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS holdings (
      symbol TEXT PRIMARY KEY,
      name TEXT,
      quantity REAL DEFAULT 0,
      price REAL DEFAULT 0,
      pnl REAL DEFAULT 0,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS news_feed (
      id TEXT PRIMARY KEY,
      title TEXT,
      source TEXT,
      published_at TEXT,
      content_hash TEXT,
      synced_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_holdings_synced ON holdings(synced_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_synced ON news_feed(synced_at DESC);
  `);
}

export const OfflineCache = {
  getHoldingsSync(): HoldingRow[] {
    if (!db) {
      return [...memoryHoldings.values()].sort((a, b) => b.pnl - a.pnl);
    }
    return db.getAllSync<HoldingRow>("SELECT * FROM holdings ORDER BY pnl DESC");
  },

  getNewsSync(limit: number): NewsRow[] {
    if (!db) {
      return [...memoryNews.values()]
        .sort((a, b) => safeString(b.published_at).localeCompare(safeString(a.published_at)))
        .slice(0, limit);
    }
    return db.getAllSync<NewsRow>("SELECT * FROM news_feed ORDER BY published_at DESC LIMIT ?", [limit]);
  },

  upsertHoldings(rows: Record<string, unknown>[]): void {
    const now = new Date().toISOString();

    if (!db) {
      for (const r of rows) {
        const symbol = safeString(r.symbol);
        if (!symbol) continue;
        const existing = memoryHoldings.get(symbol);
        const incoming: HoldingRow = {
          symbol,
          name: typeof r.name === "string" ? r.name : null,
          quantity: safeNumber(r.quantity),
          price: safeNumber(r.price),
          pnl: safeNumber(r.pnl),
          synced_at: now,
        };
        if (!existing || incoming.synced_at > existing.synced_at) {
          memoryHoldings.set(symbol, incoming);
        }
      }
      return;
    }

    const stmt = db.prepareSync(`
      INSERT INTO holdings (symbol, name, quantity, price, pnl, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        name=excluded.name,
        quantity=excluded.quantity,
        price=excluded.price,
        pnl=excluded.pnl,
        synced_at=excluded.synced_at
      WHERE excluded.synced_at > holdings.synced_at
    `);

    try {
      for (const r of rows) {
        const symbol = safeString(r.symbol);
        if (!symbol) continue;
        stmt.run(
          symbol,
          typeof r.name === "string" ? r.name : null,
          safeNumber(r.quantity),
          safeNumber(r.price),
          safeNumber(r.pnl),
          now,
        );
      }
    } finally {
      stmt.finalizeSync();
    }
  },

  upsertNews(articles: Record<string, unknown>[]): void {
    const now = new Date().toISOString();

    if (!db) {
      for (const a of articles) {
        const id = safeString(a.id);
        if (!id || memoryNews.has(id)) continue;
        memoryNews.set(id, {
          id,
          title: typeof a.title === "string" ? a.title : null,
          source: typeof a.source === "string" ? a.source : null,
          published_at: typeof a.published_at === "string" ? a.published_at : null,
          content_hash: typeof a.content_hash === "string" ? a.content_hash : null,
          synced_at: now,
        });
      }
      return;
    }

    const stmt = db.prepareSync(`
      INSERT OR IGNORE INTO news_feed (id, title, source, published_at, content_hash, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const a of articles) {
        const id = safeString(a.id);
        if (!id) continue;
        stmt.run(
          id,
          typeof a.title === "string" ? a.title : null,
          typeof a.source === "string" ? a.source : null,
          typeof a.published_at === "string" ? a.published_at : null,
          typeof a.content_hash === "string" ? a.content_hash : null,
          now,
        );
      }
    } finally {
      stmt.finalizeSync();
    }
  },

  getMeta(): SyncMeta {
    return {
      lastSync: metaStorage.getString("lastSync") || "1970-01-01T00:00:00.000Z",
      status: (metaStorage.getString("syncStatus") as SyncStatus) || "idle",
      conflictCount: metaStorage.getNumber("conflictCount") || 0,
    };
  },

  updateMeta(update: Partial<SyncMeta>): void {
    if (update.lastSync) metaStorage.set("lastSync", update.lastSync);
    if (update.status) metaStorage.set("syncStatus", update.status);
    if (update.conflictCount !== undefined) metaStorage.set("conflictCount", update.conflictCount);
  },
};
