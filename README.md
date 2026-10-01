# ReachInbox Email Scheduler

A production-oriented full-stack email scheduling application built as part of the ReachInbox assignment.

## Live Application

https://ravishing-stillness-production-ec11.up.railway.app

## Features

- Create and schedule email campaigns
- CSV recipient upload
- PostgreSQL persistence
- BullMQ background job processing
- Redis-backed job queue
- Configurable email delays
- Configurable worker concurrency
- Hourly email rate limiting
- Email cancellation
- Elasticsearch-based email search
- Nodemailer and Ethereal email delivery
- Bull Board queue monitoring
- Docker Compose development environment
- Railway deployment

## Tech Stack

- React
- TypeScript
- Vite
- Node.js
- Express.js
- PostgreSQL
- Redis
- BullMQ
- Elasticsearch
- Nodemailer
- Docker
- Railway

## Project Structure

```text
reachinbox-email-scheduler/
├── backend/
├── frontend/
├── docker-compose.yml
├── test-recipients.csv
├── README.md
└── .gitignore
