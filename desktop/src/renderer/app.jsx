import React, { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { HostStatusShell } from "@yuance/frontend-ui";
import { SharedApp } from "@yuance/frontend-app-shell";

import {
  createDesktopPresentationState,
  reduceDesktopPresentationState,
} from "./platform/presentation-state.js";

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
const STATE_DESCRIPTIONS = Object.freeze({
  starting: "正在检查本机配置并恢复已有设备会话。",
  unauthenticated: "授权将在系统浏览器中完成，确认后此窗口会自动进入工作台。",
  authorizing: "授权请求已发出，请在浏览器中确认当前设备。",
  authenticated: "设备身份已经确认，正在建立业务数据连接。",
  locked: "本机设备凭证暂时不可用，请重试恢复连接。",
  reauthorization_required: "当前设备会话已经失效，需要重新确认设备身份。",
  fatal: "安全运行环境未能完成初始化，请重新启动应用。",
});

export default function DesktopApp({ services }) {
  /** @type {React.MutableRefObject<HTMLElement | null>} */
  const stageElement = useRef(null);
  const [presentation, updatePresentation] = useReducer(
    reduceDesktopPresentationState,
    undefined,
    () => createDesktopPresentationState({
      authState: services.auth.getSnapshot(),
      networkState: services.network.getSnapshot(),
    }),
  );
  const [commandPending, setCommandPending] = useState(false);
  useEffect(() => services.auth.subscribe((authState) => updatePresentation({ authState })), [services]);
  useEffect(() => services.network.subscribe((networkState) => updatePresentation({ networkState })), [services]);
  const { authState, networkState } = presentation;
  useLayoutEffect(() => {
    if (!presentation.presentable) return;
    stageElement.current?.focus({ preventScroll: true });
    services.lifecycle.ready();
  }, [presentation.presentable, presentation.stage, services]);
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

  return (
    <div className="desktop-root-shell" data-desktop-stage={presentation.stage}>
      <section
        ref={stageElement}
        className="desktop-stage"
        aria-label={presentation.stage === "workspace" ? "元策工作台" : detail}
        tabIndex={-1}
      >
        {presentation.stage === "workspace" ? (
          <SharedApp services={services.app} />
        ) : (
          <HostStatusShell productName="元策" hostLabel="Desktop" status={authState.status} title={title} detail={detail}
            description={STATE_DESCRIPTIONS[authState.status] ?? STATE_DESCRIPTIONS.fatal}
            context={authState.status === "authenticated" ? NETWORK_LABELS[networkState.status] : undefined}
            primaryAction={primaryAction} secondaryAction={secondaryAction} actionsDisabled={commandPending} />
        )}
      </section>
    </div>
  );
}
