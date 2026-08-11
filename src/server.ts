import express, { Application } from "express";
import { db } from "./db/index.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appState } from "./states.js";
import healthRouter from "./routes/healthRoutes.js";
import logsRouter from "./routes/logsRoutes.js";

const app: Application = express();
const PORT: number = 3000;

app.use(express.json({ limit: "10mb" }));

app.use(healthRouter);
app.use(logsRouter);

async function start() {
  await migrate(db, { migrationsFolder: "./src/db/drizzle" });

  app.listen(PORT, async () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    try {
      appState.dbReady = true;
      console.log("Database connected successfully!");
    } catch (error) {
      console.error("Database connection failed!");
      console.error(error);
    }
  });
}

start();
