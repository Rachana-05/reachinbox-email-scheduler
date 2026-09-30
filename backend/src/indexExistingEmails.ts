import dotenv from "dotenv";

dotenv.config();

import { pool } from "./db";
import { indexEmail } from "./elasticsearch";

const indexExistingEmails = async () => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        campaign_id,
        sender_id,
        recipient,
        subject,
        body,
        scheduled_at,
        sent_at,
        status,
        created_at,
        updated_at
      FROM emails
    `);

    console.log(`📦 Found ${result.rows.length} emails`);

    for (const email of result.rows) {
      await indexEmail(email);
    }

    console.log("✅ Existing emails indexed successfully");
  } catch (error) {
    console.error("❌ Indexing failed:", error);
  } finally {
    await pool.end();
  }
};

indexExistingEmails();