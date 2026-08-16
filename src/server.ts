import express, { Application } from "express";
import { db, pool } from "./db/index.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appState } from "./states.js";
import healthRouter from "./routes/healthRoutes.js";
import logsRouter from "./routes/logsRoutes.js";
import {
  addDeletePartitions,
  backfillPartitions,
} from "./jobs/partitionScript.js";
import { Request, Response, NextFunction } from "express";
import { BadRequestError } from "./errors/badRequest.js";
import { NotFoundError } from "./errors/notFound.js";
import { UnauthorizedError } from "./errors/unauthorized.js";
import { ForbiddenError } from "./errors/forbidden.js";
import { monitorEventLoopDelay } from "perf_hooks";

const app: Application = express();
const PORT: number = 8080;

app.use(express.json({ limit: "10mb" }));

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    err instanceof SyntaxError &&
    "type" in err &&
    err.type === "entity.parse.failed"
  ) {
    return res.status(400).json({ error: "Invalid JSON format" });
  }

  if (err instanceof BadRequestError) {
    return res.status(400).json({
      error: err.message,
    });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(401).json({
      error: err.message,
    });
  }

  if (err instanceof ForbiddenError) {
    return res.status(403).json({
      error: err.message,
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: err.message,
    });
  }

  return res.status(500).json({
    error: err.message,
  });
}

app.use(healthRouter);
app.use(logsRouter);

app.use((req, res) => {
  return res.status(404).json({
    error: "Route not found",
  });
});

// backpressure middleware
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

const MAX_LAG_MS = 300;
app.use("/logs", (req, res, next) => {
  const lagMs = h.mean / 1e6;
  if (lagMs > MAX_LAG_MS) {
    res.set("Retry-After", "1");
    return res
      .status(503)
      .json({ error: "server overloaded, try again shortly" });
  }
  next();
});

app.use(errorHandler);

let partitionInterval: NodeJS.Timeout;

async function setUp() {
  await migrate(db, { migrationsFolder: "./src/db/drizzle" });
  await backfillPartitions(db);
  await addDeletePartitions(db);

  partitionInterval = setInterval(
    async () => {
      try {
        await addDeletePartitions(db);
      } catch (error) {
        throw new Error(
          `Failed to add new partitions and delete old ones in interval: ${error}`,
        );
      }
    },
    60 * 60 * 1000 * 3,
  );
}

async function start() {
  const server = app.listen(PORT, async () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    try {
      await setUp();
      appState.dbReady = true;
      console.log("Database connected successfully!");
    } catch (error) {
      console.error("Database connection failed!");
    }
  });

  const shutdown = async () => {
    console.log("Shutting down gracefully...");

    clearInterval(partitionInterval); // Stop the background job

    server.close(async () => {
      console.log("HTTP server closed.");
      await pool.end(); // Close DB connections
      console.log("Database pool closed.");
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 5000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start();
