-- Custom SQL migration file, put your code below! --
DROP TABLE IF EXISTS logs CASCADE;

DROP TYPE IF EXISTS log_level;
CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');

CREATE TABLE "logs" (
  "id" uuid NOT NULL,
  "timestamp" timestamptz NOT NULL,
  "service" text NOT NULL,
  "level" "log_level" DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
   CONSTRAINT "logs_timestamp_id_unique" UNIQUE ("timestamp", "id")
) PARTITION BY RANGE ("timestamp");

CREATE INDEX idx_logs_time_id ON logs (timestamp DESC, id DESC);
CREATE INDEX idx_logs_service_level ON logs (service, level);
CREATE INDEX idx_logs_attributes ON logs USING GIN (attributes);  