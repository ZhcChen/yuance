# 元策 Caddy 网关片段

本目录提供元策正式环境的 Caddy 站点片段。部署服务器当前复用 `qfy-sc-test`，这台机器已经使用 Caddy，因此元策不再启动独立 Nginx 或 gateway 容器。

默认链路：

```text
https://yuance-test.quanxinfu.com
  -> Caddy
  -> 127.0.0.1:33033
  -> yuance-api
```

## 接入命令

```bash
sudo mkdir -p /etc/caddy/Caddyfile.d
sudo cp /srv/yuance/easy-deploy/production/gateway/Caddyfile.yuance /etc/caddy/Caddyfile.d/yuance.caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

如果 `/etc/caddy/Caddyfile` 没有：

```caddy
import /etc/caddy/Caddyfile.d/*.caddy
```

需要先加入 import，或把 `Caddyfile.yuance` 的站点块手工追加到主 Caddyfile。

## 验证

```bash
curl -fsS https://yuance-test.quanxinfu.com/api/healthz
curl -I https://yuance-test.quanxinfu.com/web
```

如实际域名不是 `yuance-test.quanxinfu.com`，同步替换 Caddyfile、DNS 和部署文档中的域名。
