# Build from the repo root: docker build -f docker/migrate/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/core packages/core
RUN pnpm install --frozen-lockfile --filter @vatsim-atc/core...

CMD ["pnpm", "--filter", "@vatsim-atc/core", "db:migrate"]
