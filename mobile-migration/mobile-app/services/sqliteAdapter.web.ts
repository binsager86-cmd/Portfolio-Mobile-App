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
