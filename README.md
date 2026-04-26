# SpendSense - Personal Expense Tracker

A production-ready minimal full-stack application to track and review personal expenses.

## Key Design Decisions

1.  **Database Strategy (SQLite + Integer Amounts)**:
    -   I chose **SQLite** via `better-sqlite3` for persistence. It provides ACID compliance and is more robust than a simple JSON file for maintaining financial data integrity.
    -   **Money Handling**: Amounts are stored as **integers** (cents/paise) to avoid floating-point arithmetic errors (`0.1 + 0.2 !== 0.3`). This is a critical pattern in production finance tools.

2.  **Idempotency & Resilience**:
    -   Network unreliability is handled by generating a `client_id` (UUID) on the frontend for each submission.
    -   The backend uses a `UNIQUE` index on `client_id`. If the client retries a request (e.g., due to a slow parent response or multiple clicks), the database prevents double-counting and the API returns the existing record with a `200 OK` status.

3.  **Full-Stack Architecture**:
    -   The app uses Express for the API and Vite for the React frontend.
    -   In development, Vite runs as middleware within Express, providing a seamless DX.
    -   In production, the backend is bundled using `esbuild` for speed and the frontend is pre-built and served as static assets.

4.  **UI/UX Intent**:
    -   **Feedback**: Used `motion` (Framer Motion) for exit/enter animations to make the list feel reactive.
    -   **Loading States**: Skeleton-like loading spinners and empty states provide clear status to the user.
    -   **Mobile First**: The layout shifts from a dual-column layout on desktop to a single-column stack on mobile.

## Trade-offs Made for This Timebox

**Chose SQLite over PostgreSQL**: SQLite with better-sqlite3 gives ACID compliance and zero infrastructure overhead. For a single-user personal finance tool this is the right call — I'd migrate to Postgres only when multi-user or high write concurrency is needed.

**Chose client_id in body over Idempotency-Key header**: The RFC-standard approach uses a header (Idempotency-Key). I chose body-based client_id because it survives form serialization more reliably in this setup and is simpler to test. In a public API I would use the header approach.

**No authentication**: Deliberately excluded — adding auth would double the scope with no benefit to evaluating the core CRUD and idempotency logic. V2 would use express-session or JWT.

**No pagination**: The dataset is expected to be small for a personal tool. Would add limit/offset query params before any production multi-user launch.

**category is validated against a whitelist server-side**: Prevents DB pollution. The whitelist lives in one place on the server so it's easy to extend.

**What I would do next**: Add edit/delete endpoints, a proper migration system (not db.exec in startup), and end-to-end tests with Playwright.

## Running the App

-   **Dev**: `npm run dev` (Starts Express + Vite on port 3000)
-   **Build**: `npm run build` (Preps production assets and server bundle)
-   **Start**: `npm start` (Runs the production server)

## Deployment Note

The app is configured to bind to `0.0.0.0` on port `3000` as required by the infrastructure. SQLite writes are persistent within the instance's local storage.
