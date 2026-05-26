# AI-ALE LIMS Data Viewer

Web viewer for LIMS data. Uses SQLite by default, or MySQL if `MYSQL_URL` is set.

## Quick Start

```bash
npm install
cp .env.example .env.local   # set SQLITE_PATH or MYSQL_URL
npm run dev                   # http://localhost:3000
```

## Docker

```bash
cp .env.example .env.local
cp /path/to/your.db data/
docker compose up --build -d   # http://localhost:3000
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `SQLITE_PATH` | `data/lims_mirror.db` | SQLite database path |
| `MYSQL_URL` | — | MySQL connection string (`mysql://user:pass@host:3306/db`) |

DB type is auto-detected: if `MYSQL_URL` is set, MySQL is used; otherwise SQLite.

## API

- `GET /api/config` — DB config and connection status
- `POST /api/config` — Switch DB type or update credentials
- `GET /api/tables` — List tables
- `GET /api/data/[tableName]?page=1&pageSize=50&sortBy=col&sortDirection=asc&globalSearch=...&filterLogic=AND` — Paginated table data with filters
