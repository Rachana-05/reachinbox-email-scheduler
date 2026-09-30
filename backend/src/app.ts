import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "./queue";
import { indexEmail } from "./elasticsearch";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { pool } from "./db";
import { searchEmails } from "./elasticsearch";
import { scheduleEmails } from "./emailService";

dotenv.config();

const app = express();

/* =====================================================
   BULL BOARD - QUEUE MONITORING
   ===================================================== */

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

/* =====================================================
   MIDDLEWARE
   ===================================================== */

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());


// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      message:
        "ReachInbox Email Scheduler API is running",
    });
  } catch (error) {
    console.error(
      "Health check failed:",
      error
    );

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});


// =====================================================
// TEST QUEUE
// =====================================================

app.get("/api/test-queue", (_req, res) => {
  res.json({
    message: "Queue endpoint is working",
  });
});


// =====================================================
// GET ALL EMAILS
// =====================================================

app.get("/api/emails/all", async (_req, res) => {
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
        error_message,
        message_id,
        bull_job_id,
        created_at,
        updated_at
      FROM emails
      ORDER BY created_at DESC
    `);

    res.json({
      emails: result.rows,
    });
  } catch (error) {
    console.error(
      "Failed to fetch all emails:",
      error
    );

    res.status(500).json({
      error: "Failed to fetch emails",
    });
  }
});


// =====================================================
// SEARCH EMAILS
// =====================================================

app.get(
  "/api/emails/search",
  async (req, res) => {
    try {
      const query =
        typeof req.query.q === "string"
          ? req.query.q.trim()
          : "";

      if (!query) {
        return res.json({
          emails: [],
        });
      }

      const emails =
        await searchEmails(query);

      res.json({
        emails,
      });
    } catch (error) {
      console.error(
        "Email search failed:",
        error
      );

      res.status(500).json({
        error: "Email search failed",
      });
    }
  }
);


// =====================================================
// GET SCHEDULED EMAILS
// =====================================================

app.get(
  "/api/emails/scheduled",
  async (_req, res) => {
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
        WHERE status = 'scheduled'
        ORDER BY scheduled_at ASC
      `);

      res.json({
        emails: result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to fetch scheduled emails:",
        error
      );

      res.status(500).json({
        error:
          "Failed to fetch scheduled emails",
      });
    }
  }
);


// =====================================================
// GET SENT EMAILS
// =====================================================

app.get(
  "/api/emails/sent",
  async (_req, res) => {
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
          message_id,
          created_at,
          updated_at
        FROM emails
        WHERE status = 'sent'
        ORDER BY sent_at DESC
      `);

      res.json({
        emails: result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to fetch sent emails:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch sent emails",
      });
    }
  }
);


// =====================================================
// GET FAILED EMAILS
// =====================================================

app.get(
  "/api/emails/failed",
  async (_req, res) => {
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
          error_message,
          created_at,
          updated_at
        FROM emails
        WHERE status = 'failed'
        ORDER BY updated_at DESC
      `);

      res.json({
        emails: result.rows,
      });
    } catch (error) {
      console.error(
        "Failed to fetch failed emails:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch failed emails",
      });
    }
  }
);


// =====================================================
// SCHEDULE EMAIL CAMPAIGN
// =====================================================

