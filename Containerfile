# Node 24.18.0 on Alpine 3.24, with the scanned OpenSSL security fixes pinned.
FROM docker.io/library/node@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base
RUN apk add --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0

FROM base AS build

WORKDIR /workspace
RUN npm install --global pnpm@11.21.0

COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM base AS runtime

ENV GETTYSBURG_SERVER_HOST=0.0.0.0 \
    GETTYSBURG_SERVER_PORT=3000 \
    GETTYSBURG_TRUSTED_ORIGIN=http://127.0.0.1:3000 \
    NODE_ENV=production
WORKDIR /workspace
# Build tools are not needed by the server and contain their own dependency trees.
# These removals affect only this new image layer, never the host filesystem.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && mkdir -p /var/lib/gettysburg && chown node:node /var/lib/gettysburg

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/server ./apps/server
COPY --from=build --chown=node:node /workspace/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/scripts/public-smoke.mjs ./apps/server/public-smoke.mjs
COPY --from=build --chown=node:node /workspace/scripts/container-entrypoint.sh ./scripts/container-entrypoint.sh

VOLUME ["/var/lib/gettysburg"]

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD ["node", "apps/server/dist/readiness-healthcheck.js"]

CMD ["sh", "scripts/container-entrypoint.sh"]
