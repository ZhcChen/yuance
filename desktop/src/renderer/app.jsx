import React, { useEffect, useState } from "react";
import { HostStatusShell } from "@yuance/frontend-ui";

const STATE_LABELS = Object.freeze({
  starting: ["正在启动", "正在恢复设备会话"],
  unauthenticated: ["需要登录", "请在浏览器中完成设备授权"],
  authorizing: ["等待授权", "请完成浏览器中的确认"],
  authenticated: ["设备已认证", "业务连接将在下一阶段启用"],
  locked: ["会话已锁定", "设备凭证暂时不可用"],
  reauthorization_required: ["需要重新授权", "当前设备会话已失效"],
  fatal: ["无法启动", "安全宿主初始化失败"],
});

export default function DesktopApp({ services }) {
  const [authState, setAuthState] = useState(() => services.auth.getSnapshot());
  useEffect(() => services.auth.subscribe(setAuthState), [services]);
  const [title, detail] = STATE_LABELS[authState.status] ?? STATE_LABELS.fatal;

  return <HostStatusShell productName="元策" hostLabel="Desktop" status={authState.status} title={title} detail={detail} />;
}
