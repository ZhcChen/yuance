'use strict';

function developmentEnvironment(environment, state) {
  const env = { ...environment, YUANCE_VALIDATION_STATE_DIR: state };
  // Compose 的父环境优先于 --env-file，必须移除同名正式凭证及目录覆盖。
  for (const key of ['YUANCE_SESSION_SECRET', 'YUANCE_SECURITY_MASTER_KEY', 'YUANCE_FILE_MASTER_KEY', 'YUANCE_LOCAL_DATA_DIR', 'YUANCE_LOCAL_API_PORT', 'YUANCE_LOCAL_IMAGE']) delete env[key];
  return env;
}

function validationOrigins(env) {
  const keys = ['API', 'WEB', 'DESKTOP_RENDERER'];
  const defaults = [33133, 33134, 33135];
  const ports = keys.map((key, index) => {
    const origin = env[`YUANCE_VALIDATION_${key}_ORIGIN`] || `http://127.0.0.1:${defaults[index]}`;
    const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]*)$/.exec(origin);
    const port = Number(match?.[1]);
    if (!match || port > 65535) throw new Error(`${key} 地址必须为 http://127.0.0.1:<有效端口>。`);
    return port;
  });
  if (new Set(ports).size !== ports.length) throw new Error('API、Web 和 Desktop renderer 端口不得重叠。');
  return ports;
}

if (require.main === module) {
  try { validationOrigins(process.env); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { validationOrigins, developmentEnvironment };
