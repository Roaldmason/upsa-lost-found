# Guest phone verification: setup

Guests now sign in in two steps: type their phone number, then type the 6-digit code we text to it.
Students still sign in with their index number only.

## How it works

1. Guest enters `0241234567` and taps **Send me a code** → `POST /api/guest/send-code`
2. Server makes a random 6-digit code, stores only a hash of it (5-minute life), and texts it through `server/sms.js`.
3. Guest types the code → `POST /api/guest/verify` → server checks it and returns the sign-in token.

Safety limits (in `server/app.js`): 60 s between texts to the same number, 10 code requests per IP per 15 min,
5 wrong tries per code, a code works once.

## Step 1: test for free (no account needed)

Keep `SMS_PROVIDER=console` in `.env`, run `npm start`, and ask for a code on the login page.
The text appears in your terminal, e.g. `[SMS to +233241234567] UPSA Lost & Found: your code is 482913...`

## Step 2: send real texts with Arkesel (Ghana SMS provider)

No SMS service is free forever: networks charge per message. Arkesel is built for Ghana, so MTN, Telecel
and AT numbers all work, and messages cost a few pesewas each.

1. Create an account at https://arkesel.com and sign in to the dashboard.
2. Register a **Sender ID** (up to 11 letters, e.g. `UPSAFound`). It can take a short time to be approved.
3. Create an **API key** in the dashboard and top up a small amount of credit.
   Check the dashboard for any free test credit on new accounts.
4. In `.env` (and in Render → Environment) set:
   ```
   SMS_PROVIDER=arkesel
   ARKESEL_API_KEY=your-key
   ARKESEL_SENDER_ID=UPSAFound
   ```
5. Restart the server and try it with your own number.

The key stays on the server. It is never sent to the browser.

## Using a different provider later (Termii, mNotify, Twilio ...)

Open `server/sms.js`, copy the `arkeselSender` function, change the URL and body to match the new provider's
docs, and add it to `createSender`. Nothing else in the app changes.

## Troubleshooting

| Problem | Fix |
|---|---|
| "We could not send the text message" | Check the server log. Usually a wrong key, an unapproved Sender ID, or no credit. |
| Code never arrives | Wait for the 60 s timer, then **Send a new code**. Check the number is a Ghana number. |
| "Too many code requests" | The limit is per IP; wait 15 minutes. |
