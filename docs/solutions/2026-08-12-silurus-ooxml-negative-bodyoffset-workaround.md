# Solution：@silurus/ooxml 悬挂编号导致 bodyOffsetPt 负数崩溃

## 现象

资料库部分 docx 预览报错：

```text
numbering.bodyOffsetPt must be finite and non-negative
Paragraph source boundaries must align with retained lines
```

## 根因

用 `平安银行银企直连接口（通用）.docx` 复测后确认第一个报错由布局阶段触发：

- 文档中编号段落使用悬挂缩进，`w:ind` 的 `firstLine` 为负（例如 -36 twips）。
- `@silurus/ooxml` 计算编号 marker geometry 时：
  `bodyOffsetPt = authoredFirstIndentPt + markerShiftPt + markerWidthPt`。
- 对合法悬挂缩进，该值可以是负数，而引擎用
  `Number.isFinite(value) && value >= 0` 做布局断言，于是直接抛错。

0.73.2 与 0.78.0 都保留该断言，升级无法单独解决。

## 处理

在 vendored 0.78.0 的 `kc()` 返回值前将非有限或负数 `bodyOffsetPt` 钳制为 0：

- `api/static/vendor/ooxml/document-pull-client-xsdVDuVD.js`
- `api/static/vendor/ooxml/render-worker-host-CBjWHxMb.js`

验证：`平安银行银企直连接口（通用）.docx` 和
`平安银行银企直连_单位移动支付_接口（通用）-20251027.docx`
均可完成全部 40 页渲染，不再报 `numbering.bodyOffsetPt` 错误。

## 后续

- 第二个报错 `Paragraph source boundaries must align with retained lines` 尚未在本机
  文件中复现；拿到触发文件后可继续用同一 harness 复核。
- 若后续切换 `docx-editor` 或升级上游，先验证该补丁是否被替代。
