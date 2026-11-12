import type { DatabaseSync } from "node:sqlite";

/** Remove the legacy global name constraint without changing group IDs or child references. */
export function migrateSubscriptionGroupNames(database: DatabaseSync): boolean {
  const indexes = database.prepare("PRAGMA index_list(subscription_groups)").all() as Array<{ name: string; unique: number }>;
  const globalNameIndexes = indexes.filter(index => index.unique &&
    (database.prepare("SELECT name FROM pragma_index_info(?)").all(index.name) as Array<{ name: string | null }>)
      .map(column => column.name).join("\0") === "name");
  if (!globalNameIndexes.length) return false;

  const excluded = new Set(globalNameIndexes.map(index => index.name));
  const artifacts = (database.prepare("SELECT name, sql FROM sqlite_schema WHERE tbl_name = 'subscription_groups' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name").all() as Array<{ name: string; sql: string }>)
    .filter(artifact => !excluded.has(artifact.name));
  const foreignKeys = Number((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys);
  const legacyAlter = Number((database.prepare("PRAGMA legacy_alter_table").get() as { legacy_alter_table: number }).legacy_alter_table);
  // Disable FK actions before the transaction: dropping the old parent must never cascade to members.
  database.exec("PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON");
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
        CREATE TABLE subscription_groups_workspace_migration (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, channel TEXT NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        INSERT INTO subscription_groups_workspace_migration (id, name, description, channel, status, created_at, updated_at)
          SELECT id, name, description, channel, status, created_at, updated_at FROM subscription_groups;
        DROP TABLE subscription_groups;
        ALTER TABLE subscription_groups_workspace_migration RENAME TO subscription_groups;
      `);
      for (const artifact of artifacts) database.exec(artifact.sql);
      const violations = database.prepare("PRAGMA foreign_key_check").all();
      if (violations.length) throw new Error("Subscription group migration failed foreign key integrity checks.");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.exec(`PRAGMA legacy_alter_table = ${legacyAlter}; PRAGMA foreign_keys = ${foreignKeys}`);
  }
  return true;
}
