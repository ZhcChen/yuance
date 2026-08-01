import React, { useEffect, useState } from "react";
import { HostStatusShell } from "@yuance/frontend-ui";

const STATE_LABELS = Object.freeze({
  starting: ["正在启动", "正在恢复设备会话"],
  unauthenticated: ["需要登录", "请在浏览器中完成设备授权"],
  authorizing: ["等待授权", "请完成浏览器中的确认"],
  authenticated: ["设备已认证", "安全连接已准备"],
  locked: ["会话已锁定", "设备凭证暂时不可用"],
  reauthorization_required: ["需要重新授权", "当前设备会话已失效"],
  fatal: ["无法启动", "安全宿主初始化失败"],
});
const NETWORK_LABELS = Object.freeze({
  idle: "等待连接", connecting: "正在连接", online: "服务在线", offline: "连接中断",
  suspended: "系统已挂起", reauthorization_required: "授权已失效", fatal: "网络不可用",
});

export default function DesktopApp({ services }) {
  const [authState, setAuthState] = useState(() => services.auth.getSnapshot());
  const [networkState, setNetworkState] = useState(() => services.network.getSnapshot());
  const [commandPending, setCommandPending] = useState(false);
  useEffect(() => services.auth.subscribe(setAuthState), [services]);
  useEffect(() => services.network.subscribe(setNetworkState), [services]);
  const [title, detail] = STATE_LABELS[authState.status] ?? STATE_LABELS.fatal;
  const run = (command) => async () => {
    if (commandPending) return;
    setCommandPending(true);
    try { await command(); }
    catch {
      // Public auth and network subscriptions render the resulting safe state.
    } finally { setCommandPending(false); }
  };
  const primaryAction = ["unauthenticated", "reauthorization_required"].includes(authState.status)
    ? { label: "开始授权", onClick: run(services.auth.authorize) }
    : ["locked"].includes(authState.status) || authState.status === "authenticated" && networkState.status === "offline"
      ? { label: "重试", onClick: run(services.auth.retry) }
      : undefined;
  const secondaryAction = authState.status === "authenticated"
    ? { label: "退出设备", onClick: run(services.auth.logout) }
    : undefined;

  return <HostStatusShell productName="元策" hostLabel="Desktop" status={authState.status} title={title} detail={detail}
    context={authState.status === "authenticated" ? NETWORK_LABELS[networkState.status] : undefined}
    primaryAction={primaryAction} secondaryAction={secondaryAction} actionsDisabled={commandPending} />;
}
