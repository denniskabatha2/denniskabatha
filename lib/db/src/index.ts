import { config } from "dotenv";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Load .env from multiple candidate locations so this works
// whether invoked from the project root, the package dir, or via pnpm --filter
const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "artifacts/api-server/.env"),
  path.resolve(process.cwd(), "../../artifacts/api-server/.env"),
  path.resolve(process.cwd(), "../../../artifacts/api-server/.env"),
];
for (const p of candidates) {
  const result = config({ path: p, override: false });
  if (!result.error) break;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Create artifacts/api-server/.env with DATABASE_URL=postgresql://user:pass@localhost:5432/dbname",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
