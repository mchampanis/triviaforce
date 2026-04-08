# Deploying TriviaForce to Fly.io

Target: a single small VM in Amsterdam (`ams`), with a 1 GB volume holding
the SQLite database and uploaded images. The machine auto-stops when idle
and cold-starts on the next request.

## Prerequisites

- A Fly.io account (`fly auth signup` or `fly auth login`).
- `flyctl` installed locally: <https://fly.io/docs/flyctl/install/>.
- DNS control for the domain you want to use, in case you want to attach a custom subdomain.

## One-time setup

All commands run from the repo root.

### 1. Create the app

`fly.toml` is already committed, so we create the app *without* launching
the interactive wizard (which would overwrite it):

```
fly apps create triviaforce
```

If the name is taken, pick another and update `app =` in `fly.toml`.

### 2. Create the volume

The volume name (`triviaforce_data`) must match `[[mounts]].source` in
`fly.toml`.

```
fly volumes create triviaforce_data --region ams --size 1
```

You can grow it later with `fly volumes extend`.

### 3. Set secrets

Never put these in `fly.toml` -- secrets are encrypted at rest by Fly and
injected as env vars at runtime.

```
fly secrets set ADMIN_PASSWORD='...' PASSPHRASE='...'
```

### 4. First deploy

```
fly deploy
```

This builds the Docker image, pushes it to Fly's registry, provisions one
machine in `ams`, attaches the volume at `/data`, and starts the app.

Verify:

```
fly status
fly logs
curl https://triviaforce.fly.dev/api/health
```

### 5. Custom domain

Point DNS at the Fly app, then ask Fly to provision a TLS cert.

**DNS** -- in your DNS provider, add a CNAME for the subdomain you want
(e.g. `trivia`) pointing at `triviaforce.fly.dev.`:

```
<subdomain>    CNAME    triviaforce.fly.dev.
```

(If your provider doesn't allow CNAMEs at that level, use the A/AAAA
records `fly ips list` prints instead.)

**Cert** -- once DNS resolves:

```
fly certs add <subdomain>.<your-domain>
fly certs show <subdomain>.<your-domain>
```

Wait until status shows the cert as issued (usually under a minute), then
visit `https://<subdomain>.<your-domain>`.

## Day-to-day

| Task | Command |
|------|---------|
| Deploy latest code | `fly deploy` |
| Tail logs | `fly logs` |
| Open a shell on the VM | `fly ssh console` |
| Inspect the database | `fly ssh console -C "sqlite3 /data/triviaforce.db"` |
| Rotate a secret | `fly secrets set ADMIN_PASSWORD='...'` (triggers redeploy) |
| Grow the volume | `fly volumes extend <id> --size 2` |
| Stop the app | `fly scale count 0` |
| Start the app | `fly scale count 1` |

## Backups

Fly snapshots volumes daily for 5 days by default. To pull a manual
backup of the SQLite file to your laptop:

```
fly ssh sftp get /data/triviaforce.db ./triviaforce-backup.db
```

The `uploads/` directory lives at `/data/uploads` -- back it up the same
way (`sftp get -r /data/uploads ./uploads-backup`) if you care about the
images.

## Cost expectations

With `auto_stop_machines = "stop"` and `min_machines_running = 0`, the
machine sleeps after a short idle period and wakes on the next request
(~1-2 second cold start). For a 5-person group hitting it weekly, expect
costs in the low single-digit dollars per month: shared-cpu-1x at
$0.07/CPU-hour billed only while awake, plus ~$0.15/month for the 1 GB
volume.

## Troubleshooting

- **`better-sqlite3` build fails in Docker** -- the builder stage needs
  `python3 make g++`. They're already in the Dockerfile; if you change
  the base image, keep them.
- **Cert stuck on `awaiting configuration`** -- DNS hasn't propagated.
  Re-run `fly certs show <subdomain>.<your-domain>` after a few minutes.
- **Uploads / DB disappear after deploy** -- the volume isn't mounted.
  Check `fly volumes list` and that `[[mounts]].source` in `fly.toml`
  matches the volume name exactly.
- **Health check failing** -- `fly logs` will show why. The check hits
  `/api/health` over HTTP on port 3000 inside the VM.
