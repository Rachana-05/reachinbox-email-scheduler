# ReachInbox Email Scheduler

A production-oriented full-stack email scheduling system built with React, Node.js, PostgreSQL, Redis, BullMQ, Elasticsearch, and Docker.

The application allows users to create email campaigns, upload recipients through CSV, schedule emails for future delivery, enforce sending delays and hourly limits, monitor queue activity, search email records, and cancel scheduled emails.

---

## Features

### Email Scheduling
- Schedule emails for future delivery.
- Schedule emails to multiple recipients.
- Persistent email records stored in PostgreSQL.
- Individual BullMQ jobs for each email.
- Worker-based asynchronous email processing.

### CSV Recipient Upload
- Upload a CSV containing recipient email addresses.
- Automatically detect an `email` column.
- Validate email addresses.
- Remove duplicate recipients.
- Display recipient count before scheduling.

### Queue Processing
- BullMQ backed by Redis.
- Persistent delayed jobs.
- Worker concurrency configuration.
- Atomic email claiming to prevent duplicate processing.
- Queue monitoring through Bull Board.

### Rate Limiting
- Minimum delay between email jobs.
- Sender-level hourly rate limiting.
- Redis-backed atomic rate-limit counters.
- Emails exceeding the hourly limit are rescheduled for the next available hour.

### Email Status Tracking

Emails can have the following states:

- `scheduled`
- `processing`
- `sent`
- `failed`
- `cancelled`

### Email Cancellation
- Scheduled emails can be cancelled.
- BullMQ delayed jobs are removed when possible.
- Cancelled emails are persisted in PostgreSQL.
- Worker safely ignores cancelled emails.

### Elasticsearch Search
- Email records are indexed in Elasticsearch.
- Search by recipient, subject, and email body.
- Email status changes are synchronized with Elasticsearch.

### Dashboard
- Total email count.
- Scheduled count.
- Processing count.
- Sent count.
- Failed count.
- Cancelled count.
- Search functionality.
- Automatic dashboard refresh.

### Bull Board
Queue monitoring is available at:

http://localhost:5001/admin/queues

---

# Architecture

```text
                         React Frontend
                              |
                              | HTTP / REST
                              v
                       Express Backend
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
        PostgreSQL         BullMQ           Elasticsearch
        Persistence         Queue             Search
                              |
                              v
                            Redis
                              |
                              v
                       Email Worker
                              |
                              v
                         SMTP Server
                          (Ethereal)