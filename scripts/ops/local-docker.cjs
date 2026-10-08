#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

function cleanEnvironment(environment) {
  const clean = { ...environment };
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'BUILDX_BUILDER', 'BUILDKIT_HOST']) {
    delete clean[key];
  }
  return clean;
}

function localCommand(args, environment = process.env, inspect = capture) {
  const env = cleanEnvironment(environment);
  const context = environment.YUANCE_LOCAL_DOCKER_CONTEXT || inspect(['context', 'show'], env).trim();
  if (!context || context.startsWith('-')) throw new Error('必须选择本机 Docker context。');
  const metadata = JSON.parse(inspect(['context', 'inspect', context], env));
  const endpoint = metadata[0]?.Endpoints?.docker?.Host;
  if (!endpoint?.startsWith('unix:///')) {
    throw new Error(`本地开发拒绝非本机 Docker 端点；请设置 YUANCE_LOCAL_DOCKER_CONTEXT 为本机 context（当前：${context}）。`);
  }
  if (args.some((arg) => /^(--context|--host|--builder|--config)(=|$)|^-[Hc]/.test(arg))) {
    throw new Error('本地 Docker 入口禁止覆盖 context、host、config 或 builder。');
  }
  if (args[0] === 'context') throw new Error('本地开发入口禁止修改全局 Docker context。');
  if (['build', 'builder'].includes(args[0]) || (args[0] === 'compose' && args.some((arg) => ['build', '--build'].includes(arg)))) {
    throw new Error('本地镜像构建必须使用经过 builder 校验的 buildx build。');
  }
  const prefix = ['--context', context];
  if (args[0] === 'buildx') {
    if (!['build', 'version', 'inspect', 'du'].includes(args[1])) throw new Error('本地开发入口只允许 buildx build/version/inspect/du，不修改全局 builder。');
    if (args[1] === 'inspect' && args.slice(2).some((arg) => !arg.startsWith('-'))) throw new Error('本地 buildx inspect 不接受替代 builder 名称。');
    // 使用 context 自带的 docker driver，不沿用全局选中的远程 builder。
    const description = inspect([...prefix, 'buildx', '--builder', context, 'inspect'], env);
    const driver = description.match(/^Driver:\s*(\S+)/m)?.[1];
    const endpoints = [...description.matchAll(/^Endpoint:\s*(\S+)/gm)].map((match) => match[1]);
    if (driver !== 'docker' || endpoints.length !== 1 || ![context, endpoint].includes(endpoints[0])) {
      throw new Error(`本地开发拒绝非本机或多节点 builder：${context}。`);
    }
    return { context, env, args: [...prefix, 'buildx', '--builder', context, ...args.slice(1)] };
  }
  return { context, env, args: [...prefix, ...args] };
}

function capture(args, env) {
  const result = spawnSync('docker', args, { env, encoding: 'utf8', timeout: 20000 });
  if (result.error || result.status !== 0) {
    // 不输出 Docker 错误中的证书路径、带凭证 URL 等环境细节。
    throw new Error('Docker 检查失败，请确认本机引擎已启动、context 和 Buildx 可用。');
  }
  return result.stdout;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) throw new Error('用法：node scripts/ops/local-docker.cjs <docker 参数>');
    const command = localCommand(args);
    const result = spawnSync('docker', command.args, { env: command.env, stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(`[local-docker] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { cleanEnvironment, localCommand };
