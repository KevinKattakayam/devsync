FROM node:22-trixie-slim@sha256:2117f713a417f3aff682ac8f5bc2ebbdf1beed51f36e67ab1e0fd3866b6d2d8f AS base
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
# Runtime launches Node directly; package managers and unused privileged/terminal tools stay out.
# Keep dpkg metadata intact so vulnerability scanners still report the installed OS packages.
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/bin/mount /usr/bin/umount /usr/bin/nsenter /usr/bin/infocmp
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
