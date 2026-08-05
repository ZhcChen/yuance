# 元策 Caddy 网关片段

本目录保留元策旧环境的 Caddy 站点片段，当前只用于回滚。正式域名由
WSL 的 FRP Web 控制台发布受管 FRPC/Caddy 片段，禁止再把本模板复制为
生效中的 `yuance.caddy`，否则会产生同域名重复站点。

当前链路：

```text
https://yuance.quanxinfu.com
  -> qfy-sc-test Caddy
  -> FRPS 127.0.0.1:40000
  -> WSL FRPC
  -> WSL 127.0.0.1:33033
  -> yuance-api
```

## 当前接入方式

```text
FRP Web：http://127.0.0.1:8067
名称：yuance
域名：yuance.quanxinfu.com
WSL 本地端口：33033
远端端口：40000
```

服务器受管文件位于 `/etc/caddy/Caddyfile.d/frp-web/*.caddy`。FRPS
代理端口必须只监听 `127.0.0.1`，不得向公网开放 `40000-40999`。

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

恢复前必须先停用 WSL Yuance 路由，并将 FRP Web 受管的 Yuance Caddy
片段移出加载范围，避免新旧两端同时提供写服务。
