#!/usr/bin/env sh
set -eu

IMAGE="${YUANCE_API_IMAGE:-yuance-api:latest}"
OUTPUT="${YUANCE_API_IMAGE_TAR:-dist/yuance-api-linux-amd64.tar}"
PLATFORM="${YUANCE_API_PLATFORM:-linux/amd64}"
LOAD_AFTER_BUILD="${YUANCE_API_LOAD_AFTER_BUILD:-0}"

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx 不可用，请先安装或启用 Docker Buildx。" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

docker buildx build \
  --platform "$PLATFORM" \
  -t "$IMAGE" \
  -f api/Dockerfile \
  --output "type=docker,dest=$OUTPUT" \
  .

echo "已生成镜像 tar: $OUTPUT"
echo "镜像名: $IMAGE"
echo "目标平台: $PLATFORM"

if [ "$LOAD_AFTER_BUILD" = "1" ]; then
  docker load -i "$OUTPUT"
  docker image inspect "$IMAGE" --format 'loaded image platform={{.Os}}/{{.Architecture}}'
fi
