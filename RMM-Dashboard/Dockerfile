# Fixsmith RMM Dashboard — runs the custom server (server.ts: Next.js + the
# WebSocket relay + schedulers), so we build Next and start via tsx rather than
# `next start`.
#
# Uses the full node:20 image (not -slim) because it already ships openssl +
# ca-certificates, which Prisma needs — avoiding an apt-get step that fails on
# hosts where the Debian mirrors aren't reachable during the build.
FROM node:20 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# A placeholder DB URL satisfies any build-time Prisma usage; the real one is
# injected at runtime by compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate && npm run build

FROM node:20 AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Bring the whole built app (custom server + .next + node_modules + prisma).
COPY --from=build /app ./

EXPOSE 3000
# Apply pending migrations, then start the custom server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx server.ts"]
