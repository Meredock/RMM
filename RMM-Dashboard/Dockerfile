# Fixsmith RMM Dashboard — runs the custom server (server.ts: Next.js + the
# WebSocket relay + schedulers), so we build Next and start via tsx rather than
# `next start`.
FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# A placeholder DB URL satisfies any build-time Prisma usage; the real one is
# injected at runtime by compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate && npm run build

FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

# Bring the whole built app (custom server + .next + node_modules + prisma).
COPY --from=build /app ./

EXPOSE 3000
# Apply pending migrations, then start the custom server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx server.ts"]
