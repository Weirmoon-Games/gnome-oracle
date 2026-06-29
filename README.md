# gnome-oracle
The Oracle of Truth

## Windows 11

This repo supports staying on Node 24 on Windows 11. If `better-sqlite3`
needs to build from source, the PowerShell installer will now install Python and
the Visual Studio C++ build tools automatically before retrying the build.

## Linux deployment

On Debian/Ubuntu servers, run:

```bash
sudo SERVER_NAME=your.domain.com bash deploy/install-linux.sh
```

The script will:

- install OS packages for Node.js, nginx, and native module builds
- install `python3` as a build-time dependency for native Node modules
- install a recent Node.js runtime if the server does not already have one
- build the app in standalone mode
- install and start a systemd service
- configure nginx to proxy `http://your.domain.com` to the app
- install and start Ollama if it is missing, then pull the default model

If you want the app on a non-default port or with a different model, set `PORT`,
`OLLAMA_MODEL`, or `OLLAMA_URL` before running the script.

## Upgrade features (accounts, DB, voice, uploads, settings)

This build adds a pluggable database, accounts, tune uploads, neural voice, an
expanded Settings page, and new personas. Full design + verification notes live
in [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) and the in-app docs at **`/docs`** (also
under [`docs/`](docs/README.md)).

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Local LLM server |
| `OLLAMA_MODEL` | `gemma2:2b` | Default model |
| `DATABASE_URL` | — | Optional `postgres://…` to seed a Postgres backend (else SQLite) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | Bootstrap the admin account on first run |
| `ALLOW_SIGNUP` | `1` | Allow visitor self-registration (`0` to disable) |
| `SESSION_TTL_DAYS` | `30` | Session/cookie lifetime |
| `SERVICE_AUTORESTART` | — | Set `1` when run under WinSW/systemd so the DB switch can exit for a clean relaunch |
| `NEXT_PUBLIC_KOKORO_MODEL` | HF CDN model | Local/vendored Kokoro ONNX model path for offline boxes |

### Runtime data (gitignored)

- `data/gnome.db` — default SQLite database.
- `data/db-config.json` — which backend to use (`sqlite`/`postgres`).
- `data/music/` — admin-uploaded background tracks.
- `public/models/kokoro/` — optional vendored neural-voice model for offline use.

### Database backend

Defaults to SQLite. An admin can switch to PostgreSQL from **Settings → Database
backend** (Test → Switch); data is copied over and the SQLite file is kept as a
backup. WebGPU neural voice needs a secure context (HTTPS or localhost).

After pulling this upgrade, run `npm install` to add the new dependencies
(`kysely`, `pg`, `kokoro-js`).
