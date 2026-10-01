# ReachInbox Email Scheduler

A production-oriented full-stack email scheduling application built as part of the ReachInbox assignment.

## Live Application

https://ravishing-stillness-production-ec11.up.railway.app

## GitHub Repository

https://github.com/Rachana-05/reachinbox-email-scheduler

---

# Features

### Email Campaign Scheduling
- Create email campaigns from the dashboard.
- Configure email subject and body.
- Schedule campaigns for a specified start time.
- Configure delay between email jobs.
- Configure hourly sending limits.

### CSV Recipient Upload
- Upload recipient lists using CSV files.
- Parse recipient data on the frontend.
- Schedule emails for multiple recipients.

### Background Job Processing
- BullMQ is used for reliable background email scheduling.
- Redis acts as the persistent queue backend.
- Delayed jobs are created based on the campaign schedule.
- Worker concurrency can be configured through environment variables.

### Email Rate Limiting
- Supports configurable minimum delay between email sends.
- Supports hourly sending limits.
- Redis-based counters are used for rate-limit tracking.
- Emails exceeding the hourly limit are rescheduled.

### Email Cancellation
- Scheduled emails can be cancelled before processing.
- Job state and database state are updated accordingly.

### Email Search
- Email records are indexed in Elasticsearch.
- Search functionality supports finding emails by recipient and other indexed fields.

### Email Delivery
- Nodemailer is used for email delivery.
- Ethereal is used as the test email provider during development.

### Queue Monitoring
- Bull Board provides a dashboard for monitoring BullMQ queues and jobs.

### Persistent Storage
- PostgreSQL stores users, senders, campaigns and email records.

---

# Architecture

The application follows a frontend/backend/worker architecture.

```text
                    +----------------------+
                    |    React Frontend    |
                    |  TypeScript + Vite   |
                    +----------+-----------+
                               |
                               | REST API
                               v
                    +----------------------+
                    | Node.js / Express API|
                    |     TypeScript       |
                    +----+------------+----+
                         |            |
                         |            |
                         v            v
                +-------------+   +-------------+
                | PostgreSQL  |   | Redis       |
                | Persistence |   | BullMQ Queue|
                +-------------+   +------+------+
                                        |
                                        v
                               +----------------+
                               | Email Worker   |
                               | BullMQ Worker  |
                               +-------+--------+
                                       |
                                       v
                              +------------------+
                              | Nodemailer /     |
                              | Ethereal Email   |
                              +------------------+

                    Elasticsearch
                         ^
                         |
                    Email indexing
                         |
                    Backend / Worker

                    Bull Board
                         |
                         v
                  Queue Monitoring
