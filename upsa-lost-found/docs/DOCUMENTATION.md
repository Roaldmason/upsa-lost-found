# UPSA LOST and FOUND ID: Documentation

## Purpose
A small website where UPSA students post **IDs they have found** (student ID, Ghana Card, NHIS card, driver's licence, passport, voter ID) and **report their own missing IDs**, so owners and finders can reach each other.

## Files
| File | Role |
|---|---|
| `public/index.html` | Login page: **Index number** (student) above **Guest** (phone number + SMS code) |
| `public/dashboard.html` | Home: search and browse posts, "Post an ID" form, match prompt |
| `public/css/style.css` | All styling, light and dark mode, responsive |
| `public/js/login.js` | Student login, and the guest two-step phone check (send code, enter code) |
| `public/js/dashboard.js` | Talks to the API: posting, browsing, resolve, remove, live refresh, match prompt |
| `server/app.js` | Express API and security settings |
| `server/db.js` | PostgreSQL connection and table creation |
| `server/matching.js` | Name matching rules |
| `server/index.js` | Starts the server |
| `server/test/` | Automated API tests |
| `docs/DEPLOYMENT.md` | How to put it online |
| `docs/uml-design.mermaid` | UML class and sequence diagrams |

Run it with `npm start` (see `README.md`).

## Features
1. **Login:** two ways in, one dashboard.
   - **Index number (top):** 8 digits starting with `103` (`^103\d{5}$`), otherwise "Invalid ID".
   - **Guest (below):** a 10-digit phone number starting with `0` (`^0\d{9}$`). The guest must **verify the number**: the server texts a 6-digit code (valid 5 minutes, one use, 5 wrong tries, 60 s between texts) and signs the guest in only after the right code is entered. See `docs/SMS-SETUP.md`.
   The server checks every format again and returns a signed token (7 days).
2. **Browse (home):** cards for found IDs (yellow) and missing-ID reports (red outline). Search by name, ID type or place. Filters: all open, found, missing, my posts, resolved, everything.
3. **Post an ID:** switch between *I found an ID* and *I lost my ID*. Fields: ID type, name on the ID, place and exact spot, a note or description, optional photo, and WhatsApp number (required).
4. **Contact:** each open post has a WhatsApp button that opens a chat with the poster and a ready-made message.
5. **Resolve:** the poster marks a found ID as returned, or a missing ID as found. It can be reopened.
6. **Remove:** the poster can delete their own post after confirming.
7. **Match prompt:** when a found post and a missing post have the same ID type and a matching name, a pop-up appears for **both** people with a WhatsApp button. Names match if they have the same words in any order, or if the shorter name has two or more words that all appear in the longer one ("Amina Mensah" matches "Amina Akua Mensah"; "Kwame" alone does not match "Kwame Asante"). Posts by the same person, resolved posts, and different ID types never match. The prompt returns until the person taps "Got it" or "Message on WhatsApp".
8. **Live data:** all posts are stored in PostgreSQL and shared by everyone. The page refreshes every 20 seconds.

## Data model
Tables in PostgreSQL:
- `phone_codes(phone, code_hash, expires_at, sent_at, attempts)`: pending guest codes (only a hash is stored)
- `users(id, role, created_at)`: id is the index number or guest phone number; role is `student` or `guest`
- `items(id, kind, id_type, holder, place, detail, note, photo, whatsapp, owner_id, created_at, resolved)`
- `matches(id, lost_item_id, found_item_id, created_at, lost_seen, found_seen)`

## API
| Route | Purpose |
|---|---|
| `POST /api/login` | `{role: "student", id}` returns a token (guests are refused here) |
| `POST /api/guest/send-code` | `{phone}` texts a 6-digit code |
| `POST /api/guest/verify` | `{phone, code}` returns a token for a verified guest |
| `GET /api/items` | All posts (needs sign-in) |
| `POST /api/items` | Create a post and look for matches |
| `PATCH /api/items/:id` | Owner marks resolved or reopens |
| `DELETE /api/items/:id` | Owner removes a post |
| `GET /api/items/:id/photo` | Photo of a post |
| `GET /api/matches` | Matches this user has not dismissed yet |
| `POST /api/matches/:id/seen` | Dismiss a match for this user |
| `GET /api/health` | Used by hosting checks |

## Privacy
IDs are sensitive. The form asks posters to cover the ID number in photos and never asks for it. WhatsApp numbers are visible to everyone using the portal.

## UML
`docs/uml-design.mermaid` holds the class diagram and the sequence diagram (two blocks separated by `---`). Paste each into https://mermaid.live to view or export.

## Known limits
- **Sign-in is not verified.** The server checks the format only, so anyone can type any index number or phone number. Add an SMS one-time code before relying on it (see `docs/DEPLOYMENT.md`).
- Ownership checks (who can change or remove a post) are enforced on the server.
- Posts and phone numbers are visible only to signed-in users.

## Admin (root) login and maintenance mode

- Sign in on the normal page with the root ID `10322580` (change it with `ROOT_ID` in `.env`). You land on `admin.html`.
- Optional: set `ROOT_PASSWORD` in `.env` and the admin must also type that password.
- The admin dashboard lists everyone who has posted, lets the admin remove any post or any user (the user's posts are deleted and they cannot sign in again until you press "Allow back"), and has the website ON/OFF switch.
- When the switch is OFF, everyone except the admin sees `maintenance.html` (the API answers 503). Turn it ON and the site returns; waiting users are sent back automatically.

## Inclusive design (8 features)

1. Skip link (login page)  2. One-time-code autofill  3. Screen-reader live announcements  4. Errors use a symbol and border, not only colour  5. Untilted login card  6. 44px+ touch targets
7. Reading comfort bar: text size and high contrast on every page (`public/js/a11y.js`)
8. "Listen" button that reads each post aloud (`public/js/dashboard.js`)
