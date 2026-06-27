# Fixsmith Tickets — Node/TypeScript HTTP server (mysql2 + nodemailer). Builds to
# dist/ and runs `node dist/index.js`. Serves public/ and applies migrations/ at
# startup, both resolved from the working directory, so the runtime cwd is /app.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
