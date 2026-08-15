import { sql } from "drizzle-orm";
import type { DB } from "../db/index.js";

type PartitionRow = { tablename: string };

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

  const todayTable = getTableName(today);

  // 1. Create partition for TODAY
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS ${todayTable} 
    PARTITION OF logs 
    FOR VALUES FROM ('${getBoundaryDate(today)}') TO ('${getBoundaryDate(tomorrow)}');
  `),
  );
  //2. Delete partitions older than 7 days
  const retentionDays = parseInt(process.env.RETENTION_DAYS || "7", 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays); //its get the day of month and subtracts 7 days from it.

  const partitions = await db.execute(
    sql.raw(
      `SELECT tablename FROM pg_tables WHERE tablename ~ '^logs_[0-9]{4}_[0-9]{2}_[0-9]{2}$'`,
    ),
  );

  const newPartitions: Date[] = (partitions.rows as PartitionRow[]).map(
    (row) => new Date(row.tablename.slice(5).replaceAll("_", "-")),
  );
  for (const partitionDate of newPartitions) {
    if (partitionDate < cutoff) {
      const partitionTable = getTableName(partitionDate);
      await db.execute(sql.raw(`DROP TABLE IF EXISTS ${partitionTable};`));
    }
  }
}
