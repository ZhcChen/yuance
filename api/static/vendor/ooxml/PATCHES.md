# @silurus/ooxml 本地补丁

## 2026-08-12：兼容悬挂编号负数 bodyOffsetPt

- 版本：0.78.0（`VERSION` 保持 0.78.0）
- 文件：
  - `document-pull-client-xsdVDuVD.js`
  - `render-worker-host-CBjWHxMb.js`
- 原因：Word/WPS 文档使用悬挂缩进（`w:ind` 的 `firstLine` 为负）配合编号时，编号
  `bodyOffsetPt` 会被算出负数；0.73.2/0.78.0 的布局断言要求有限且非负，导致
  `numbering.bodyOffsetPt must be finite and non-negative` 直接失败。
- 改动：在 `kc()` 生成编号 marker geometry 返回前，将非有限或负数 `bodyOffsetPt`
  钳制为 0，保证预览可以继续渲染。
- 注意：升级上游 `@silurus/ooxml` 后需重新评估该补丁是否仍需要。
