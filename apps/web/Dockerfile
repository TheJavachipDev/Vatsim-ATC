# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @vatsim-atc/web...
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @vatsim-atc/core build \
 && pnpm --filter @vatsim-atc/web build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Next.js standalone output bundles the server and required node_modules.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
