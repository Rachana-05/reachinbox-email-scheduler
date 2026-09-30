import { pool } from "./db";
import { emailQueue } from "./queue";
import { indexEmail } from "./elasticsearch";

interface ScheduleEmailInput {
  userId: string;
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
}

export const scheduleEmails = async (
  input: ScheduleEmailInput
) => {
  const client = await pool.connect();

  try {
    // --------------------------------------------------
    // 1. Start PostgreSQL transaction
    // --------------------------------------------------

    await client.query("BEGIN");

    // --------------------------------------------------
    // 2. Create campaign
    // --------------------------------------------------

    const campaignResult = await client.query(
      `
      INSERT INTO email_campaigns
      (
        user_id,
        subject,
        body,
        start_time,
        delay_seconds,
        hourly_limit
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        input.userId,
        input.subject,
        input.body,
        input.startTime,
        input.delaySeconds,
        input.hourlyLimit,
      ]
    );

    const campaign = campaignResult.rows[0];

    console.log(
      `📋 Campaign created: ${campaign.id}`
    );

    // --------------------------------------------------
    // 3. Create individual email records
    // --------------------------------------------------

    const emailRecords = [];

    for (let i = 0; i < input.recipients.length; i++) {
      const recipient = input.recipients[i];

      /*
       * First email:
       * startTime
       *
       * Second email:
       * startTime + delaySeconds
       *
       * Third email:
       * startTime + 2 × delaySeconds
       */

      const scheduledTime = new Date(
        new Date(input.startTime).getTime() +
          i * input.delaySeconds * 1000
      );

      const emailResult = await client.query(
        `
        INSERT INTO emails
        (
          campaign_id,
          sender_id,
          recipient,
          subject,
          body,
          scheduled_at,
          status
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'scheduled'
        )
        RETURNING *
        `,
        [
          campaign.id,
          input.senderId,
          recipient,
          input.subject,
          input.body,
          scheduledTime,
        ]
      );

      emailRecords.push(emailResult.rows[0]);

      console.log(
        `📧 Email created: ${emailResult.rows[0].id}`
      );
    }

    // --------------------------------------------------
    // 4. Commit PostgreSQL transaction
    // --------------------------------------------------

    await client.query("COMMIT");

    console.log(
      `✅ PostgreSQL transaction committed`
    );

    // --------------------------------------------------
    // 5. Add emails to BullMQ
    // --------------------------------------------------

    const finalEmailRecords = [];

    for (const email of emailRecords) {
      /*
       * Calculate how long BullMQ should wait
       * before processing this email.
       */

      const delay = Math.max(
        0,
        new Date(email.scheduled_at).getTime() -
          Date.now()
      );

      // ------------------------------------------------
      // Add job to BullMQ
      // ------------------------------------------------

      const job = await emailQueue.add(
        "send-email",
        {
          emailId: email.id,
        },
        {
          delay,
          jobId: `email-${email.id}`,

          /*
           * Keep completed jobs out of Redis.
           * Failed jobs remain available for inspection.
           */

          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      console.log(
        `📨 BullMQ job created: ${job.id}`
      );

      // ------------------------------------------------
      // Save BullMQ job ID in PostgreSQL
      // ------------------------------------------------

      const updatedEmailResult = await pool.query(
        `
        UPDATE emails
        SET
          bull_job_id = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
        `,
        [job.id, email.id]
      );

      const updatedEmail =
        updatedEmailResult.rows[0];

      // ------------------------------------------------
      // Index email in Elasticsearch
      // ------------------------------------------------

      await indexEmail(updatedEmail);

      console.log(
        `🔎 Email indexed in Elasticsearch: ${email.id}`
      );

      finalEmailRecords.push(updatedEmail);
    }

    // --------------------------------------------------
    // 6. Return result
    // --------------------------------------------------

    return {
      campaign,
      emails: finalEmailRecords,
    };
  } catch (error) {
    // --------------------------------------------------
    // Rollback transaction if PostgreSQL operation fails
    // --------------------------------------------------

    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "❌ PostgreSQL rollback failed:",
        rollbackError
      );
    }

    console.error(
      "❌ Email scheduling failed:",
      error
    );

    throw error;
  } finally {
    // --------------------------------------------------
    // Release PostgreSQL connection
    // --------------------------------------------------

    client.release();
  }
};