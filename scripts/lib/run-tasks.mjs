// 并行执行一组相互独立的检查任务（类型检查、lint、单元测试等）。
// - 每个任务直接启动对应可执行文件，不经过 `npm run` 与 shell，避免进程启动开销与 glob 展开差异。
// - 输出按任务缓冲，完成后整段打印，避免并行输出交错；任一任务失败则整体以非零退出。
// - 并发度默认取 CPU 可用并行度，可用 YUANCE_CHECK_CONCURRENCY 覆盖（设为 1 即串行，便于排查）。
import { spawn } from 'node:child_process';
import os from 'node:os';

/**
 * @typedef {{ name: string, command: string, args: string[], cwd: string, env?: Record<string, string> }} CheckTask
 */

/** @param {CheckTask} task @returns {Promise<{ task: CheckTask, code: number, output: string, ms: number }>} */
function runTask(task) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(task.command, task.args, {
      cwd: task.cwd,
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1', ...task.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => {
      chunks.push(Buffer.from(`\n无法启动任务：${error.message}\n`));
    });
    child.on('close', (code, signal) => {
      resolve({
        task,
        code: code ?? (signal ? 1 : 0),
        output: Buffer.concat(chunks).toString('utf8'),
        ms: performance.now() - startedAt,
      });
    });
  });
}

/**
 * @param {CheckTask[]} tasks
 * @param {{ title?: string, concurrency?: number }} [options]
 */
export async function runTasks(tasks, options = {}) {
  const configured = Number.parseInt(process.env.YUANCE_CHECK_CONCURRENCY || '', 10);
  const concurrency = Math.max(1, options.concurrency ?? (Number.isSafeInteger(configured) && configured > 0 ? configured : os.availableParallelism()));
  const startedAt = performance.now();
  const results = [];
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++];
      const result = await runTask(task);
      results.push(result);
      const status = result.code === 0 ? 'ok  ' : 'FAIL';
      process.stdout.write(`[${status}] ${task.name} (${(result.ms / 1000).toFixed(1)}s)\n`);
      if (result.code !== 0 || process.env.YUANCE_CHECK_VERBOSE === '1') {
        process.stdout.write(result.output.endsWith('\n') || !result.output ? result.output : `${result.output}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  const failed = results.filter((result) => result.code !== 0);
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  const title = options.title ? `${options.title}：` : '';
  if (failed.length) {
    process.stdout.write(`\n${title}${failed.length}/${tasks.length} 项失败（${seconds}s）：${failed.map((result) => result.task.name).join('、')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`\n${title}${tasks.length} 项全部通过（${seconds}s）\n`);
  }
  return failed.length === 0;
}
