import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TimeAllocationGantt } from '@yuance/frontend-ui';

test('time allocation gantt renders day/week/month scale switch with week default', () => {
  const html = renderToStaticMarkup(React.createElement(TimeAllocationGantt, {
    allocations: [],
    projects: [{ key: 'YCE', name: '元策' }],
    members: [{ username: 'admin', display_name: '管理员' }],
  }));

  assert.match(html, /aria-label="时间粒度"/);
  assert.match(html, />日<\/button>/);
  assert.match(html, />周<\/button>/);
  assert.match(html, />月<\/button>/);
  assert.match(html, /class="active" aria-pressed="true">周</);
  assert.match(html, /时间跨度/);
  assert.match(html, /value="4"/);
  assert.match(html, /class="time-gantt-row-label">管理员<\/div>/);
  assert.match(html, /class="time-gantt-today"/);
  assert.match(html, /class="time-gantt time-gantt-fill"/);
});

test('time allocation gantt collapses project legend by default when many projects exist', () => {
  const projects = Array.from({ length: 8 }, (_, index) => ({
    key: `P-${index + 1}`,
    name: `项目 ${index + 1}`,
  }));
  const html = renderToStaticMarkup(React.createElement(TimeAllocationGantt, {
    allocations: [],
    projects,
    members: [{ username: 'admin', display_name: '管理员' }],
  }));

  assert.equal((html.match(/class="time-management-legend-item"/g) || []).length, 6);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /\+2 个项目/);
});
