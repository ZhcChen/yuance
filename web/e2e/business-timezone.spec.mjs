import { expect, test } from '@playwright/test';

for (const timezoneId of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
  test.describe(`business timezone on ${timezoneId} device`, () => {
    test.use({ timezoneId });
    test('real resource timestamps and work item displays use east eight', async ({ page, baseURL }, testInfo) => {
      expect(new URL(baseURL).hostname).toBe('127.0.0.1');
      await page.goto('/web/app');
      await page.locator('input[name="username"]').fill('yuance_admin');
      await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
      await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/web/login')), page.getByRole('button', { name: '登录' }).click()]);
      const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.csrf_token;
      const headers = { 'x-yuance-csrf-token': csrf };
      const start = Date.now();
      const title = `时区验收-${timezoneId}-${start}`;
      const response = await page.request.post('/api/v1/projects/YCE/resources', { headers, data: { title, body: '本机时间验收', body_format: 'plain' } });
      expect(response.status()).toBe(201);
      const resource = (await response.json()).data;
      try {
        expect(resource.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u);
        const savedAt = new Date(`${resource.created_at.replace(' ', 'T')}Z`);
        expect(savedAt.getTime()).toBeGreaterThanOrEqual(start - 1000);
        expect(savedAt.getTime()).toBeLessThanOrEqual(Date.now());
        const expected = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(savedAt);
        await page.goto(`/web/app/projects/YCE/resources?q=${encodeURIComponent(title)}`);
        const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: title, exact: true }) });
        await expect(row.locator('.resource-table-updated small')).toHaveText(expected);
        await expect(row.locator('.resource-table-updated')).toHaveAttribute('title', /（东八区）$/u);
        const read = await page.request.get(`/api/v1/projects/YCE/resources/${resource.id}`);
        expect((await read.json()).data.created_at).toBe(resource.created_at);

        await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', async (route) => {
          const response = await route.fetch();
          const payload = await response.json();
          Object.assign(payload.data.item, { created_at: '2026-10-09 02:30:01', updated_at: '2026-10-09T10:30:01+08:00', due_date: '2026-10-09' });
          payload.data.flow_history.items = [{ source_kind: 'flow', actor: '时区验收', summary: '跨年记录', created_at: '2026-12-31 20:30:01' }];
          await route.fulfill({ response, json: payload });
        });
        await page.route('**/api/v1/work-items/YCE-TASK-2/comments', route => route.fulfill({ json: { data: [{ id: 98701, body: '时区评论', body_format: 'plain', author: '时区验收', author_username: 'yuance_admin', parent_comment_id: null, parent_author: '', created_at: '2026-10-09 02:30:01', updated_at: '2026-10-09T02:31:01Z', is_flow: false, is_draft: false }] } }));
        await page.route('**/api/v1/work-items/YCE-TASK-2/comments/98701/attachments', route => route.fulfill({ json: { data: [{ id: 98702, filename: 'timezone.txt', content_type: 'text/plain', byte_size: 1, status: 'uploaded', created_by: '时区验收', created_at: '2026-10-09T02:30:01Z' }] } }));
        await page.goto('/web/app/work-items/YCE-TASK-2');
        await expect(page.locator('.content-updated')).toHaveText('更新于 2026-10-09 10:30:01');
        await expect(page.locator('.action-panel-context')).toContainText('2026-10-09 10:30:01');
        await expect(page.locator('.action-panel-context').getByText('2026-10-09', { exact: true })).toBeVisible();
        await expect(page.getByText('发表于 2026-10-09 10:30:01', { exact: true })).toBeVisible();
        await expect(page.getByText('编辑于 2026-10-09 10:31:01', { exact: true })).toBeVisible();
        await expect(page.getByRole('list', { name: '评论附件', exact: true })).toContainText('2026-10-09 10:30:01');
        if (timezoneId === 'UTC') await page.screenshot({ path: testInfo.outputPath('business-timezone.png') });
        await page.getByRole('button', { name: '查看操作记录' }).click();
        await expect(page.locator('.work-item-flow-history time')).toHaveText('2027-01-01 04:30:01');
      } finally {
        expect((await page.request.delete(`/api/v1/projects/YCE/resources/${resource.id}`, { headers })).status()).toBe(200);
      }
    });
  });
}
