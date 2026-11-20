import { expect, test } from './support/fixtures.mjs';
import { ensureCurrentProject } from './support/session.mjs';

test.use({ viewport: { width: 1280, height: 720 } });

async function login(page, entryPath) {
  await page.goto(entryPath);
  await expect(page).toHaveURL(/\/web\/login/);
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

test('wide create dialog keeps compact body and footer visible', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await page.goto('/web/app/bugs');

  await page.getByRole('button', { name: '新建 Bug' }).click();
  const dialog = page.getByRole('dialog', { name: '新建 Bug' });
  await expect(dialog).toBeVisible();

  // display:flex 只允许作用于打开的 dialog，避免覆盖 UA 对关闭 dialog 的 display:none。
  const closedDialogsHidden = await page.locator('.yc-modal').evaluateAll((elements) =>
    elements.filter((element) => !element.open).every((element) => getComputedStyle(element).display === 'none'),
  );
  expect(closedDialogsHidden).toBe(true);

  const body = dialog.locator('.yc-modal-body');
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  expect(await body.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');

  const dialogBox = await dialog.boundingBox();
  const createButton = dialog.getByRole('button', { name: '创建' });
  const buttonBox = await createButton.boundingBox();
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);

  // 关闭时先进入退出动画，再真正 close，避免原生 dialog 直接消失。
  // 退出动画只持续约 180ms，轮询在高负载下可能错过；用 MutationObserver 记录是否出现过“动画中且仍打开”的状态。
  await dialog.evaluate((element) => {
    window.__yuanceModalClosingWhileOpen = false;
    const observer = new MutationObserver(() => {
      if (element.classList.contains('yc-modal-closing') && element.open) {
        window.__yuanceModalClosingWhileOpen = true;
        observer.disconnect();
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ['class', 'open'] });
  });
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.__yuanceModalClosingWhileOpen)).toBe(true);
});
