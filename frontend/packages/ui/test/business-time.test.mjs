import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { formatBusinessTimestamp } from '../src/formatters.js';

test('business timestamps preserve instants and use east eight regardless of host timezone', () => {
  const moduleUrl = new URL('../src/formatters.js', import.meta.url).href;
  const inputs = ['2026-10-09 02:30:01', '2026-10-09T02:30:01', '2026-10-09T02:30:01Z', '2026-10-09T10:30:01+08:00', '2026-10-08T19:30:01-07:00'];
  for (const TZ of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
    const script = `import { formatBusinessTimestamp as format } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(${JSON.stringify(inputs)}.map(value => format(value))));`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), inputs.map(() => '2026-10-09 10:30:01'), TZ);
  }
});

test('business timestamps handle midnight, year rollover, fractions and compact display', () => {
  assert.equal(formatBusinessTimestamp('2026-12-31 20:30:01.123456'), '2027-01-01 04:30:01');
  assert.equal(formatBusinessTimestamp('2026-10-08T16:00:00Z'), '2026-10-09 00:00:00');
  assert.equal(formatBusinessTimestamp('2026-10-09T10:30:01+0800', { compact: true }), '10/09 10:30');
  assert.equal(formatBusinessTimestamp('2026-10-09 02:30:01', { seconds: false }), '2026-10-09 10:30');
});

test('business timestamps leave dates and invalid values alone without throwing', () => {
  for (const value of ['2026-10-09', 'invalid', '2026-02-30 00:00:00', '2026-10-09T24:00:00Z', '2026-10-09T02:30:00+99:99']) {
    assert.equal(formatBusinessTimestamp(value), value);
  }
  for (const value of ['', null, undefined]) assert.equal(formatBusinessTimestamp(value), '');
});
