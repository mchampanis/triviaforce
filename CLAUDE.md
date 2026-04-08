# TriviaForce

Collaborative weekly trivia quiz app for a small group of friends (5-6 people).

## Tech Stack

- Node.js + Express backend
- better-sqlite3 (synchronous SQLite)
- multer for image uploads
- Vanilla JS frontend (no framework, no build step)
- Hosted on Fly.io (single machine in `ams`, mounted volume at `/data`); see `DEPLOY.md`

## Project Structure

- `server.js` -- Express app entry point
- `db.js` -- SQLite schema and query helpers
- `routes/` -- API route handlers
- `middleware/` -- Express middleware (identity resolution)
- `public/` -- Static frontend files (HTML, CSS, JS)
- `uploads/` -- Quiz images (gitignored)
- `data/` -- SQLite database (gitignored)

## Environment Variables

- `ADMIN_PASSWORD` (required) -- admin password for quiz management
- `PASSPHRASE` (required) -- shared passphrase for group access
- `PORT` (default: 3000)
- `DATABASE_PATH` (default: `data/triviaforce.db`)
- `UPLOAD_DIR` (default: `uploads/`)

## Running

```
npm install
cp .env.example .env   # edit with your passwords
node server.js
```
