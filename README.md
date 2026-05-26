# AI-ALE LIMS Data Viewer

A web-based viewer for laboratory information management system (LIMS) data. Built with Next.js, supports SQLite (local) and MySQL (production on Poplar server).

## Quick Start

```bash
npm install
cp .env.example .env.local   # edit DB_TYPE, MySQL credentials, or SQLITE_PATH
npm run dev                   # http://localhost:3000
```

## Deploy on Poplar

```bash
npm install && npm run build
# Configure .env.local with MySQL settings (request credentials from Filipe)
npm start
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `DB_TYPE` | `sqlite` | `sqlite` or `mysql` |
| `SQLITE_PATH` | `data/lims_mirror.db` | Path to SQLite file |
| `MYSQL_HOST` | `localhost` | MySQL server host |
| `MYSQL_PORT` | `3306` | MySQL server port |
| `MYSQL_USER` | `root` | MySQL user |
| `MYSQL_PASSWORD` | (empty) | MySQL password |
| `MYSQL_DATABASE` | `lims` | MySQL database name |

## API

- `GET /api/config` — DB config and connection status
- `POST /api/config` — Switch DB type or update credentials
- `GET /api/tables` — List tables
- `GET /api/data/[tableName]?page=1&pageSize=50&sortBy=col&sortDirection=asc&globalSearch=...&filterLogic=AND` — Paginated table data with filters
