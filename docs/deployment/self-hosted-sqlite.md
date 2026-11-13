# Self-hosted Canvas with persistent SQLite

This prepares one persistent-disk server running two processes: a Next.js web server and a Canvas worker. Both use `/app/data/braze.sqlite` on the same Docker named volume. No server has been created and no external deployment has been performed.

## Start on the future server

Use Docker Engine and Docker Compose 2.24 or later. The image pins Node **22.22.3** and runs `next start` with the full locked dependency tree. It does not require a separate database or queue service.

Keep runtime configuration outside the source checkout, for example `/etc/braze-clone/runtime.env`. At minimum, set the public origin used in message links:

```dotenv
BRAZE_PUBLIC_URL=https://your-host.example
MESSAGE_DELIVERY_ENABLED=false
CANVAS_WORKER_INTERVAL_MS=10000
```

Add the existing provider/connector configuration when those features are needed. Compose supplies the database and heartbeat paths to both services; keep those shared paths unchanged. Environment files are excluded from the image. Build-time public Next.js settings are compiled into the image, so rebuild after changing them.

```sh
export BRAZE_ENV_FILE=/etc/braze-clone/runtime.env
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3100/api/health
```

Port 3100 binds to loopback. Put the server's HTTPS reverse proxy in front of it when a hostname is available. `BRAZE_HTTP_PORT` changes the host port. The Docker image runs as UID/GID 1000 (`node`); a new named volume inherits the image directory's ownership.

The worker starts before the web service and must pass its health check. `docker compose stop` and ordinary container/image replacements retain the named volume. `docker compose down -v` deletes it and is not part of the update procedure.

```sh
docker compose build
docker compose up -d
docker compose logs --tail=100 worker web
```

## Worker commands

Use Node **22.22.3 or newer within Node 22.x** when running outside the image. Native TypeScript transformation is enabled explicitly. The resolver only supplies project `.ts` extensions and `@/` aliases; the real `server-only` package selects its `react-server` export. It is not replaced by a shim.

```sh
node --conditions=react-server --experimental-transform-types \
  --import ./scripts/register-runtime.mjs ./scripts/canvas-worker.mjs
```

For one pass against the configured SQLite file:

```sh
node --conditions=react-server --experimental-transform-types \
  --import ./scripts/register-runtime.mjs ./scripts/canvas-worker.mjs \
  --once --at 2026-11-12T08:30:00Z --limit 100
```

The equivalent command in the running worker container is:

```sh
docker compose exec worker node --conditions=react-server \
  --experimental-transform-types --import ./scripts/register-runtime.mjs \
  ./scripts/canvas-worker.mjs --once --limit 100 \
  --health-file /tmp/canvas-manual-pass-health.json
```

The separate health file keeps a manual pass from replacing the daemon's heartbeat. Normally the daemon is sufficient; manual passes use the same runtime dispatch and transaction rules. `--at` is limited to `--once` so a periodic worker cannot accidentally run forever against a frozen clock. Omitting it uses the current UTC instant on every pass. `--limit`, or `CANVAS_WORKER_LIMIT`, sets the processor's batch limit; omission preserves the runtime's own default. Batching continues on later passes.

The worker awaits each pass before scheduling the next one. `--interval-ms` or `CANVAS_WORKER_INTERVAL_MS` controls the pause after a pass (default 10,000 ms). A failed pass is recorded and retried on the next interval. `--once` returns a nonzero exit code on failure. SIGTERM/SIGINT stop accepting another pass, interrupt an idle wait and let an in-flight pass finish. Compose allows 120 seconds before forced termination.

## Health and operations

`/api/health` is the web readiness endpoint and must return 200 only when its required local services are ready, otherwise 503. The Compose checks read only that HTTP status.

The worker atomically replaces `/app/data/canvas-worker-health.json`. It contains process/timing/status metadata and counts, with no user profiles, runtime payloads, API keys or exception messages. The heartbeat continues during idle waits and asynchronous work. Failures store a bounded error code; detailed Canvas outcomes remain in the application's runtime records.

```sh
docker compose exec worker node scripts/canvas-worker.mjs --health-check
```

Health requires a live process, an `idle` or `running` state, no consecutive failed passes and a heartbeat at most 45 seconds old. `CANVAS_WORKER_HEALTH_STALE_MS` changes that threshold. A completed `--once` process deliberately leaves a `stopped` state and is not reported as a healthy daemon.

Before a data migration, stop both services and back up the named volume. For an online backup, use SQLite's backup API or another SQLite-aware backup tool; copying only a live main database file can omit committed WAL data. Store backups outside the server's disk and verify restoration on a separate disposable database. To migrate an existing server-backed draft set, restore its SQLite data into this volume while both services are stopped. In the original browser and workspace, use **Import browser drafts** on the Canvas list to copy browser-only drafts to server storage. Imports are idempotent and retain the local originals; keep their exported graphs as an additional recovery copy.

## Validation in this workspace

Docker and Compose CLI tools were found, but the Docker daemon was unavailable. No image build or container run was attempted. Compose's expanded schema was validated without starting services. Startup and Compose tests passed **8/8** on Node 22.22.3. They run the actual worker and store against temporary SQLite databases with delivery disabled, including controlled-time `--once`, real `server-only` conditions, failure exit status, stale heartbeat detection and graceful SIGTERM.

References: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Node 22.22.3 TypeScript support](https://nodejs.org/download/release/v22.22.3/docs/api/typescript.html), [Node module hooks](https://nodejs.org/download/release/v22.22.3/docs/api/module.html#moduleregisterhooksoptions). The corresponding Next.js deployment and self-hosting guides bundled in `node_modules/next/dist/docs/` were also read before preparing this setup.
