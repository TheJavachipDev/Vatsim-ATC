# Build from the repo root: docker build -f apps/collector/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/collector/package.json apps/collector/
RUN pnpm install --frozen-lockfile --filter @vatsim-atc/collector...
COPY packages/core packages/core
COPY apps/collector apps/collector
RUN pnpm --filter @vatsim-atc/core build \
 && pnpm --filter @vatsim-atc/collector build \
 && pnpm --filter @vatsim-atc/collector deploy --prod /app/deploy

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/deploy .
CMD ["node", "dist/index.js"]
