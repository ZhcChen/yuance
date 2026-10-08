#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 从正式模板派生无 TLS 的隔离 fixture，不读取正式证书、不发布宿主端口。
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'yuance-body-gateway-'));
try {
  const template = fs.readFileSync(path.join(root, 'deploy/easy-deploy/production/gateway/nginx-yuance.example.conf'), 'utf8');
  const server = template.replace('listen 443 ssl http2;', 'listen 8080;')
    .replace(/^\s*ssl_certificate(?:_key)?\s+[^;]+;\s*$/gm, '')
    .replaceAll('/etc/nginx/snippets/qfy-proxy-http.conf', '/fixture/proxy.conf');
  fs.writeFileSync(path.join(temporary, 'nginx.conf'), `worker_processes 1;\nevents { worker_connections 32; }\nhttp { ${server}\n}\n`);
  fs.writeFileSync(path.join(temporary, 'proxy.conf'), 'proxy_set_header Host $host;\n');
  const commands = [
    'set -eu',
    'apk add --no-cache nginx curl >/dev/null',
    'nginx -t -c /fixture/nginx.conf',
    'nginx -c /fixture/nginx.conf',
    'dd if=/dev/zero of=/tmp/oversized bs=1048576 count=17 2>/dev/null',
    'for method in POST PATCH; do',
    '  status=$(curl -sS -H "Host: yuance.quanxinfu.com" -H "Content-Type: application/json" -X "$method" --data-binary @/tmp/oversized -o /tmp/error.json -w "%{http_code}" http://127.0.0.1:8080/api/v1/projects/TEST/resources/19)',
    '  test "$status" = 413',
    '  grep -q \'"code":"payload_too_large"\' /tmp/error.json',
    'done',
    // 上游停止期间，新的 location 仍继承原维护表现。
    'status=$(curl -sS -H "Host: yuance.quanxinfu.com" -o /tmp/maintenance.html -w "%{http_code}" http://127.0.0.1:8080/api/v1/projects/TEST/resources/19)',
    'test "$status" = 200',
    'grep -q "系统正在更新中" /tmp/maintenance.html',
    'printf "网关模板：nginx -t、POST/PATCH JSON 413、维护页回归均通过。\\n"',
  ].join('\n');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/ops/local-docker.cjs'), 'run', '--rm', '-i', '--mount', `type=bind,src=${temporary},dst=/fixture,readonly`, 'alpine:3.22', 'sh'], { input: commands, stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
