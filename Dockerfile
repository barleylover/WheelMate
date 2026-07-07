FROM node:24-slim AS deps

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-slim AS build

WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build
RUN pnpm run ingest

FROM node:24-slim AS runtime

WORKDIR /app
ARG WHEELMATE_BUILD_SHA=unknown
ARG WHEELMATE_BUILD_REF=unknown
ENV NODE_ENV=production
ENV PORT=8080
ENV WHEELMATE_BUILD_SHA=$WHEELMATE_BUILD_SHA
ENV WHEELMATE_BUILD_REF=$WHEELMATE_BUILD_REF
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/src/data/schema.sql ./dist/data/schema.sql

EXPOSE 8080
CMD ["node", "dist/http.js"]
