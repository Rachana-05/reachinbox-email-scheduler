# ReachInbox Email Scheduler

A production-oriented full-stack email scheduling application built as part of the ReachInbox / Outbox Labs assignment.

The application provides a React dashboard for creating email campaigns, uploading recipients through CSV, scheduling email jobs, monitoring queue activity, cancelling scheduled emails, and searching email records. The backend uses Node.js/Express with PostgreSQL, Redis, BullMQ, Elasticsearch, and Nodemailer/Ethereal for development email delivery.

---

## Live Application

### Frontend
https://ravishing-stillness-production-ec11.up.railway.app

### Backend API
https://reachinbox-email-scheduler-production-93dc.up.railway.app

### Health Check
https://reachinbox-email-scheduler-production-93dc.up.railway.app/api/health

### GitHub Repository
https://github.com/Rachana-05/reachinbox-email-scheduler

---

# Overview

ReachInbox Email Scheduler is a full-stack email scheduling system designed around asynchronous background processing.

Instead of sending emails directly from the HTTP request, the backend stores campaign and recipient information in PostgreSQL and creates delayed BullMQ jobs backed by Redis. A worker processes the jobs independently and performs email delivery through Nodemailer.

The system also uses Elasticsearch to index email records for search and Bull Board to provide visibility into BullMQ queues.

```text
React Frontend
      |
      | REST API
      v
Node.js / Express Backend
      |
      +--------------------+
      |                    |
      v                    v
PostgreSQL              Redis
                          |
                          v
                       BullMQ
                          |
                          v
                     Email Worker
                          |
                          v
                    Nodemailer
                          |
                          v
                     Ethereal

Backend / Worker
      |
      v
Elasticsearch
      |
      v
Email Search
```

---

# Features

## 1. Email Campaign Scheduling

- Create email campaigns from the dashboard.
- Configure email subject and body.
- Schedule campaigns for a specified start time.
- Configure delay between email jobs.
- Configure hourly sending limits.
- Schedule emails for multiple recipients.
- Store campaign and email metadata in PostgreSQL.

## 2. Multiple Recipient Scheduling

Each recipient is represented as an individual email record and queue job.

```text
Campaign
   |
   +---- recipient1@example.com
   |
   +---- recipient2@example.com
   |
   +---- recipient3@example.com
```

## 3. CSV Recipient Upload

- Upload recipient lists using CSV files.
- Parse CSV files on the frontend.
- Extract recipient email addresses.
- Schedule campaigns for multiple recipients.
- Sample file: `test-recipients.csv`.

Workflow:

```text
CSV File
   |
   v
Frontend CSV Parser
   |
   v
Recipient List
   |
   v
Campaign Creation
   |
   v
Email Records
   |
   v
BullMQ Jobs
```

## 4. Background Job Processing

BullMQ and Redis are used for asynchronous email scheduling.

The system:

1. Creates the campaign in PostgreSQL.
2. Creates individual email records.
3. Creates delayed BullMQ jobs.
4. Stores the BullMQ job ID.
5. Processes jobs through the worker.
6. Updates email status after processing.

## 5. Configurable Worker Concurrency

Worker concurrency can be configured through:

```env
WORKER_CONCURRENCY=5
```

## 6. Email Rate Limiting

The scheduler supports:

- Minimum delay between email sends.
- Configurable hourly email limits.
- Redis-based rate-limit counters.
- Automatic rescheduling when an hourly limit is reached.

Example:

```env
MIN_EMAIL_DELAY_SECONDS=2
```

Redis rate-limit key:

```text
email-rate:<senderId>:<UTC-hour>
```

## 7. Email Cancellation

Scheduled emails can be cancelled before processing.

The application updates the email state and queue state so that cancelled scheduled emails are not sent by the worker.

## 8. Email Search

Email records are indexed into Elasticsearch.

Indexed information can include:

- Email ID
- Campaign ID
- Recipient
- Subject
- Status
- Scheduled time
- Sent time
- Message ID

## 9. Email Delivery

Nodemailer is used as the email transport layer.

Ethereal Email is used for development and testing.

The application records:

- Recipient
- Subject
- Body
- Scheduled time
- Sent time
- Status
- Message ID
- Error message

## 10. Queue Monitoring

Bull Board is integrated for monitoring BullMQ queues and jobs.

