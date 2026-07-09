#!/usr/bin/env sh
set -eu

if [ -x "./yuance-api" ]; then
  exec ./yuance-api migrate status
fi

echo "未找到 ./yuance-api；手工 Compose 环境请使用单次维护容器执行 migrate status / migrate up / seed core。" >&2
exit 1
