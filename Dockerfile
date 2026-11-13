FROM node:22.22.3-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Build-time route collection must never write to the deployed data volume.
ENV BRAZE_DATABASE_PATH=/tmp/braze-build.sqlite
RUN npm run build

FROM node:22.22.3-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    BRAZE_DATABASE_PATH=/app/data/braze.sqlite \
    CANVAS_WORKER_HEALTH_FILE=/app/data/canvas-worker-health.json
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
