import { sql } from "drizzle-orm";
import type { DB } from "../db/index.js";

//format table name (e.g., logs_2026_07_20)
function getTableName(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `logs_${yyyy}_${mm}_${dd}`;
}

// format date (e.g., 2026-07-20)
function getBoundaryDate(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function addPartitions(db: DB) {
  const today = new Date();
  const tomorrow = new Date(today.getTime());
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const todayTable = getTableName(today);

  // 1. Create partition for TODAY
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS ${todayTable} 
    PARTITION OF logs 
    FOR VALUES FROM ('${getBoundaryDate(today)}') TO ('${getBoundaryDate(tomorrow)}');
  `),
  );
}
