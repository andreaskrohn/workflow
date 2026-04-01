# CLAUDE.md — Workflow Project Guide

## Critical Architecture Rules

### `app/layout.tsx` is a Server Component — NEVER add `'use client'`

`layout.tsx` imports `@/lib/scheduler` as a side-effect to register the
node-cron job once at process startup. `node-cron` and `child_process` are
Node.js-only modules. Adding `'use client'` would attempt to bundle them for
the browser and break the build.

```ts
// app/layout.tsx — correct
import '@/lib/scheduler'           // server-only side-effect
import Providers from '@/components/Providers'
// NO 'use client' here
```

---

### `components/Providers.tsx` is FROZEN after Phase 1

**Do not modify this file.** The provider order and `children` prop are
contractual. Internal implementations of each provider may change, but
Providers.tsx itself must stay exactly as written.

```tsx
// Frozen structure:
<CsrfProvider>
  <ToastProvider>
    <TagContextProvider>{children}</TagContextProvider>
  </ToastProvider>
</CsrfProvider>
```

---

### `TagContextProvider` signature is frozen

The export name and prop signature of `TagContextProvider` in
`components/tags/TagContext.tsx` **must never change**:

```tsx
export function TagContextProvider({ children }: { children: React.ReactNode })
```

Agent E owns the internals of `TagContext.tsx`. All other agents must treat
the external interface as read-only.

---

## Database

- **Production DB:** `~/Documents/workflow-data/workflow.db`
- **Test DB:** `workflow-test.db` (in project root, git-ignored)
- Override with `DATABASE_URL` environment variable.

### Migrations

- Migration SQL files live in `drizzle/`.
- Run with `npm run db:migrate` (`scripts/migrate.ts`).
- Each migration run backs up the DB first; keeps 5 most recent backups.
- `EXPECTED_SCHEMA_VERSION` in `lib/db/schemaVersion.ts` must match the DB.
  Server startup calls `checkSchemaVersion()` and exits with
  `'Schema mismatch. Run: npm run db:migrate'` on mismatch.

### Soft delete — relational tables

**Never `DELETE FROM task_dependencies` or any other relational/junction table.**
Always use `UPDATE … SET archived_at = ?`.

```sql
-- Correct
UPDATE task_dependencies SET archived_at = ? WHERE id = ? AND archived_at IS NULL

-- Wrong
DELETE FROM task_dependencies WHERE id = ?
```

The partial unique index `task_deps_unique_active WHERE archived_at IS NULL`
enforces uniqueness only on active edges, so archived duplicates are allowed.

### FTS5 handling

The `tasks_fts` FTS5 virtual table **does not cascade deletes via foreign keys**.
When archiving a task the repository explicitly deletes its FTS entry:

```sql
DELETE FROM tasks_fts WHERE rowid = ?
```

The `tasks_fts_archive` trigger fires on `UPDATE tasks SET archived_at` and
does the same thing — the explicit delete is belt-and-suspenders.

When un-archiving, the `tasks_fts_unarchive` trigger re-indexes automatically.

---

## CSRF

Every `POST`, `PATCH`, and `DELETE` API route must be wrapped with `withCsrf`:

```ts
import { withCsrf } from '@/lib/middleware/csrf'
export const POST = withCsrf(handler)
```

The client fetches the token from `GET /api/csrf-token` via `CsrfProvider`
(`lib/csrf-context.tsx`) and sends it as `X-CSRF-Token`. A mismatch returns
HTTP 403 and logs a Pino `warn`.

Client helpers: `getCsrfToken()` and `invalidateCsrfToken()` (exported from
`lib/middleware/csrf.ts`) share a single in-flight refresh promise so
simultaneous 403 responses trigger only one new token fetch.

---

## Middleware stacking

Compose middleware right-to-left when applying multiple wrappers:

```ts
export const POST = withRateLimit(withPayloadLimit(withCsrf(handler)))
```

Available middleware:
- `withCsrf` — validates `X-CSRF-Token` on mutating methods
- `withRateLimit` — 100 req / 10 s per client IP; returns 429 + `Retry-After`
- `withPayloadLimit` — rejects bodies > 5 MB with 413

---

## Validation

Zod schemas in `lib/validation/task.ts`. Field limits:
- `title`: 500 chars (required)
- `end_goal`, `description`, `notes`: 2 000 chars each (optional)

All user-visible validation messages use **UK English**.
Pino log messages use **US English**.

---

## Error handling

`handleApiError(error, showToast)` in `lib/utils/errors.ts`:
- `ZodError` or `ApiError` with `fieldErrors` → returns `Record<string, string>`
  for inline field display.
- Other errors → calls `showToast(message)` and returns `{}`.

`ApiError` and `responseToApiError` are in the same file.

---

## Scheduler

`lib/scheduler.ts` uses a `global.schedulerInitialized` guard so the cron
job is registered only once per process even in Next.js hot-reload:

```ts
declare global { var schedulerInitialized: boolean | undefined }
if (!global.schedulerInitialized) {
  global.schedulerInitialized = true
  cron.schedule('0 23 * * *', () => { /* daily backup */ })
}
```

Import it **only** from Server Components or `server.ts`.

---

## Testing

- Test runner: **Jest 29** + ts-jest
- Run: `npm test`
- `tests/setup.ts` (globalSetup): creates `workflow-test.db`, runs migrations,
  exports `resetDatabase()` which truncates all tables (including `tasks_fts`
  explicitly — no AFTER DELETE trigger on tasks).
- `tests/teardown.ts` (globalTeardown): deletes test DB + WAL sidecar files.
- Component tests: add `/** @jest-environment jsdom */` docblock.
- Repository tests: call `resetDatabase()` in `beforeEach`, open a fresh
  `Database(process.env['DATABASE_URL']!)` connection.
- `global.fetch` is not available in jsdom — stub it in `beforeEach`:
  ```ts
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 } as unknown as Response)
  ```

---

## Logger

`lib/logger.ts` — pino with pino-roll transport (size-based rotation at 50 MB).
- Transport is skipped when `NODE_ENV === 'test'` to avoid worker-thread issues.
- Level controlled by `LOG_LEVEL` env var (default `'info'`).
- `checkSchemaVersion.ts` has **no pino import** — it must stay that way.
  See comment in that file for why.

---

## Backup

- `POST /api/backup` spawns `scripts/backup.sh` non-blocking and returns
  `{ message: 'Backup started.' }` (UK English, HTTP 200).
- `scripts/backup.sh` copies `workflow.db` to
  `workflow-YYYY-MM-DD-HHMMSS.backup.db` in the same directory.
- The daily cron in `lib/scheduler.ts` runs the same script at 23:00.
