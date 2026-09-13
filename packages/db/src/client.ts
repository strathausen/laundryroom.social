import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// eslint-disable-next-line no-restricted-properties
const connectionString = process.env.POSTGRES_URL;
// `next build` evaluates every route module that imports this file while it
// collects page data, and the docker image is built without a database
// (SKIP_ENV_VALIDATION=1, like the t3-env schemas). node-postgres opens no
// connection until the first query, so an unset url is inert at build time and
// still fails loudly at runtime, where the switch is never set.
// eslint-disable-next-line no-restricted-properties
if (!connectionString && !process.env.SKIP_ENV_VALIDATION) {
  throw new Error("Missing POSTGRES_URL");
}

// Cache the pool on globalThis outside of production so Next.js dev HMR does
// not open a fresh pool (and leak connections) on every module reload.
const globalForDb = globalThis as unknown as { pool: Pool | undefined };

// SSL is driven purely by the connection string: node-postgres honours
// `?sslmode=verify-full` (Neon / hosted dev; `require` still works but pg 8
// logs a security warning for it and pg 9 will stop verifying the server
// certificate) and connects in plaintext when the parameter is absent (dokku
// postgres over the private docker network).
const createPool = () => {
  const p = new Pool({
    connectionString,
    // Fail fast when postgres is unreachable instead of hanging every request
    // until nginx times it out. dokku postgres allows 100 connections, so 10
    // leaves room for drizzle-kit and a future worker next to the app.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });
  // pg re-emits errors from idle clients on the pool (e.g. the server closed
  // the connection during `dokku postgres:restart`). Without a listener node
  // treats that as an uncaught exception, which would exit a plain worker.
  p.on("error", (err) => {
    console.error("[db] idle client error", err);
  });
  return p;
};

export const pool = globalForDb.pool ?? createPool();

// eslint-disable-next-line no-restricted-properties
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { casing: "snake_case", schema });
