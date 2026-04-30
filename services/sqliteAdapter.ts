// TypeScript-visible stub — Metro replaces this with sqliteAdapter.native.ts
// or sqliteAdapter.web.ts at bundle time via platform-specific resolution.
export type SyncDb = {
  execSync: (sql: string) => void;
  getAllSync: <T>(sql: string, params?: unknown[]) => T[];
  prepareSync: (sql: string) => {
    run: (...params: unknown[]) => void;
    finalizeSync: () => void;
  };
};

export function openSyncDb(_name: string): SyncDb | null {
  return null;
}
