import { defineConfig } from "drizzle-kit";
import path from "path";
import { config } from "dotenv";

// Try loading .env from several candidate locations
const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../artifacts/api-server/.env"),
  path.resolve(process.cwd(), "artifacts/api-server/.env"),
];
for (const p of candidates) {
  const result = config({ path: p });
  if (!result.error) break;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
