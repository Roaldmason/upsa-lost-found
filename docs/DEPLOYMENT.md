# Putting UPSA LOST and FOUND ID online

The website and the API are one Node.js app, so you deploy **one service** plus **one database**.

| Part | Service | Why |
|---|---|---|
| App (website + API) | Render, Web Service | Deploys straight from GitHub |
| Database | Neon (PostgreSQL) | Free plan with no expiry. Render's own free Postgres is deleted after 30 days |

Free plans change, so check the current limits on both sites before you rely on them.

## 1. Create the database (Neon)

1. Sign up at https://neon.com and create a project (any name, and the region closest to Ghana that is offered).
2. On the project dashboard, copy the **connection string**. It looks like
   `postgresql://user:password@ep-xxxx.aws.neon.tech/neondb?sslmode=require`
3. Keep `?sslmode=require` at the end.

The app creates its own tables the first time it starts. You do not need to run any SQL.

## 2. Try it on your computer first

```
cp .env.example .env        # then edit .env: paste DATABASE_URL, set JWT_SECRET
npm install
npm start
```

Open http://localhost:3000. Generate a `JWT_SECRET` with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Push the code to GitHub

```
git add -A
git commit -m "Add backend, guest login and match prompts"
git push
```

`.env` is in `.gitignore`, so your secrets are not uploaded. Never commit it.

## 4. Deploy on Render

1. Sign up at https://render.com and connect your GitHub account.
2. **New +  >  Web Service**, pick the `upsa-lost-found` repository.
3. Settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free** (or Starter if you want it always awake)
4. Under **Environment**, add:
   - `DATABASE_URL` = your Neon connection string
   - `JWT_SECRET` = the long random string
   - `NODE_ENV` = `production`
   - `SMS_PROVIDER` = `arkesel`, plus `ARKESEL_API_KEY` and `ARKESEL_SENDER_ID` (see `docs/SMS-SETUP.md`)
5. Click **Create Web Service**. When the deploy finishes, Render gives you a URL like `https://upsa-lost-found.onrender.com`. Open it. That is your live site.

Every `git push` to the main branch redeploys automatically.

## 5. Things to know

- **Free web services go to sleep** after about 15 minutes without visitors, and the first visit afterwards takes around a minute. A paid instance removes this. A free uptime monitor (for example UptimeRobot) that requests `https://YOUR-URL/api/health` every 10 minutes also keeps it awake, but uses your free monthly hours faster.
- **HTTPS** is provided by Render. Share the `https://` link.
- **Custom domain:** Render > your service > Settings > Custom Domains.
- **Backups:** Neon keeps short-term history on the free plan. For anything important, export the database from time to time.

## 6. How the pieces talk to each other

```
Browser (public/)  --HTTPS-->  Express API (server/)  --SQL-->  Neon PostgreSQL
   Authorization: Bearer <token>        users, items, matches
```

1. Sign in: the browser sends the index number or phone number to `POST /api/login` and gets back a token valid for 7 days, kept in `sessionStorage`.
2. Every other request carries that token.
3. Posting an ID saves it in the database. The server immediately looks for an open post of the opposite kind (found vs missing) with the same ID type and a matching name, from a different user, and records a match.
4. The dashboard checks `GET /api/matches` when it opens, every 20 seconds, and when the tab becomes visible again. A new match opens the prompt for both the owner and the finder.

## 7. Before announcing it to the whole campus

- **Sign-in is not verified.** Anyone can type any index number or phone number. For the Guest login especially, add an SMS one-time code (for example with Twilio, Africa's Talking or Hubtel) so people cannot sign in as someone else's number. The code to change is `POST /api/login` in `server/app.js`.
- Phone numbers are visible to every signed-in user (needed for the WhatsApp buttons). Guests' numbers are masked in the "Posted by" line only.
- Photos are stored in the database as small JPEGs (max about 400 KB each). If you expect thousands, move them to object storage.