Local URL:

```text
http://localhost:5001/admin/queues
```

## 11. Persistent Storage

PostgreSQL stores:

- Users
- Senders
- Email campaigns
- Email records
- Slack connection records

---

# Architecture

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
                         +----+------------+-----+
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

                         +----------------------+
                         |    Elasticsearch     |
                         | Email Search / Index |
                         +----------^-----------+
                                    |
                                    |
                              Backend / Worker

                         +----------------------+
                         |      Bull Board       |
                         |   Queue Monitoring    |
                         +----------------------+
```

---

# Architecture Flow

## Campaign Creation

```text
User
  |
  v
React Dashboard
  |
  v
REST API
  |
  v
Express Backend
  |
  +------> PostgreSQL
  |          |
  |          +--> Campaign
  |          +--> Email Records
  |
  +------> BullMQ
             |
             +--> Delayed Jobs
```

## Email Processing

```text
BullMQ
   |
   v
Worker
   |
   v
Claim scheduled email
   |
   v
Check rate limits
   |
   +---- Limit exceeded ----> Reschedule
   |
   v
Nodemailer
   |
   v
Ethereal
   |
   v
Update PostgreSQL
   |
   v
Index record in Elasticsearch
```

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite
- CSS
- Lucide React
- PapaParse

## Backend

- Node.js
- Express
- TypeScript
- PostgreSQL
- Redis
- BullMQ
- Nodemailer
- Elasticsearch
- Bull Board
- JSON Web Token support

## Infrastructure

- Docker
- Docker Compose
- Railway
- PostgreSQL
- Redis
- Elasticsearch

## Email

- Nodemailer
- Ethereal Email

---

# Project Structure

```text
reachinbox-email-scheduler/
|
|-- backend/
|   |-- src/
|   |   |-- app.ts
|   |   |-- server.ts
|   |   |-- worker.ts
|   |   |-- db.ts
|   |   |-- queue.ts
|   |   |-- emailService.ts
|   |   |-- mailer.ts
|   |   |-- rateLimiter.ts
|   |   |-- elasticsearch.ts
|   |   `-- ...
|   |
|   |-- package.json
|   |-- tsconfig.json
|   `-- .env
|
|-- frontend/
|   |-- src/
|   |   |-- App.tsx
|   |   |-- main.tsx
|   |   `-- ...
|   |
|   |-- package.json
|   |-- vite.config.ts
|   `-- ...
|
|-- docker-compose.yml
|-- test-recipients.csv
|-- README.md
`-- .gitignore
```

---

# Database Design

PostgreSQL is the primary persistent data store.

## Users

Fields:

```text
id
google_id
name
email
avatar_url
created_at
```

## Senders

Fields:

```text
id
user_id
email
name
ethereal_user
ethereal_password
created_at
```

## Email Campaigns

Fields:

```text
id
user_id
subject
body
start_time
delay_seconds
hourly_limit
created_at
```

## Emails

Fields:

```text
id
campaign_id
sender_id
recipient
subject
body
scheduled_at
sent_at
status
bull_job_id
message_id
error_message
created_at
updated_at
```

Indexes include:

```text
idx_emails_status
idx_emails_scheduled_at
idx_emails_recipient
```

## Slack Connections

The schema contains a table for Slack connection information.

Fields:

```text
id
user_id
access_token
team_id
created_at
updated_at
```

Slack OAuth integration is not included in the current implementation.

---

# Queue and Worker Design

BullMQ provides asynchronous job processing.

Each recipient becomes an individual queue job.

```text
Campaign
   |
   +-- Recipient A -> Job A
   |
   +-- Recipient B -> Job B
   |
   +-- Recipient C -> Job C
   |
   +-- Recipient D -> Job D
```

The queue job contains the email record ID so the worker can retrieve the latest database state before processing.

---

# Email Processing Lifecycle

```text
scheduled
    |
    v
processing
    |
    +---------> sent
    |
    +---------> failed
    |
    +---------> cancelled
```

The worker atomically claims scheduled records before sending to reduce the possibility of duplicate processing.

---

# Rate Limiting

Two levels of protection are implemented.

## Minimum Delay

```env
MIN_EMAIL_DELAY_SECONDS=2
```

## Hourly Limit

