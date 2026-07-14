# DreamerQuest — Cloud Run (Express + Vite static)
# Build context must include firebase-applet-config.json (gitignored; copy from *.example locally).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN test -f firebase-applet-config.json || ( \
  echo "ERROR: firebase-applet-config.json is required for Docker build." && \
  echo "Run: cp firebase-applet-config.example.json firebase-applet-config.json" && \
  echo "Then fill in your Firebase web app config." && \
  exit 1 \
)

ENV NODE_ENV=production
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json

RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 8080
USER node
CMD ["node", "dist/server.cjs"]
