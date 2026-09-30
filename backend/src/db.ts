import dotenv from "dotenv";

dotenv.config();

import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not defined. Check backend/.env"
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
});

export const testDatabaseConnection = async () => {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log(
      "✅ PostgreSQL connected:",
      result.rows[0]
    );
  } catch (error) {
    console.error(
      "❌ PostgreSQL connection failed:",
      error
    );

    throw error;
  }
};