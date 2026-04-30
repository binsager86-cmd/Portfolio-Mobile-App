import { openDatabaseSync } from "expo-sqlite";

export type SyncDb = {
  execSync: (sql: string) => void;
  getAllSync: <T>(sql: string, params?: unknown[]) => T[];
  prepareSync: (sql: string) => {
    run: (...params: unknown[]) => void;
    finalizeSync: () => void;
  };
};

export function openSyncDb(name: string): SyncDb | null {
  try {
    return openDatabaseSync(name) as unknown as SyncDb;
  } catch {
    return null;
  }
}
