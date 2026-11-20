// e2e 全局收尾：删除本次运行的模板库与各用例数据目录（按运行 ID 隔离，不影响并行的其他运行）。
import { rmSync } from 'node:fs';

import { artifactsRoot } from './environment.mjs';

export default async function globalTeardown() {
  rmSync(artifactsRoot, { recursive: true, force: true });
}