app.post(
  "/api/emails/schedule",
  async (req, res) => {
    try {
      const {
        userId,
        senderId,
        recipients,
        subject,
        body,
        startTime,
        delaySeconds,
        hourlyLimit,
      } = req.body;


      // -----------------------------------------------
      // BASIC VALIDATION
      // -----------------------------------------------

      if (!userId) {
        return res.status(400).json({
          error: "userId is required",
        });
      }

      if (!senderId) {
        return res.status(400).json({
          error: "senderId is required",
        });
      }

      if (
        !Array.isArray(recipients) ||
        recipients.length === 0
      ) {
        return res.status(400).json({
          error:
            "At least one recipient is required",
        });
      }

      if (
        typeof subject !== "string" ||
        !subject.trim()
      ) {
        return res.status(400).json({
          error: "Subject is required",
        });
      }

      if (
        typeof body !== "string" ||
        !body.trim()
      ) {
        return res.status(400).json({
          error: "Email body is required",
        });
      }

      if (!startTime) {
        return res.status(400).json({
          error: "startTime is required",
        });
      }


      // -----------------------------------------------
      // EMAIL VALIDATION
      // -----------------------------------------------

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      const invalidRecipients =
        recipients.filter(
          (email: unknown) =>
            typeof email !== "string" ||
            !emailRegex.test(email.trim())
        );

      if (invalidRecipients.length > 0) {
        return res.status(400).json({
          error:
            "One or more recipient email addresses are invalid",
          invalidRecipients,
        });
      }


      // -----------------------------------------------
      // DATE VALIDATION
      // -----------------------------------------------

      const parsedStartTime =
        new Date(startTime);

      if (
        Number.isNaN(
          parsedStartTime.getTime()
        )
      ) {
        return res.status(400).json({
          error: "Invalid startTime",
        });
      }

      if (
        parsedStartTime.getTime() <=
        Date.now()
      ) {
        return res.status(400).json({
          error:
            "startTime must be in the future",
        });
      }


      // -----------------------------------------------
      // DELAY
      // -----------------------------------------------

      const parsedDelay =
        Number(delaySeconds ?? 2);

      if (
        !Number.isFinite(parsedDelay) ||
        parsedDelay < 2
      ) {
        return res.status(400).json({
          error:
            "delaySeconds must be at least 2",
        });
      }


      // -----------------------------------------------
      // HOURLY LIMIT
      // -----------------------------------------------

      const parsedHourlyLimit =
        Number(hourlyLimit ?? 100);

      if (
        !Number.isFinite(
          parsedHourlyLimit
        ) ||
        parsedHourlyLimit < 1
      ) {
        return res.status(400).json({
          error:
            "hourlyLimit must be at least 1",
        });
      }


      // -----------------------------------------------
      // SCHEDULE
      // -----------------------------------------------

      console.log(
        "📨 Scheduling campaign:",
        {
          userId,
          senderId,
          recipients:
            recipients.length,
          subject,
          startTime:
            parsedStartTime.toISOString(),
          delaySeconds:
            parsedDelay,
          hourlyLimit:
            parsedHourlyLimit,
        }
      );

      const result =
        await scheduleEmails({
          userId,
          senderId,
          recipients:
            recipients.map(
              (email: string) =>
                email.trim()
            ),
          subject: subject.trim(),
          body: body.trim(),
          startTime:
            parsedStartTime.toISOString(),
          delaySeconds:
            parsedDelay,
          hourlyLimit:
            parsedHourlyLimit,
        });


      // -----------------------------------------------
      // RESPONSE
      // -----------------------------------------------

      res.status(201).json({
        success: true,
        message:
          "Email campaign scheduled successfully",
        campaign:
          result.campaign,
        emails:
          result.emails,
      });

    } catch (error) {

      console.error(
        "❌ Schedule endpoint failed:",
        error
      );

      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to schedule email campaign",
      });
    }
  }
);


// =====================================================
// START SERVER
// =====================================================

app.post("/api/emails/:id/cancel", async (req, res) => {
  const { id } = req.params;

  try {
    // Atomically cancel only if the email is still scheduled.
    const result = await pool.query(
      `
      UPDATE emails
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE id = $1
        AND status = 'scheduled'
      RETURNING *
      `,
      [id]
    );

    if (result.rowCount === 0) {
      const existing = await pool.query(
        `SELECT id, status FROM emails WHERE id = $1`,
        [id]
      );

      if (existing.rowCount === 0) {
        return res.status(404).json({
          error: "Email not found",
        });
      }

      return res.status(409).json({
        error: `Email cannot be cancelled because its current status is '${existing.rows[0].status}'`,
      });
    }

    const email = result.rows[0];

    // Remove the delayed BullMQ job if it still exists.
    if (email.bull_job_id) {
      try {
        const job = await emailQueue.getJob(email.bull_job_id);

        if (job) {
          await job.remove();
          console.log(`🗑️ Removed BullMQ job ${email.bull_job_id}`);
        }
      } catch (queueError) {
        console.error("Failed to remove BullMQ job:", queueError);
        // DB cancellation is already safe. Worker will skip cancelled email.
      }
    }

    // Keep Elasticsearch in sync.
    await indexEmail(email);

    return res.json({
      success: true,
      message: "Email cancelled successfully",
      email,
    });
  } catch (error) {
    console.error("Cancel email error:", error);

    return res.status(500).json({
      error: "Failed to cancel email",
    });
  }
});
export default app;