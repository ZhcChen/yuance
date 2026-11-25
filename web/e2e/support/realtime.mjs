// 顶栏实时事件流控制：截住 /api/v1/topbar/events 并挂起，测试在指定时机推送 `topbar: invalidated`，
// 以触发页面按实时通知进行后台刷新（真实的刷新来源）。必须在打开页面之前调用。
export async function holdTopbarEvents(page) {
  const pending = [];
  await page.route('**/api/v1/topbar/events', (route) => new Promise((resolve) => {
    pending.push({ route, resolve });
  }));
  return async () => {
    const latest = pending.pop();
    if (!latest) throw new Error('页面尚未建立顶栏事件连接');
    await latest.route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
      body: 'event: topbar\ndata: invalidated\n\n',
    });
    latest.resolve();
  };
}
