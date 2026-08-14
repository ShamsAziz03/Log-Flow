import express, { Application } from "express";
import { db } from "./db/index.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appState } from "./states.js";
import healthRouter from "./routes/healthRoutes.js";
import logsRouter from "./routes/logsRoutes.js";
import { addDeletePartitions } from "./jobs/partitionScript.js";
import { Request, Response, NextFunction } from "express";
import { BadRequestError } from "./errors/badRequest.js";
import { NotFoundError } from "./errors/notFound.js";
import { UnauthorizedError } from "./errors/unauthorized.js";
import { ForbiddenError } from "./errors/forbidden.js";

const app: Application = express();
const PORT: number = 3000;

app.use(express.json({ limit: "10mb" }));

function errorHandler(
  err: any,
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

app.use(errorHandler);

async function setUp() {
  await migrate(db, { migrationsFolder: "./src/db/drizzle" });
  await addDeletePartitions(db);

  setInterval(
    async () => {
      try {
        await addDeletePartitions(db);
      } catch (error) {
        console.error(
          "Failed to add new partitions and delete old ones in interval:",
          error,
        );
      }
    },
    60 * 60 * 1000 * 3,
  );
}

async function start() {
  app.listen(PORT, async () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    try {
      await setUp();
      appState.dbReady = true;
      console.log("Database connected successfully!");
    } catch (error) {
      console.error("Database connection failed!");
      console.error(error);
    }
  });
}

start();
