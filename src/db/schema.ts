import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uuid,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

export const levelEnum = pgEnum("log_level", [
  "debug",
  "info",
  "warn",
  "error",
]);

export const logs = pgTable(
  "logs",
  {
    id: uuid("id")
      .notNull()
      .$defaultFn(() => uuidv7()),
    timestamp: timestamp("timestamp", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    service: text("service").notNull(),
    level: levelEnum("level").default("info").notNull(),
    message: text("message").notNull(),
    attributes: jsonb("attributes")
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, string | number | boolean>>(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.timestamp] }),
    index("idx_logs_time_id").on(table.timestamp.desc(), table.id.desc()),
    index("idx_logs_service_level").on(table.service, table.level),
    index("idx_logs_attributes").using("gin", table.attributes),
  ],
);

export type LogRow = typeof logs.$inferSelect;
export type NewLogRow = typeof logs.$inferInsert;
export type LogAttributes = Record<string, string | number | boolean>;