Each campaign can specify an hourly sending limit.

Redis maintains sender/hour counters:

```text
email-rate:<senderId>:<UTC-hour>
```

When the configured hourly limit is reached, the worker can reschedule the job for the next available hour.

---

# Elasticsearch

Elasticsearch is used for email indexing and search.

Indexed information can include:

```text
email ID
campaign ID
recipient
subject
status
scheduled time
sent time
message ID
```

The backend initializes the Elasticsearch index when the application starts.

PostgreSQL remains the primary persistent source of application state.

---

# Docker Infrastructure

Docker Compose provides the local infrastructure.

Services:

- PostgreSQL
- Redis
- Elasticsearch

Start:

```bash
docker compose up -d
```

Check:

```bash
docker ps
```

Stop:

```bash
docker compose down
```

---

# Local Development Setup

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop
- Git

## Clone Repository

```bash
git clone https://github.com/Rachana-05/reachinbox-email-scheduler.git
cd reachinbox-email-scheduler
```

## Start Docker Services

```bash
docker compose up -d
```

Verify:

```bash
docker ps
```

Expected services:

```text
reachinbox-postgres
reachinbox-redis
reachinbox-elasticsearch
```

## Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5001

DATABASE_URL=postgresql://reachinbox:reachinbox_password@localhost:5432/reachinbox

REDIS_HOST=localhost
REDIS_PORT=6379

ELASTICSEARCH_URL=http://localhost:9200

WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_SECONDS=2
```

Start:

```bash
npm run dev
```

Backend:

```text
http://localhost:5001
```

## Worker

Open another terminal:

```bash
cd backend
npm run build
npm run worker
```

## Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# Environment Variables

## Backend

```env
PORT=5001
DATABASE_URL=<PostgreSQL connection string>

REDIS_HOST=<Redis host>
REDIS_PORT=<Redis port>
REDIS_PASSWORD=<Redis password>

ELASTICSEARCH_URL=<Elasticsearch URL>

WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_SECONDS=2

FRONTEND_URL=<Frontend URL>
```

## Frontend

```env
VITE_API_URL=<Backend API URL>
```

Deployed frontend configuration:

```env
VITE_API_URL=https://reachinbox-email-scheduler-production-93dc.up.railway.app
```

Never commit actual credentials or secrets.

---

# Running the Application

Start infrastructure:

```bash
docker compose up -d
```

Start backend:

```bash
cd backend
npm run dev
```

Start worker:

```bash
cd backend
npm run build
npm run worker
```

Start frontend:

```bash
cd frontend
npm run dev
```

---

# API

## Health Check

```http
GET /api/health
```

Example:

```bash
curl http://localhost:5001/api/health
```

Response:

```json
{
  "status": "ok",
  "message": "ReachInbox Email Scheduler API is running"
}
```

Campaign creation and scheduling APIs are consumed by the React frontend.

---

# Bull Board

Bull Board provides visibility into BullMQ jobs.

Local URL:

```text
http://localhost:5001/admin/queues
```

Useful queue states:

- Waiting
- Delayed
- Active
- Completed
- Failed

---

# Testing and Verification

The system was tested locally with:

## Health Check

```bash
curl http://localhost:5001/api/health
```

## Docker

```bash
docker ps
```

## Elasticsearch

```bash
curl http://localhost:9200
```

## Queue Monitoring

```text
http://localhost:5001/admin/queues
```

## Campaign Scheduling

Test scenarios included:

- Single recipient
- Multiple recipients
- Scheduled start time
- Configurable delay
- Hourly rate limiting
- Email cancellation
- CSV recipient upload

---

# Deployment

The application is deployed using Railway.

Deployment architecture:

```text
                    Railway
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
   Frontend         Backend       PostgreSQL
        |              |
        |              +----------> Redis
        |              |
        |              +----------> Elasticsearch
        |
        +------ REST API ------> Backend
