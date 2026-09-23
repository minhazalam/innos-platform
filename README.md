# Innos

Innos is a hotel operating system for independent hotels, boutique properties, and homestays. It brings reservations, rooms, guest service, staff operations, payments, reconciliation, and owner reporting into one responsive application.

The current MVP uses React, FastAPI, and MongoDB. It is intended for local development and product review. It has not been hardened or operated as a production service.

## Features

- Owner registration, secure sign-in, property setup, and property-scoped records.
- Role-based access for Owner, Manager, Accounts, Front Desk, Housekeeping, and Maintenance.
- Rooms and room types, availability, reservation calendar, guest records, check-in/out, and cancellation.
- Payment ledger, invoices, UPI QR generation, owner-recorded refunds, and manual settlement reconciliation.
- Housekeeping tasks, maintenance issues, guest requests, assignments, and in-app notifications.
- Direct booking page, role-scoped analytics, audit log, global search, and a read-only AI Manager with a local fallback.
- Responsive mobile views for housekeeping and maintenance staff.

The existing visual design has been retained. Integrations that need external provider accounts are described under [Current limits](#current-limits).

## Roles

| Role | Access |
| --- | --- |
| Owner | All property operations, financials, settings, staff, analytics, audit, booking website, and AI tools. Can record refunds. |
| Manager | Daily operations, staff administration (without owner or manager access changes), financial operations, analytics, booking website, and audit. Cannot change payment settings or issue refunds. |
| Accounts | Payment ledger, finance overview, analytics, and manual reconciliation. Guest identities and reservation or staff workflows are hidden. Cannot record payments, issue refunds, or change property settings. |
| Front Desk | Reservations, guest records, room lookup, check-in/out, payment recording, invoices, guest requests, maintenance reports, and limited AI assistance. Financial aggregates and lifetime guest spend are hidden. |
| Housekeeping | Assigned room tasks, relevant room details, and reporting guest requests or maintenance issues. No guest financial data. |
| Maintenance | Assigned maintenance issues, relevant room details, and reporting guest requests. No guest financial data. |

Permissions are enforced by the API as well as the interface. Each account is scoped to one property; portfolio-level multi-property access is not implemented.

## Run locally

### Requirements

- Python 3.11 (Python 3.10+ supported)
- Node.js 18+ and Corepack/Yarn 1.22.22
- MongoDB 6 or 7

Start a local MongoDB with Docker:

```bash
docker run --name innos-mongo -p 27017:27017 -d mongo:7
```

If the container already exists, run `docker start innos-mongo`.

### Configure the API

Create `backend/.env`:

```dotenv
MONGO_URL=mongodb://localhost:27017
DB_NAME=innos_platform
JWT_SECRET=replace-with-a-long-random-local-secret
FRONTEND_URL=http://localhost:3000
COOKIE_SECURE=false
SEED_DEMO=false
```

Install and start the API:

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

The API is at `http://localhost:8000/api/`; interactive documentation is at `http://localhost:8000/docs`.

### Configure the web app

In a second terminal, create `frontend/.env`:

```dotenv
REACT_APP_BACKEND_URL=http://localhost:8000
```

Install dependencies and start the web app:

```bash
cd frontend
corepack yarn install
corepack yarn start
```

Open `http://localhost:3000`. The browser origin must match `FRONTEND_URL` so credentialed sign-in cookies work.

### Demo data

Demo seeding is opt-in. Set `SEED_DEMO=true` before starting the API to create a sample property, rooms, bookings, guests, and these local accounts in an empty database:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@example.com` | `Owner@123` |
| Manager | `manager@dharamshalaheights.in` | `Manager@123` |
| Accounts | `accounts@dharamshalaheights.in` | `Accounts@123` |
| Front Desk | `frontdesk@dharamshalaheights.in` | `Frontdesk@123` |
| Housekeeping | `housekeeping@dharamshalaheights.in` | `House@123` |
| Maintenance | `maintenance@dharamshalaheights.in` | `Maint@123` |

Use demo accounts only with local sample data. For a clean database without sample records, register an owner from the sign-in screen and complete the setup wizard.

## Run with Docker Compose

Docker Compose starts the web app, API, and MongoDB with persistent database storage and health checks.

1. Copy `.env.example` to `.env` at the repository root.
2. Replace the MongoDB password and JWT secret with random values. Use letters and numbers in the MongoDB password because it is embedded in a connection URI.
3. Start the stack:

```bash
docker compose up --build -d
```

Open `http://localhost:3000`. To inspect logs, use `docker compose logs -f frontend backend`; stop the app with `docker compose down`. The database volume remains when stopped. To remove the database volume and its data, use `docker compose down -v`.

The Compose setup does not seed demo data by default. To use sample data, set `SEED_DEMO=true` in `.env` before starting the stack. The frontend proxies `/api` requests to the API container, so browser requests and session cookies stay on the same origin. For an HTTPS deployment, set `FRONTEND_URL` to the public frontend origin and `COOKIE_SECURE=true`, terminate TLS at a trusted reverse proxy, and use persistent protected secrets and backups.

## Optional AI provider

Without provider credentials, AI Manager uses a deterministic local response for common operational questions. To enable open-ended, read-only answers using an OpenAI-compatible chat completions API, set these values in `backend/.env` (or the root `.env` for Compose):

```dotenv
AI_PROVIDER=openai_compatible
AI_API_KEY=your-provider-key
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

Provider keys remain server-side. The model receives role-shaped hotel facts and cannot write property records.

## Project layout

```text
backend/       FastAPI application, MongoDB access, authorization, seed data, API routes
frontend/      React application, role-based screens, shared components and styling
docker-compose.yml
               Local multi-container deployment
```

## Current limits

- The discovery document recommends PostgreSQL; this codebase uses MongoDB and has not been migrated.
- WhatsApp/email delivery, payment gateway settlement verification, and provider webhooks are not connected. Innos can prepare a message draft for the user's mail or WhatsApp app but does not send or track it.
- Reconciliation matches manually supplied statement rows to recorded payment references and amounts. It does not retrieve statements, verify settlement with a provider, or move money.
- Public booking records a reservation with payment due at the property; it does not charge a card or send a confirmation.
- Photo uploads, portfolio-level multi-property access, production monitoring, backups, and deployment-specific TLS configuration are not included in the MVP.

## Development checks

```bash
cd backend && python -m compileall .
cd frontend && corepack yarn build
```

These checks compile the Python modules and build the React application. They do not verify provider integrations or production readiness.
