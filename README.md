# Embé - Bakery & Cafe Monorepo

Full-stack monorepo for **Embé** with:
- `backend`: Java 21 + Spring Boot 3 + MongoDB
- `frontend`: Next.js App Router + TypeScript + Tailwind + shadcn-style UI components
- `infra`: Docker Compose and Mongo replica set init

## Monorepo Structure

- `backend/`
- `frontend/`
- `infra/`
- `docker-compose.yml`

## Features Implemented

- Shared authentication (`ADMIN`, `CLIENT`) with JWT in `httpOnly` cookie
- Admin modules:
  - Ingredients inventory CRUD + stock transactions + CSV import
  - Products CRUD + stock logs CSV export
  - Recipes CRUD with ingredient validation
  - Production/bake workflow with:
    - Mongo transaction
    - ingredient deduction + product increment
    - bake history
    - idempotency key handling (no double deduct on retry)
  - Orders management with status transitions and stock deduct/restore logic
  - Dashboard KPIs + chart-ready data
- Storefront modules:
  - Product browsing
  - Product detail
  - Cart drawer and cart page
  - Checkout (requires login)

## Default Seed Accounts

- Admin: `admin@example.com` / `Admin123!`
- Client: `client@example.com` / `Client123!`

## Prerequisites

- Docker Desktop with Docker Compose
- Optional for local non-docker dev:
  - Java 21 + Maven
  - Node.js 20+

## Run (One Command)

From repository root:

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/swagger-ui.html`
- MongoDB: `mongodb://localhost:27017`

## Test Commands

### Backend

```bash
cd backend
mvn test
```

### Frontend

```bash
cd frontend
npm install
npm test
```

## Local Development (without Docker)

### Backend

```bash
cd backend
mvn spring-boot:run
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set frontend env if needed:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## API Route Summary

- Auth: `/api/auth/*`
- Ingredients: `/api/admin/ingredients/*`
- Products: `/api/admin/products/*`, public `/api/products/public/*`
- Recipes: `/api/admin/recipes/*`
- Bakes: `/api/admin/bakes/*`
- Orders: `/api/orders/*`, admin `/api/admin/orders/*`
- Dashboard: `/api/dashboard/*`

## Troubleshooting

- Mongo transactions fail:
  - Ensure replica set is initialized (`mongo-init` service must complete)
  - Recreate stack: `docker compose down -v && docker compose up --build`
- Login seems successful but no session:
  - Verify backend and frontend are running on `localhost` and cookie is not blocked
- Frontend cannot reach API:
  - Check `NEXT_PUBLIC_API_URL` (default is `http://localhost:8080`)

## Notes

- Bake workflow is idempotent by `idempotencyKey`.
- Order stock mutation rule uses **CONFIRMED** status for stock deduction and restores stock on **CANCELLED** after deduction.
