import type { ConfigDoc } from "./types";
import { parseVersion } from "./version";

// A migration upgrades a document across ONE major boundary: from major
// `fromMajor` to `fromMajor + 1`. It transforms the document body; the
// version stamp is applied by migrateDocument.
export type Migration = (doc: ConfigDoc) => ConfigDoc;

const migrations = new Map<number, Migration>();

export function registerMigration(fromMajor: number, fn: Migration): void {
  migrations.set(fromMajor, fn);
}

// Test-only: reset the registry between cases.
export function _clearMigrationsForTest(): void {
  migrations.clear();
}

// Migrate `doc` from its current MIDL major up to the target version's major,
// applying each registered major-step migration in order. Same major is a
// no-op (minor/build are forward-compatible). Downgrades are not supported.
export function migrateDocument(doc: ConfigDoc, targetMidlVersion: string): ConfigDoc {
  const from = parseVersion(doc.midl);
  const to = parseVersion(targetMidlVersion);
  if (to.major < from.major) throw new Error(`cannot downgrade MIDL ${doc.midl} -> ${targetMidlVersion}`);
  let current = doc;
  for (let major = from.major; major < to.major; major++) {
    const fn = migrations.get(major);
    if (!fn) throw new Error(`no migration registered for MIDL major ${major} -> ${major + 1}`);
    current = fn(current);
  }
  if (to.major === from.major) return current;
  return { ...current, midl: targetMidlVersion };
}
