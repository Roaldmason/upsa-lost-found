# UPSA LOST and FOUND ID

Website and API where UPSA students and guests post found IDs, report missing ones, and get a prompt when a post matches.

- `public/` the website (login page, dashboard, styles)
- `server/` the Node.js API (Express + PostgreSQL)
- `docs/DEPLOYMENT.md` step-by-step guide to put it online
- `docs/DOCUMENTATION.md` features, data model, API

## Run it on your computer

1. Install Node.js 18 or newer.
2. Create a free Postgres database at https://neon.com and copy its connection string.
3. `cp .env.example .env` and fill in `DATABASE_URL` and `JWT_SECRET`.
4. `npm install`
5. Guests get a text-message code. Leave `SMS_PROVIDER=console` while testing: the code prints in the terminal. For real texts see `docs/SMS-SETUP.md`.
6. `npm start`, then open http://localhost:3000

`npm test` runs the API tests (they use an in-memory database, so no setup is needed).
