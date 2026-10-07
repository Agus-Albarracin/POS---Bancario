import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import type { PoolConfig } from "pg";

export function getDatabaseConfig(): PoolConfig {
  const envFile = new URL("../../.env", import.meta.url);
  if (existsSync(envFile)) {
    loadEnvFile(envFile);
  }

  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  if (!user || !password) {
    throw new Error(
      "Configure DB_USER y DB_PASSWORD en las variables de entorno.",
    );
  }

  const port = Number(process.env.DB_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT debe ser un puerto válido.");
  }

  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port,
    user,
    password,
    database: process.env.DB_NAME ?? "productos",
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  };
}
