# syntax=docker/dockerfile:1.7

ARG RUST_IMAGE=rust:1.94-bookworm
ARG DEBIAN_IMAGE=debian:bookworm-slim
ARG YUANCE_BUILD_RELEASE_VERSION=dev

FROM ${RUST_IMAGE} AS builder

WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libsqlite3-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY api/Cargo.toml api/Cargo.toml
COPY api/src api/src
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

ENV YUANCE_HTTP_ADDR=0.0.0.0:33033 \
    YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3 \
    YUANCE_DATA_DIR=/data \
    YUANCE_RELEASE_VERSION=${YUANCE_BUILD_RELEASE_VERSION}

EXPOSE 33033

CMD ["./yuance-api", "serve"]
