# UPSA LOST and FOUND ID: Documentation

## Purpose
A small website where UPSA students post **IDs they have found** (student ID, Ghana Card, NHIS card, driver's licence, passport, voter ID) and **report their own missing IDs**, so owners and finders can reach each other.

## Files
| File | Role |
|---|---|
| `index.html` | Login page (index number only) |
| `dashboard.html` | Home: search and browse posts, with the "Post an ID" form beneath |
| `css/style.css` | All styling, light and dark mode, responsive |
| `js/login.js` | Index number validation and session start |
| `js/dashboard.js` | Posting, searching, filtering, WhatsApp links, resolve, remove |
| `docs/uml-design.mermaid` | UML class and sequence diagrams |

Open `index.html` in a browser to run it.

## Features
1. **Login:** index number must be 8 digits starting with `103` (`^103\d{5}$`), otherwise "Invalid ID".
2. **Browse (home):** cards for found IDs (yellow) and missing-ID reports (red outline). Search by name, ID type or place. Filters: all open, found, missing, my posts, resolved, everything.
3. **Post an ID:** switch between *I found an ID* and *I lost my ID*. Fields: ID type, name on the ID, place and exact spot, a note or description, optional photo, and WhatsApp number (required).
4. **Contact:** each open post has a WhatsApp button that opens a chat with the poster and a ready-made message.
5. **Resolve:** the poster marks a found ID as returned, or a missing ID as found. It can be reopened.
6. **Remove:** the poster can delete their own post after confirming.

## Data model (IDPost)
`id, kind (found | lost), idType, holder, place, detail, note, photo (data URL), whatsapp (233XXXXXXXXX), owner (index number), created, resolved`

## Privacy
IDs are sensitive. The form asks posters to cover the ID number in photos and never asks for it. WhatsApp numbers are visible to everyone using the portal.

## UML
`docs/uml-design.mermaid` holds the class diagram and the sequence diagram (two blocks separated by `---`). Paste each into https://mermaid.live to view or export.

## Known limits
- **Storage is per browser** (`localStorage`), so students on different devices do not see each other's posts. Going live for the whole campus needs a shared database.
- **Login has no password;** it checks the number format only.
- Ownership checks (who can remove) happen in the browser only.
