import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const root = process.cwd();
const image = process.env.YUANCE_MEASURE_IMAGE || 'yuance-api:optimization-measure';
const platform = process.env.YUANCE_API_PLATFORM || 'linux/amd64';

function run(command, args) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  return {
    passed: result.status === 0,
    seconds: Number(((performance.now() - started) / 1000).toFixed(3)),
  };
}

const frontend = run('npm', ['run', 'check:frontend']);
const buildArgs = [
  'buildx',
  'build',
  '--progress=plain',
  '--platform',
  platform,
  '--tag',
  image,
  '--file',
  'api/Dockerfile',
  '--build-arg',
  'YUANCE_BUILD_RELEASE_VERSION=measure',
  '--build-arg',
  'YUANCE_SKIP_FRONTEND_CHECK=1',
  '--load',
];

if (process.env.YUANCE_MEASURE_NO_CACHE === '1') buildArgs.push('--no-cache');

buildArgs.push('.');
const apiImage = run('docker', buildArgs);

console.log(
  JSON.stringify({
    frontend_check_passed: frontend.passed ? 1 : 0,
    image_build_passed: apiImage.passed ? 1 : 0,
    frontend_check_seconds: frontend.seconds,
    image_build_seconds: apiImage.seconds,
    pipeline_seconds: Number((frontend.seconds + apiImage.seconds).toFixed(3)),
  }),
);