```

The backend uses the Railway-provided `PORT` environment variable and listens on `0.0.0.0`.

The frontend uses `VITE_API_URL` to communicate with the deployed backend.

---

# Reliability and Concurrency

Before sending, the worker claims the email from:

```text
scheduled
```

to:

```text
processing
```

The state transition is performed atomically to reduce duplicate processing when multiple workers are running.

After successful processing:

```text
processing -> sent
```

On failure:

```text
processing -> failed
```

On cancellation before processing:

```text
scheduled -> cancelled
```

---

# Production Considerations

The implementation includes:

- PostgreSQL for persistent state.
- Redis for queue and rate-limit state.
- BullMQ for delayed/background processing.
- Configurable worker concurrency.
- Redis-based rate limiting.
- Minimum delay between sends.
- Atomic email state claiming.
- Elasticsearch indexing.
- Environment-based configuration.
- Dockerized local infrastructure.
- Railway deployment.
- Backend health endpoint.
- Bull Board queue monitoring.
- CSV-based bulk recipient scheduling.

---

# Security

Sensitive information should never be committed to Git.

Keep the following private:

```text
.env
Database passwords
Redis passwords
Email provider credentials
OAuth secrets
API keys
Access tokens
```

Environment variables should be configured separately for local development and deployment.

---

# Current Limitations

The current implementation focuses on the core email scheduling, queue processing, rate limiting, cancellation, search, and deployment workflow.

The following assignment-level features are not fully implemented in the current version:

- Google OAuth login.
- Slack OAuth notification integration.
- Dedicated Scheduled and Sent dashboard tabs.
- Full production email provider integration.

Ethereal Email is used for development/testing instead of a production transactional email provider.

The database schema contains Slack connection storage, but the Slack OAuth flow is not implemented in the current version.

---

# Design Decisions

## PostgreSQL

PostgreSQL is used as the persistent source of truth for users, campaigns, email records, and delivery state.

## Redis and BullMQ

Redis provides queue storage and BullMQ provides delayed jobs and background processing.

## Elasticsearch

Elasticsearch provides a search/indexing layer for email records.

## Worker-Based Sending

Email delivery is performed by a background worker rather than blocking the API request.

## Configurable Concurrency

Worker concurrency is controlled through environment configuration.

## Redis Rate Limiting

Rate-limit counters are maintained in Redis so that sending limits can be shared across worker processes.

---

# Error Handling

Email processing errors are stored in the email record.

The `emails` table contains:

```text
error_message
```

This allows failed processing information to remain available after a worker error.

---

# Repository Files

Important files include:

```text
backend/src/app.ts
backend/src/server.ts
backend/src/worker.ts
backend/src/db.ts
backend/src/queue.ts
backend/src/emailService.ts
backend/src/mailer.ts
backend/src/rateLimiter.ts
backend/src/elasticsearch.ts

frontend/src/App.tsx
frontend/src/main.tsx

docker-compose.yml
test-recipients.csv
README.md
.gitignore
```

---

# Git Workflow

Check status:

```bash
git status
```

Stage:

```bash
git add .
```

Commit:

```bash
git commit -m "Update email scheduler"
```

Push:

```bash
git push origin main
```

---

# Useful Commands

## Start Infrastructure

```bash
docker compose up -d
```

## Stop Infrastructure

```bash
docker compose down
```

## Check Containers

```bash
docker ps
```

## Backend Development

```bash
cd backend
npm run dev
```

## Build Backend

```bash
cd backend
npm run build
```

## Start Worker

```bash
cd backend
npm run worker
```

## Frontend Development

```bash
cd frontend
npm run dev
```

## Backend Health

```bash
curl http://localhost:5001/api/health
```

## Elasticsearch

```bash
curl http://localhost:9200
```

## Queue Dashboard

```text
http://localhost:5001/admin/queues
```

---

# Live URLs

## Frontend

https://ravishing-stillness-production-ec11.up.railway.app

## Backend

https://reachinbox-email-scheduler-production-93dc.up.railway.app

## Health Check

https://reachinbox-email-scheduler-production-93dc.up.railway.app/api/health

## GitHub

https://github.com/Rachana-05/reachinbox-email-scheduler

---

# Assignment Submission

## Hosted Project

https://ravishing-stillness-production-ec11.up.railway.app

## Source Code

https://github.com/Rachana-05/reachinbox-email-scheduler

The hosted frontend provides access to the deployed application, while the GitHub repository contains the source code, Docker configuration, sample recipient CSV, and project documentation.

---

# Author

**Rachana R**

MTech — Computer Science / Technology

Built as part of the ReachInbox / Outbox Labs Full-Stack Email Scheduler Assignment.
