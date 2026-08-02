# Dialup Diaries

A full-stack social blog with a modern server-rendered foundation and the personality of the early personal web. Members can publish long-form posts, expand them inline, comment, like, repost, and customize a profile.

## Why this stack

- **Node.js + Express 5 + TypeScript**: familiar, maintainable server code without a client framework.
- **EJS + vanilla browser JavaScript**: accessible HTML works before JavaScript; only interactions are bundled.
- **PostgreSQL + Drizzle ORM**: strong relational constraints, explicit reviewable SQL migrations, and a lightweight typed schema.
- **Motion mini**: small, modern reaction animations with reduced-motion support.
- **Session authentication**: HTTP-only, SameSite cookies backed by PostgreSQL; passwords use Argon2id.

The browser bundle is about 10 KB minified. There is no React, Next.js, client router, or large UI kit.

## Requirements

- Node.js 24 or newer
- PostgreSQL 15 or newer

## Local setup

1. Create a database:

   ```sql
   CREATE DATABASE dialup_diaries;
   ```

2. Copy `.env.example` to `.env` and replace `SESSION_SECRET` with a random value of at least 32 characters.
3. Install, migrate, and optionally add demo content:

   ```sh
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. Start the development server:

   ```sh
   npm run dev
   ```

Open `http://localhost:3000`. Seeded accounts all use `DemoPassword123!` and are for local development only.

## Commands

- `npm run dev` — run the TypeScript server with reload
- `npm run db:migrate` — apply pending migrations
- `npm run db:seed` — add local demo users and posts
- `npm run check` — type-check, lint, test, and build
- `npm run start` — run the compiled production server

## Structure

```text
src/
  client/       small progressive-enhancement bundle
  config/       validated environment configuration
  db/           Drizzle schema and PostgreSQL connection
  middleware/   sessions, user locals, CSRF, authorization
  routes/       HTTP controllers
  services/     authentication and social data operations
  views/        server-rendered EJS pages and partials
public/         static CSS and generated browser bundle
drizzle/        versioned SQL migrations
scripts/        development seed script
tests/          Vitest test suite
```

Schema changes are deliberately SQL-first: add the versioned SQL file and matching typed definition in `src/db/schema.ts`, then review the migration before applying it.

## Production notes

- Set `NODE_ENV=production`, a unique `SESSION_SECRET`, and the production `DATABASE_URL`.
- Terminate TLS at a trusted reverse proxy and set `TRUST_PROXY=1` when there is exactly one proxy hop.
- Run `npm run db:migrate` as a release step, then `npm run build` and `npm start`.
- Keep the database on a private network, use a least-privilege application role, require verified TLS certificates, and back it up.
- The included controls cover CSP/security headers, CSRF, parameterized SQL, schema validation, request/body limits, rate limits, session fixation, secure cookies, and password hashing. Add email verification, password reset, content reporting, audit logging, and an external rate-limit store before opening unrestricted public registration at large scale.

## Accessibility

The UI uses semantic server-rendered HTML, keyboard-visible focus, labeled controls, live status messages, readable contrast, responsive layouts, and honors `prefers-reduced-motion`.
