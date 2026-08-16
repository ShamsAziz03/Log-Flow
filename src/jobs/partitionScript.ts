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

export async function addDeletePartitions(db: DB) {
  const today = new Date();
  const tomorrow = new Date(today.getTime());
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const dayAfter = new Date(today.getTime());
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);

  const todayTable = getTableName(today);

  // 1. Create partition for TODAY
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS ${todayTable} 
    PARTITION OF logs 
    FOR VALUES FROM ('${getBoundaryDate(today)}') TO ('${getBoundaryDate(tomorrow)}');
  `),
  );

  // 2. Create partition for TOMORROW (Crucial for the "5 minutes in future" rule)
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS ${getTableName(tomorrow)} 
    PARTITION OF logs 
    FOR VALUES FROM ('${getBoundaryDate(tomorrow)}') TO ('${getBoundaryDate(dayAfter)}');
  `),
  );

  //3. Delete partition older than 30 days
  const retentionDays = parseInt(process.env.RETENTION_DAYS || "30", 10);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

  await db.execute(
    sql.raw(`
    DROP TABLE IF EXISTS ${getTableName(cutoff)};
  `),
  );
}

export async function backfillPartitions(db: DB) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - 30);

  for (let i = 0; i < 30; i++) {
    day.setUTCDate(day.getUTCDate() + 1);

    const nextDay = new Date(day.getTime());
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const tableName = getTableName(day);

    await db.execute(
      sql.raw(`
        CREATE TABLE IF NOT EXISTS ${tableName}
        PARTITION OF logs
        FOR VALUES FROM ('${getBoundaryDate(day)}') TO ('${getBoundaryDate(nextDay)}');
      `),
    );
  }
}
