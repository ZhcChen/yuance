# yuance-agent Release Fixture

安装器测试在临时目录动态生成 Release fixture，避免向 Git 提交编译产物。fixture 必须与正式 Release 使用相同结构：

```text
SHA256SUMS
yuance-agent-v<version>-<target>.tar.gz  # macOS/Linux
yuance-agent-v<version>-<target>.zip     # Windows
└── yuance-agent/
    ├── SKILL.md
    ├── agents/openai.yaml
    ├── references/*.md
    └── scripts/yuance-agent[.exe]
```

本地 fixture 通道只替代下载来源，安装器仍必须执行 SHA-256、包结构和离线自检校验。
