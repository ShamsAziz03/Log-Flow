/// <reference types="node" />

import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/db/drizzle',          //to store migration files   
  schema: './src/db/schema.ts',   
  dialect: 'postgresql',      
  dbCredentials: {
    url: process.env.DATABASE_URL??"",
  },
});
