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
    currentUsername: 'admin',
  }));

  assert.match(html, /aria-label="时间粒度"/);
  assert.match(html, />日<\/button>/);
  assert.match(html, />周<\/button>/);
  assert.match(html, />月<\/button>/);
  assert.match(html, /class="active" aria-pressed="true">周</);
  assert.match(html, /时间跨度/);
  assert.match(html, /value="4"/);
  assert.doesNotMatch(html, /每天投入/);
  assert.match(html, /搜索项目/);
  assert.match(html, /搜索成员/);
  assert.match(html, />查看全部人<\/button>/);
  assert.match(html, />查看自己<\/button>/);
  assert.match(html, /class="active" aria-pressed="true">查看全部人/);
  assert.doesNotMatch(html, /aria-label="排期编辑操作"/);
  assert.doesNotMatch(html, />回退<\/button>/);
  assert.doesNotMatch(html, />前进<\/button>/);
  assert.doesNotMatch(html, />记录<\/button>/);
  assert.doesNotMatch(html, /class="time-gantt-row-label">管理员<\/div>/);
  assert.match(html, /暂无排期，请先通过上方表单添加排期。/);
  assert.match(html, />管理员<\/option>/);
  assert.doesNotMatch(html, /class="time-gantt-today"/);
  assert.match(html, /class="time-gantt time-gantt-fill"/);
});

test('time allocation gantt renders rows only for members with allocations', () => {
  const html = renderToStaticMarkup(React.createElement(TimeAllocationGantt, {
    allocations: [{
      id: 1,
      project_key: 'YCE',
      project_name: '元策',
      username: 'scheduled',
      display_name: '有排期',
      start_date: '2026-08-01',
      end_date: '2026-08-10',
      daily_hours: 8,
      note: '',
    }],
    projects: [{ key: 'YCE', name: '元策' }],
    members: [
      { username: 'scheduled', display_name: '有排期' },
      { username: 'idle', display_name: '无排期' },
    ],
    currentUsername: 'scheduled',
  }));

  assert.match(html, /class="time-gantt-row-label">有排期<\/div>/);
  assert.doesNotMatch(html, /class="time-gantt-row-label">无排期<\/div>/);
  assert.match(html, />有排期<\/option>/);
  assert.match(html, />无排期<\/option>/);
});

test('time allocation gantt shows undo/redo/save controls and save confirmation when onSave is provided', () => {
  const html = renderToStaticMarkup(React.createElement(TimeAllocationGantt, {
    allocations: [],
    projects: [{ key: 'YCE', name: '元策' }],
    members: [{ username: 'admin', display_name: '管理员' }],
    currentUsername: 'admin',
    onSave: async () => {},
    onOpenRecords: () => {},
  }));

  assert.match(html, /aria-label="排期编辑操作"/);
  assert.match(html, />回退<\/button>/);
  assert.match(html, />前进<\/button>/);
  assert.match(html, />保存<\/button>/);
  assert.match(html, />记录<\/button>/);
  assert.match(html, /确认保存排期/);
  assert.match(html, /新增 0 条/);
  assert.match(html, /更新 0 条/);
  assert.match(html, /删除 0 条/);
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
