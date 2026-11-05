# UI v3 回迁 P1 令牌归一 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段二 P1）
- 任务：`specs/ui-v3-react/tasks.md`（T004 / T005 / T006 / T007）
- 复核日期：2026-11-05

## 结论

**通过。** 令牌的唯一来源已收敛到 `frontend/packages/ui/src/tokens.css`，
生产组件与 `ui-v3/` 原型共用同一份取值，原型渲染结果逐像素不变。

## 为什么要做这一步

回迁之前有两套令牌：

| | 数量 | 命名 | 取值来源 |
|---|---|---|---|
| 生产 `frontend/packages/ui/src/styles.css` | 38 浅色 + 27 深色 | `--yc-*` | 现网灰蓝企业风 |
| 原型 `ui-v3/styles/tokens.css` | 137 浅色 | 短名（`--brand`、`--surface`…） | 设计稿定稿的靛蓝 |

两套并存意味着：设计稿改一个色，生产要手动跟一次；生产改一个色，设计稿不会知道。
P1 把它们合成一份，后续 P2 组件换皮才有稳定的基准。

## 实施方案

### 规范名与兼容别名

规范名统一为 `--yc-*`。生产既有的短名（`--yc-panel`、`--yc-text`、`--yc-muted`、`--yc-radius`…）
保留为 `var()` 别名，指向对应规范名：

```css
--yc-panel: var(--yc-surface);
--yc-text: var(--yc-text-primary);
--yc-muted: var(--yc-text-tertiary);
```

**生产组件的 `var(--yc-*)` 引用一行都不用改。** 别名用 `var()` 引用，
因此深色主题重定义规范名时，别名自动跟随，不需要在深色块里重复写一遍。

### 原型侧退化为别名层

`ui-v3/styles/tokens.css` 不再定义任何颜色，只做短名 → 规范名的映射（137 条）。
原型样式里的 700 多处 `var(--brand)` 之类引用保持原样，避免大规模改名带来的回归面；
同时避免两套命名各走各的。取值要改时只改生产那一份。

### 服务根调整

原型要引用 `frontend/packages/ui/src/tokens.css`，静态服务必须以**仓库根**为根目录：

```bash
python3 -m http.server 4183 --directory .   # 访问 http://127.0.0.1:4183/ui-v3/
```

已同步 `ui-v3/README.md`、`ui-v3/index.html` 的占位提示与 `ui-v3/DESIGN-NOTES.md` 第七节。

### 深色主题

设计稿的暗色规格在 P5 产出，本阶段只保证深色主题不退化：
深色取值由生产原有深色主题推导（表面、文字、分隔线、品牌、状态色逐项映射），
并为生产原先没有的语义补了暗色值（如 `--yc-surface-3`、`--yc-danger-soft`、`--yc-info-*`）。
阴影在深色下改用黑色叠层而不是深靛色，避免深色界面出现发灰的投影。

### 一处刻意保留

`--yc-topbar-height` 暂留 `58px` 原值。它属于 P3 壳层改造范围，
届时要与 parity 合同里的 `tokens.topbarHeight` 和对应测试常量一起改，
不在 P1 提前动，避免合同与实现短暂不一致。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 原型渲染不变 | 迁移前后逐像素比对工作台 / 项目列表 / 需求列表 | 差异像素占比均为 **0.0000%**，运行时错误 0 |
| 令牌解析正确 | 浏览器读取原型计算样式 | `--bg=#f2f3f9`、`--surface=#ffffff`、`--brand=#4a52c8`、`--text-primary=#171a2b`、`--line=#e9ebf3` 等全部与迁移前一致 |
| 前端全量检查 | `npm --prefix frontend run check` | 通过（97 + 54 项测试 0 失败） |
| Web 全量检查 | `npm --prefix web run check` | 通过（68 项测试 0 失败） |
| 生产构建 | `make web-build` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 9/9 通过（像素基线按新令牌重新生成） |

## 顺带修正的既有断言

令牌从 `styles.css` 搬到 `tokens.css` 后，两处断言「令牌写在 styles.css 里」的既有用例失效：

- `frontend/packages/ui/test/index.test.mjs`：令牌断言改读 `tokens.css`，
  并新增「`styles.css` 通过 `@import` 引入令牌」与「`styles.css` 内不再有 `--yc-*` 定义」两条断言，
  把「令牌只能有一处来源」变成可执行的约束。
- `frontend/packages/app-shell/test/stable-navigation-shell.test.mjs`：
  `--yc-scrollbar-thumb-alpha` 与 `--yc-topbar-height` 的断言改读 `tokens.css`。

## 生产侧的实际变化

P1 之后生产界面换上了设计稿的浅色调色板：靛蓝主色、极淡靛调页面底色、
靛蓝浅底指标磁贴、新阴影刻度。组件结构、DOM 与交互未动，
组件皮肤与布局在 P2、P3 处理。

像素基线因此整体更新过一次——这是预期内的令牌变更，不是回归。

## 已知环境问题

1. **桌面端 renderer 无法在本机构建**：`desktop/node_modules` 为空，
   `vite`、`typescript` 均未安装，`npm --prefix desktop run build:renderer` 与
   `make frontend-check` 的 desktop 段都无法执行。
   与本阶段无关（未触及 desktop 源码），需补齐依赖后单独复核。
   桌面端与 Web 端共用 `@yuance/frontend-ui/styles.css`，
   CSS 的 `@import` 由打包器按文件相对路径解析，Web 端已验证通过，桌面端按同一机制处理。
2. **深色主题未按设计稿重做**：本阶段的暗色值是推导值，不是设计稿定稿值，P5 处理。
