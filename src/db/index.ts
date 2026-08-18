import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EmptyRelations } from "drizzle-orm";

export type DB = NodePgDatabase<EmptyRelations> & {
  $client: Pool;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 25,
});

export const db = drizzle({ client: pool });
export { pool };
