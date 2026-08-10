# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm
ARG RUST_IMAGE=rust:1.94-bookworm
ARG DEBIAN_IMAGE=debian:bookworm-slim
ARG YUANCE_BUILD_RELEASE_VERSION=dev

FROM ${NODE_IMAGE} AS web-builder

WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/packages/api-client/package.json packages/api-client/package.json
COPY frontend/packages/app-core/package.json packages/app-core/package.json
COPY frontend/packages/platform-contract/package.json packages/platform-contract/package.json
COPY frontend/packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY frontend/packages ./packages

WORKDIR /src/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run check && npm run build

FROM ${RUST_IMAGE} AS builder

WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libsqlite3-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY api/Cargo.toml api/Cargo.toml
COPY tools/yuance-agent-cli/Cargo.toml tools/yuance-agent-cli/Cargo.toml
COPY api/src api/src
COPY tools/yuance-agent-cli/src tools/yuance-agent-cli/src
COPY api/templates api/templates
COPY api/static api/static
COPY api/migrations api/migrations
COPY docs/openapi docs/openapi

RUN cargo build --release -p yuance-api

FROM ${DEBIAN_IMAGE}

WORKDIR /app

ARG YUANCE_BUILD_RELEASE_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata wget libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/target/release/yuance-api /app/yuance-api
COPY --from=web-builder /src/web/dist /app/web/dist

ENV YUANCE_HTTP_ADDR=0.0.0.0:33033 \
    YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3 \
    YUANCE_DATA_DIR=/data \
    YUANCE_RELEASE_VERSION=${YUANCE_BUILD_RELEASE_VERSION} \
    YUANCE_WEB_DIST_DIR=/app/web/dist

EXPOSE 33033

CMD ["./yuance-api", "serve"]
