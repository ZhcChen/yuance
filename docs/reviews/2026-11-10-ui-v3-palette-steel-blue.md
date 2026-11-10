# UI v3 色系调整复核：去紫、钢蓝石墨

## 背景
用户反馈靛紫主色与紫色渐变「AI 味太重」，要求保留高科技感，同时严谨稳重。

## 改动
- `frontend/packages/ui/src/tokens.css`：亮/暗两组令牌，主色改钢蓝 `#1d5fa8`，渐变改蓝到青，侧栏改石墨海军蓝，底色/线/文字去紫调，语义紫降饱和为蓝灰，阴影、焦点环、链接同步。
- `ui-v3/styles/{layout,components}.css`：两处硬编码紫色阴影改钢蓝；顶栏背景改用 surface 令牌，修复暗色下顶栏发白。
- `ui-v3/DESIGN-NOTES.md`：新增第十节记录。
- 重新生成 4 页 × 4 视口像素基线。

## 验证
- `npm --prefix frontend run check`、`npm --prefix web run check` 通过。
- 视觉护栏像素层 9/9 通过（基线更新后复跑）。
- 浏览器截图核对原型亮/暗工作台；颜色字面量残留仅取色器 conic-gradient（无关）。

## 未验证
- 生产实现暗色逐页截图未全量走查；桌面端未重新验证。
