FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ARG DEPLOYMENT_MODE=production
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_YJS_URL
ARG BACKEND_URL
ENV DEPLOYMENT_MODE=$DEPLOYMENT_MODE
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_YJS_URL=$NEXT_PUBLIC_YJS_URL
ENV BACKEND_URL=$BACKEND_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -- --webpack
RUN node -e "require('fs').writeFileSync('build-settings.json', JSON.stringify({mode:process.env.DEPLOYMENT_MODE,clerk:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''}))"

FROM base AS runner
# Runtime launches Node directly; package-manager tooling is build/migration-tooling only.
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/docker ./docker
COPY --from=build --chown=node:node /app/build-settings.json ./build-settings.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=30s --retries=5 CMD ["node", "docker/health.mjs"]
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
