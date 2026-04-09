# Multi-stage build: compile better-sqlite3 native bindings in a builder
# image with toolchain, then copy node_modules into a slim runtime image.

FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev


FROM node:20-bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY server.js db.js COMMIT* ./
COPY routes ./routes
COPY middleware ./middleware
COPY public ./public

# Database and uploads live on the mounted Fly volume at /data.
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/triviaforce.db \
    UPLOAD_DIR=/data/uploads

EXPOSE 3000

CMD ["node", "server.js"]
