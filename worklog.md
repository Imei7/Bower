# OTP Sniper Bot - Worklog

---
Task ID: 1-14
Agent: Main Agent
Task: Build complete OTP Sniper system with Telegram Bot, Queue Workers, and Next.js Dashboard

## Work Log:

### 1. Dependencies Installation
- Installed: telegraf, bullmq, ioredis, axios

### 2. Database Schema (Prisma)
- Created User model (telegramId, apiKey, balance, isActive, isLocked)
- Created Transaction model (activationId, phoneNumber, countryCode, serviceCode, otp, status)
- Created Settings model (key-value store)
- Created JobState model (for resume capability)
- Created Country model (available countries)
- Created Service model (available services)

### 3. Backend Structure
Created folder structure:
```
/backend
  /bot - Telegram bot handlers and keyboards
  /services - SMS API, Lock, Rate Limiter
  /core - Config, Constants, Redis
  /queue - BullMQ queues and workers
  /db - Prisma client
  /utils - Logger, Helpers
```

### 4. Core Components

#### SMS API Service (`backend/services/sms-api.ts`)
- API parser for string-based responses
- Methods: getBalance, validateApiKey, buyNumber, getSmsCode, cancelActivation
- Retry with exponential backoff
- Response normalization (ACCESS_NUMBER, STATUS_OK, STATUS_WAIT_CODE, etc.)

#### Redis Client (`backend/core/redis.ts`)
- Connection with retry strategy: `Math.min(times * 100, 3000)`
- Health check function
- Graceful shutdown

#### Lock Service (`backend/services/lock.ts`)
- Redis-based distributed lock
- TTL: 2 minutes
- Methods: acquire, release, isLocked, withLock
- Anti double-request mechanism

#### Rate Limiter (`backend/services/rate-limiter.ts`)
- Global rate limit: 100 requests/minute
- Per-user rate limit: 10 requests/minute
- Sliding window implementation

### 5. Queue System (BullMQ)

#### Buy Number Queue
- Job data: userId, apiKey, countryCode, serviceCode, telegramId, chatId
- Concurrency: 5
- Retry: 3 attempts with exponential backoff

#### Sniper OTP Queue
- Job data: userId, apiKey, activationId, phoneNumber, etc.
- Polling interval: 1.5-3 seconds
- Timeout: 2 minutes
- Auto-retry on NO_NUMBERS

### 6. Telegram Bot (`backend/bot/`)

#### Keyboards (`keyboards.ts`)
- Main reply keyboard: Beli OTP, Status, Pengaturan
- Inline keyboards: Country selection, Service selection, Confirmation
- Pagination support

#### Handlers (`handlers.ts`)
- Start command: User registration, API key validation
- Buy OTP flow: Checklist system → Country → Service → Confirm
- Status: Show user balance and recent transactions
- Settings: Change API key, Check balance

### 7. Workers (`backend/queue/workers/`)

#### Buy Number Worker
- Process buy number jobs
- Create transaction record
- Forward to sniper OTP queue
- Update Telegram messages with loading bar

#### Sniper OTP Worker
- Poll SMS API for OTP (1.5-3s interval)
- Update progress messages (with 3s cooldown)
- Handle timeout (2 min)
- Handle cancellation
- Auto-release lock on completion

### 8. Mini Service (`mini-services/bot-service/`)
- Standalone bot service with its own package.json
- Runs on separate port
- Includes workers initialization
- Health check endpoint
- Graceful shutdown handlers

### 9. Next.js Dashboard (`src/app/page.tsx`)
- Real-time system status
- Health check display (Database, Redis)
- Queue statistics
- Transaction counts
- Success rate progress bar
- Auto-refresh every 30 seconds

### 10. API Endpoints

#### Health Check (`/api/health`)
- Check database connection
- Check Redis connection
- Return status: ok/degraded/error
- Include latency metrics

#### Status (`/api/status`)
- Queue statistics
- User counts
- Transaction counts
- System uptime

### 11. Railway Deployment Fix (`server.cjs`)
- Proper binding to 0.0.0.0
- Uses PORT from environment (default 8080)
- Graceful shutdown handlers
- No SIGTERM issues

### 12. Configuration Files
- Updated package.json with new scripts
- Created .env.example
- Updated eslint config to ignore server.cjs

## Stage Summary:

### Key Results:
1. Complete backend architecture with separation of concerns
2. Robust SMS API parser with all status handling
3. Redis-based lock and rate limiting
4. BullMQ queues with workers for async processing
5. Telegram bot with full flow (no commands needed)
6. Next.js dashboard for monitoring
7. Production-ready server.js for Railway

### Important Decisions:
- Used SQLite for development (can switch to PostgreSQL for production)
- Bot runs as separate mini-service (not embedded in Next.js)
- Polling mode for OTP (no webhook required)
- 2-minute timeout for OTP waiting
- 3-second edit cooldown to avoid Telegram spam

### Produced Artifacts:
- `/backend/` - Complete backend code
- `/mini-services/bot-service/` - Bot service
- `/src/app/api/health/` - Health check endpoint
- `/src/app/api/status/` - Status endpoint
- `/src/app/page.tsx` - Dashboard UI
- `/server.cjs` - Production server
- `/prisma/schema.prisma` - Database schema

## Environment Variables Required:
```
TELEGRAM_BOT_TOKEN=your_bot_token
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=file:./db/custom.db
PORT=8080
```

## Commands:
```bash
# Development
bun run dev          # Start Next.js
bun run bot          # Start bot service

# Production
bun run build        # Build Next.js
bun run start        # Start Next.js server
bun run bot:prod     # Start bot service

# Database
bun run db:push      # Push schema to database
bun run db:generate  # Generate Prisma client
```
