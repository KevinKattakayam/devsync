FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build && npx tsc -p tsconfig.seed-build.json
RUN mkdir -p /state/admin /state/runtime && chown -R node:node /state

FROM build AS tooling
USER node
CMD ["node", "docker/initialize.mjs"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=5000
ENV DEPLOYMENT_MODE=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=node:node /app/docker ./docker
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=4s --start-period=30s --retries=5 CMD ["node", "docker/health.mjs"]
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["node", "dist/server.js"]
