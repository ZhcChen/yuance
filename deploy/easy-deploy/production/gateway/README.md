# 元策公网网关模板

正式域名当前由 `qfy-sc-test` 的 Nginx 接入，Nginx 将流量转发到 FRPS，
再经 FRP Web 路由到 `qfy-test2`。`Caddyfile.yuance.example` 仅保留为
公网旧环境冷回滚模板，不是当前生效入口。

当前链路：

```text
https://yuance.quanxinfu.com
  -> qfy-sc-test Nginx :443
  -> FRPS 127.0.0.1:40000
  -> qfy-test2 FRPC
  -> qfy-test2 127.0.0.1:33033
  -> yuance-api
```

## 当前接入方式

```text
FRP Web：http://127.0.0.1:8067
名称：yuance
域名：yuance.quanxinfu.com
qfy-test2 本地端口：33033
远端端口：40000
```

服务器当前 Nginx 配置位于 `/etc/nginx/conf.d/qfy-443-frp-web.conf`，
Yuance 对应 `server_name yuance.quanxinfu.com` 的 server block。
FRPS 代理端口必须只监听 `127.0.0.1`，不得向公网开放 `40000-40999`。

## 更新期间维护页

`nginx-yuance.example.conf` 已包含 502、503、504 的本地维护页。它不依赖
`yuance-api`，因此 API 容器停止期间仍可显示“系统正在更新中”，并自动每 5 秒
重试。将现有 Nginx 文件中 Yuance 的整个 server block 替换为该模板后校验并
reload：

```bash
scp deploy/easy-deploy/production/gateway/nginx-yuance.example.conf \
  qfy-sc-test:/tmp/nginx-yuance.example.conf
ssh qfy-sc-test
sudo cp /etc/nginx/conf.d/qfy-443-frp-web.conf \
  /etc/nginx/conf.d/qfy-443-frp-web.conf.before-yuance-maintenance
# 将 /tmp/nginx-yuance.example.conf 的 Yuance server block 合并到现有配置，
# 保留其他域名 server block，且不要保留旧的 Yuance block。
sudo nginx -t
sudo systemctl reload nginx
```

## 验证

```bash
curl -fsS https://yuance.quanxinfu.com/api/healthz
curl -fsS https://yuance.quanxinfu.com/api/readyz
curl -I https://yuance.quanxinfu.com/web
```

## 旧环境回滚

只有回滚到公网服务器旧容器时才恢复 `Caddyfile.yuance.example`：

```bash
sudo cp Caddyfile.yuance.example /etc/caddy/Caddyfile.d/yuance.caddy
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

恢复前必须先停用 qfy-test2 Yuance 路由，并移出当前 Nginx 的 Yuance
server block，避免新旧两端同时提供写服务。
