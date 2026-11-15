# UPSA LOST and FOUND ID: Documentation

## Purpose
A small website where UPSA students post **IDs they have found** (student ID, Ghana Card, NHIS card, driver's licence, passport, voter ID) and **report their own missing IDs**, so owners and finders can reach each other.

## Files
| File | Role |
|---|---|
| `public/index.html` | Login page: **Guest** (phone number) above **Index number** |
| `public/dashboard.html` | Home: search and browse posts, "Post an ID" form, match prompt |
| `public/css/style.css` | All styling, light and dark mode, responsive |
| `public/js/login.js` | Validation for both login types, calls `POST /api/login` |
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
   - **Guest:** a 10-digit phone number starting with `0` (`^0\d{9}$`).
   - **Index number:** 8 digits starting with `103` (`^103\d{5}$`), otherwise "Invalid ID".
   Fill in one box only. The server checks the format again and returns a signed token (7 days).
2. **Browse (home):** cards for found IDs (yellow) and missing-ID reports (red outline). Search by name, ID type or place. Filters: all open, found, missing, my posts, resolved, everything.
3. **Post an ID:** switch between *I found an ID* and *I lost my ID*. Fields: ID type, name on the ID, place and exact spot, a note or description, optional photo, and WhatsApp number (required).
4. **Contact:** each open post has a WhatsApp button that opens a chat with the poster and a ready-made message.
5. **Resolve:** the poster marks a found ID as returned, or a missing ID as found. It can be reopened.
6. **Remove:** the poster can delete their own post after confirming.
7. **Match prompt:** when a found post and a missing post have the same ID type and a matching name, a pop-up appears for **both** people with a WhatsApp button. Names match if they have the same words in any order, or if the shorter name has two or more words that all appear in the longer one ("Amina Mensah" matches "Amina Akua Mensah"; "Kwame" alone does not match "Kwame Asante"). Posts by the same person, resolved posts, and different ID types never match. The prompt returns until the person taps "Got it" or "Message on WhatsApp".
8. **Live data:** all posts are stored in PostgreSQL and shared by everyone. The page refreshes every 20 seconds.

## Data model
Tables in PostgreSQL:
- `users(id, role, created_at)`: id is the index number or guest phone number; role is `student` or `guest`
- `items(id, kind, id_type, holder, place, detail, note, photo, whatsapp, owner_id, created_at, resolved)`
- `matches(id, lost_item_id, found_item_id, created_at, lost_seen, found_seen)`

## API
| Route | Purpose |
|---|---|
| `POST /api/login` | `{role: "student" or "guest", id}` returns a token |
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
