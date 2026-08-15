FROM docker.io/library/node:24.13.1-bookworm-slim AS build

WORKDIR /workspace
RUN npm install --global pnpm@11.21.0

COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM docker.io/library/node:24.13.1-bookworm-slim AS runtime

ENV GETTYSBURG_SERVER_HOST=0.0.0.0 \
    GETTYSBURG_SERVER_PORT=3000 \
    GETTYSBURG_TRUSTED_ORIGIN=http://127.0.0.1:3000 \
    NODE_ENV=production
WORKDIR /workspace
RUN mkdir -p /var/lib/gettysburg && chown node:node /var/lib/gettysburg

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/server ./apps/server
COPY --from=build --chown=node:node /workspace/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /workspace/packages ./packages

VOLUME ["/var/lib/gettysburg"]

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/server/dist/index.js"]
