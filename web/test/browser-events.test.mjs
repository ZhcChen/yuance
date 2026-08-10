import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserEvents } from '../src/platform/browser/events.js';

test('browser events maps EventSource signals and closes the subscription', () => {
  const sources = [];
  class FakeEventSource {
    listeners = new Map();
    closed = false;
    onerror = null;
    constructor(url, options) {
      this.url = url;
      this.options = options;
      sources.push(this);
    }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    close() { this.closed = true; }
  }
  const values = [];
  const events = createBrowserEvents({ EventSourceImpl: FakeEventSource });
  const close = events.openTopbarEvents({
    onEvent: (event) => values.push(event),
  });

  assert.equal(sources[0].url, '/api/v1/topbar/events');
  assert.deepEqual(sources[0].options, { withCredentials: true });
  sources[0].listeners.get('topbar')({ data: 'connected' });
  sources[0].listeners.get('topbar')({ data: 'refresh' });
  sources[0].listeners.get('release-version')({ data: 'v1.2.3' });
  assert.deepEqual(values, [
    { type: 'stream-connected', connectionId: 'topbar', sequence: 1 },
    { type: 'topbar-invalidated', connectionId: 'topbar', sequence: 2 },
    { type: 'release-version', connectionId: 'topbar', sequence: 3, version: 'v1.2.3' },
  ]);
  close();
  assert.equal(sources[0].closed, true);
});
