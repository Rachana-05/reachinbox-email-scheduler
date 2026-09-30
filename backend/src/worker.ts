import dotenv from "dotenv";

dotenv.config();

import { Worker } from "bullmq";
import { redisConnection, emailQueue } from "./queue";
import { pool } from "./db";
import { sendEmail } from "./mailer";
import { indexEmail } from "./elasticsearch";

const WORKER_CONCURRENCY =
  Number(process.env.WORKER_CONCURRENCY) || 5;

const MIN_EMAIL_DELAY_SECONDS =
  Number(process.env.MIN_EMAIL_DELAY_SECONDS) || 2;


// =====================================================
// REDIS RATE LIMIT SCRIPT
// Atomically:
//   1. Check current hourly count
//   2. Increment if below limit
//   3. Set expiration
// =====================================================

const RATE_LIMIT_SCRIPT = `
local current = redis.call("GET", KEYS[1])

if not current then
  current = 0
else
  current = tonumber(current)
end

local limit = tonumber(ARGV[1])

if current >= limit then
  return 0
end

local newCount = redis.call("INCR", KEYS[1])

redis.call(
  "EXPIRE",
  KEYS[1],
  ARGV[2]
)

return newCount
`;


// =====================================================
// RELEASE RATE LIMIT SLOT
// Used when Redis slot was reserved but DB claim failed.
// =====================================================

const RELEASE_RATE_LIMIT_SCRIPT = `
local current = redis.call("GET", KEYS[1])

if not current then
  return 0
end

current = tonumber(current)

if current <= 1 then
  redis.call("DEL", KEYS[1])
  return 0
end

return redis.call("DECR", KEYS[1])
`;


// =====================================================
// REDIS RATE LIMIT HELPER
// =====================================================

const reserveRateLimitSlot = async (
  senderId: string,
  hourlyLimit: number
): Promise<{
  allowed: boolean;
  key: string;
  nextHour: Date;
}> => {
  const now = new Date();

  const year = now.getUTCFullYear();
  const month = String(
    now.getUTCMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getUTCDate()
  ).padStart(2, "0");

  const hour = String(
    now.getUTCHours()
  ).padStart(2, "0");

  const key =
    `email-rate:${senderId}:${year}-${month}-${day}-${hour}`;

  // Keep key alive slightly beyond the hour.
  const ttlSeconds = 2 * 60 * 60;

  const result =
    await redisConnection.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      hourlyLimit,
      ttlSeconds
    );

  const allowed =
    Number(result) > 0;

  const nextHour =
    new Date(now);

  nextHour.setUTCMinutes(0);
  nextHour.setUTCSeconds(0);
  nextHour.setUTCMilliseconds(0);
  nextHour.setUTCHours(
    nextHour.getUTCHours() + 1
  );

  return {
    allowed,
    key,
    nextHour,
  };
};


// =====================================================
// RELEASE RATE LIMIT SLOT
// =====================================================

const releaseRateLimitSlot = async (
  key: string
) => {
  try {
    await redisConnection.eval(
      RELEASE_RATE_LIMIT_SCRIPT,
      1,
      key
    );
  } catch (error) {
    console.error(
      "❌ Failed to release Redis rate-limit slot:",
      error
    );
  }
};


// =====================================================
// RESCHEDULE EMAIL
// =====================================================

