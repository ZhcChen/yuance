import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TimeAllocationGantt } from '@yuance/frontend-ui';

test('time allocation gantt renders day/week/month scale switch with month default', () => {
  const html = renderToStaticMarkup(React.createElement(TimeAllocationGantt, {
    allocations: [],
    projects: [{ key: 'YCE', name: '元策' }],
    members: [{ username: 'admin', display_name: '管理员' }],
  }));

  assert.match(html, /aria-label="时间粒度"/);
  assert.match(html, />日<\/button>/);
  assert.match(html, />周<\/button>/);
  assert.match(html, />月<\/button>/);
  assert.match(html, /class="active" aria-pressed="true">月</);
  assert.match(html, /class="time-gantt-row-label">管理员<\/div>/);
  assert.match(html, /class="time-gantt-today"/);
});
