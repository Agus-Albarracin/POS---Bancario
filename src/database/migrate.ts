import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { getDatabaseConfig } from "./database.config.js";

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('api-event.products.migrations'))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS app_products_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const applied = await client.query(
      "SELECT id FROM app_products_migrations WHERE id = $1",
      ["001-products"],
    );
    if (applied.rowCount === 0) {
      const sql = await readFile(
        new URL("../../migrations/001-products.sql", import.meta.url),
        "utf8",
      );
      await client.query(sql);
      await client.query(
        "INSERT INTO app_products_migrations (id) VALUES ($1)",
        ["001-products"],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pool = new Pool(getDatabaseConfig());
  try {
    await migrate(pool);
    console.log("Migraciones de productos aplicadas.");
  } catch {
    console.error(
      "No se pudo aplicar la migración. Revisa la conexión y el esquema existente.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