const rescheduleEmail = async (
  emailId: string,
  nextHour: Date
) => {

  const delay =
    Math.max(
      0,
      nextHour.getTime() -
        Date.now()
    );

  const job = await emailQueue.add(
    "send-email",
    {
      emailId,
    },
    {
      delay,

      jobId:
        `email-${emailId}-retry-${nextHour.getTime()}`,

      removeOnComplete: true,

      removeOnFail: false,
    }
  );

  const result =
    await pool.query(
      `
      UPDATE emails
      SET
        status = 'scheduled',
        scheduled_at = $1,
        bull_job_id = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [
        nextHour,
        job.id,
        emailId,
      ]
    );

  if (result.rows.length > 0) {
    await indexEmail(
      result.rows[0]
    );
  }

  console.log(
    `⏰ Email ${emailId} rescheduled`
  );

  console.log(
    `📅 Next attempt: ${nextHour.toISOString()}`
  );

  console.log(
    `📨 New BullMQ job: ${job.id}`
  );

  return job;
};


// =====================================================
// WORKER
// =====================================================

const worker = new Worker(
  "email-sending",

  async (job) => {

    console.log(
      `📨 Processing email job: ${job.id}`
    );


    // -------------------------------------------------
    // VALIDATE JOB
    // -------------------------------------------------

    const emailId =
      job.data?.emailId;

    if (!emailId) {
      throw new Error(
        "emailId is missing from job data"
      );
    }


    // -------------------------------------------------
    // LOAD EMAIL + SENDER + CAMPAIGN
    // -------------------------------------------------

    const result =
      await pool.query(
        `
        SELECT
          e.*,
          s.email AS sender_email,
          c.hourly_limit AS campaign_hourly_limit
        FROM emails e
        LEFT JOIN senders s
          ON e.sender_id = s.id
        LEFT JOIN email_campaigns c
          ON e.campaign_id = c.id
        WHERE e.id = $1
        `,
        [emailId]
      );


    if (result.rows.length === 0) {
      throw new Error(
        `Email ${emailId} not found`
      );
    }


    const email =
      result.rows[0];


    // -------------------------------------------------
    // IDEMPOTENCY CHECK
    // -------------------------------------------------

    if (email.status === "sent") {

      console.log(
        `⚠️ Email ${emailId} already sent. Skipping.`
      );

      return {
        skipped: true,
        reason: "already_sent",
      };
    }


    // -------------------------------------------------
    // ONLY SCHEDULED EMAILS CAN BE PROCESSED
    // -------------------------------------------------

    if (
      email.status !== "scheduled"
    ) {

      console.log(
        `⚠️ Email ${emailId} status is ${email.status}. Skipping.`
      );

      return {
        skipped: true,
        reason:
          "invalid_status",
      };
    }


    // -------------------------------------------------
    // HOURLY LIMIT
    // -------------------------------------------------

    const hourlyLimit =
      Number(
        email.campaign_hourly_limit
      ) || 100;


    // -------------------------------------------------
    // RESERVE REDIS RATE LIMIT SLOT
    // -------------------------------------------------

    const rateLimit =
      await reserveRateLimitSlot(
        email.sender_id,
        hourlyLimit
      );


    // -------------------------------------------------
    // HOURLY LIMIT REACHED
    // -------------------------------------------------

    if (!rateLimit.allowed) {

      console.log(
        `🚦 Hourly limit reached for sender ${email.sender_id}`
      );

      console.log(
        `📊 Limit: ${hourlyLimit} emails/hour`
      );

      console.log(
        `⏰ Rescheduling email ${emailId}`
      );


      await rescheduleEmail(
        emailId,
        rateLimit.nextHour
      );


      return {
        rescheduled: true,

        reason:
          "hourly_rate_limit_reached",

        nextAttempt:
          rateLimit.nextHour.toISOString(),
      };
    }


    // -------------------------------------------------
    // ATOMIC DB CLAIM
    // -------------------------------------------------

    const updateResult =
      await pool.query(
        `
        UPDATE emails
        SET
          status = 'processing',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status = 'scheduled'
        RETURNING *
        `,
        [emailId]
      );


    // -------------------------------------------------
    // CLAIM FAILED
    // -------------------------------------------------

    if (
      updateResult.rows.length === 0
    ) {

      console.log(
        `⚠️ Email ${emailId} was already claimed by another worker.`
      );


      // We reserved a Redis slot but didn't
      // actually send the email.
      await releaseRateLimitSlot(
        rateLimit.key
      );


      return {
        skipped: true,
        reason:
          "already_processing",
      };
    }


    const processingEmail =
      updateResult.rows[0];


    // -------------------------------------------------
    // UPDATE ELASTICSEARCH
    // -------------------------------------------------

    await indexEmail(
      processingEmail
    );

    console.log(
      `🔎 Elasticsearch updated: processing`
    );


    // -------------------------------------------------
    // SEND EMAIL
    // -------------------------------------------------

    try {

      const sendResult =
        await sendEmail({
          from:
            email.sender_email ||
            "noreply@reachinbox.local",

          to:
            email.recipient,

          subject:
            email.subject,

          text:
            email.body,
        });


      // -------------------------------------------------
      // MARK AS SENT
      // -------------------------------------------------

      const sentResult =
        await pool.query(
          `
          UPDATE emails
          SET
            status = 'sent',
            sent_at = CURRENT_TIMESTAMP,
            message_id = $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
          `,
          [
            sendResult.messageId,
            emailId,
          ]
        );


      if (
        sentResult.rows.length === 0
      ) {
        throw new Error(
          `Failed to update email ${emailId} as sent`
        );
      }


      const sentEmail =
        sentResult.rows[0];


      // -------------------------------------------------
      // UPDATE ELASTICSEARCH
      // -------------------------------------------------

      await indexEmail(
        sentEmail
      );

      console.log(
        `🔎 Elasticsearch updated: sent`
      );


      // -------------------------------------------------
      // SUCCESS LOG
      // -------------------------------------------------

      console.log(
        `✅ Email ${emailId} sent successfully`
      );


      if (
        sendResult.previewUrl
      ) {

        console.log(
          `🔗 Preview: ${sendResult.previewUrl}`
        );
      }


      return {
        success: true,

        emailId,

        messageId:
          sendResult.messageId,

        previewUrl:
          sendResult.previewUrl,
      };

    } catch (error) {

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error";


      // -------------------------------------------------
      // MARK AS FAILED
      // -------------------------------------------------

      const failedResult =
        await pool.query(
          `
          UPDATE emails
          SET
            status = 'failed',
            error_message = $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
          `,
          [
            errorMessage,
            emailId,
          ]
        );


      if (
        failedResult.rows.length > 0
      ) {

        await indexEmail(
          failedResult.rows[0]
        );
      }


      console.error(
        `❌ Email ${emailId} failed:`,
        errorMessage
      );


      throw error;
    }
  },

  {
    connection:
      redisConnection,

    concurrency:
      WORKER_CONCURRENCY,

    // -------------------------------------------------
    // GLOBAL MINIMUM DELAY
    //
    // BullMQ shares this limiter through Redis,
    // so multiple workers cannot bypass it.
    // -------------------------------------------------

    limiter: {
      max: 1,
      duration:
        MIN_EMAIL_DELAY_SECONDS * 1000,
    },
  }
);


// =====================================================
// WORKER EVENTS
// =====================================================

worker.on(
  "completed",
  (job) => {

    console.log(
      `✅ Job ${job.id} completed`
    );
  }
);


worker.on(
  "failed",
  (job, error) => {

    console.error(
      `❌ Job ${job?.id} failed:`,
      error.message
    );
  }
);


worker.on(
  "error",
  (error) => {

    console.error(
      "❌ Worker error:",
      error
    );
  }
);


// =====================================================
// STARTUP LOGS
// =====================================================

console.log(
  "🚀 Email worker started"
);

console.log(
  `⚙️ Worker concurrency: ${WORKER_CONCURRENCY}`
);

console.log(
  `⏱️ Minimum email delay: ${MIN_EMAIL_DELAY_SECONDS}s`
);

console.log(
  "🚦 Redis hourly rate limiting: ENABLED"
);

console.log(
  "🔒 Atomic email claiming: ENABLED"
);