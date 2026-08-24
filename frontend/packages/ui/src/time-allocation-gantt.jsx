// @ts-check
/* global document, Element, ResizeObserver */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Select } from './primitives.jsx';

const PIXELS_PER_DAY_BY_SCALE = {
  day: 24,
  week: 6,
  month: 3.4,
};
const DEFAULT_TIME_SCALE = 'week';
const DAY_MS = 86400000;
const DEFAULT_SPAN_MONTHS = 4;
const DEFAULT_DAILY_HOURS = 8;
const TIME_GANTT_LABEL_WIDTH = 170;
const TIME_GANTT_BORDER_WIDTH = 2;
const LEGEND_COLLAPSED_LIMIT = 6;
const DEFAULT_PROJECT_COLORS = [
  '#1f5fbf',
  '#2d8a68',
  '#b3772e',
  '#8a4bb8',
  '#b0474f',
  '#3c6e71',
  '#5b7c99',
  '#9a6b3f',
];

/**
 * @typedef TimeAllocation
 * @property {number} id
 * @property {string} project_key
 * @property {string} project_name
 * @property {string} username
 * @property {string} display_name
 * @property {string} start_date
 * @property {string} end_date
 * @property {number} daily_hours
 * @property {string} note
 */

/**
 * @param {{
 *   allocations: TimeAllocation[],
 *   projects: Array<{ key: string, name: string }>,
 *   members: Array<{ username: string, display_name: string }>,
 *   currentUsername?: string,
 *   viewStart?: string,
 *   viewEnd?: string,
   readOnly?: boolean,
 *   projectColors?: Record<string, string>,
 *   onCreate?: (payload: { username: string, projectKey: string, startDate: string, endDate: string, dailyHours: number, note?: string }) => Promise<unknown> | unknown,
 *   onUpdate?: (id: number, payload: { username: string, projectKey: string, startDate: string, endDate: string, dailyHours: number, note?: string }) => Promise<unknown> | unknown,
 *   onDelete?: (id: number) => Promise<unknown> | unknown,
 * }} props
 */
export function TimeAllocationGantt({
  allocations = [],
  projects = [],
  members = [],
  currentUsername = '',
  viewStart,
  viewEnd,
  readOnly = false,
  projectColors = {},
  onCreate,
  onUpdate,
  onDelete,
}) {
  const today = startOfToday();
  const computedViewStart = viewStart || dateFromMs(today - 30 * DAY_MS);
  const [spanInput, setSpanInput] = useState(String(DEFAULT_SPAN_MONTHS));
  const spanMonths = normalizeSpanMonths(spanInput);
  const computedViewEnd = viewEnd || dateFromMs(addUtcMonths(today, spanMonths - 1));
  const viewEndIndex = dayIndex(computedViewEnd, computedViewStart);
  const totalDays = viewEndIndex + 1;

  const [viewScale, setViewScale] = useState(/** @type {'day' | 'week' | 'month'} */ (DEFAULT_TIME_SCALE));
  const [viewScope, setViewScope] = useState(/** @type {'all' | 'self'} */ ('all'));
  const [items, setItems] = useState(() => allocations.map(normalizeAllocation));
  const [selectedProjectKey, setSelectedProjectKey] = useState(projects[0]?.key || '');
  const [selectedMemberUsername, setSelectedMemberUsername] = useState(members[0]?.username || '');
  const [manualStart, setManualStart] = useState(dateFromMs(today));
  const [manualEnd, setManualEnd] = useState(dateFromMs(today + 29 * DAY_MS));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stretchTrackWidth, setStretchTrackWidth] = useState(0);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const ganttRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const selectionRef = useRef(/** @type {{ track: HTMLElement, username: string, startDay: number, element: HTMLElement } | null} */ (null));
  const blockDragRef = useRef(/** @type {{ block: HTMLElement, id: number, mode: 'move' | 'resize-l' | 'resize-r', startX: number, startIndex: number, endIndex: number, nextStart: number, nextEnd: number } | null} */ (null));
  const pxPerDay = viewScale === 'day'
    ? PIXELS_PER_DAY_BY_SCALE.day
    : (stretchTrackWidth > 0 ? stretchTrackWidth / totalDays : PIXELS_PER_DAY_BY_SCALE[viewScale]);
  const totalWidth = totalDays * pxPerDay;

  useLayoutEffect(() => {
    const node = ganttRef.current;
    if (!node || viewScale === 'day') {
      setStretchTrackWidth(0);
      return undefined;
    }
    const measure = () => {
      setStretchTrackWidth(Math.max(0, node.clientWidth - TIME_GANTT_LABEL_WIDTH - TIME_GANTT_BORDER_WIDTH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewScale]);

  useEffect(() => {
    setItems(allocations.map(normalizeAllocation));
  }, [allocations]);

  useEffect(() => {
    if (projects.length && !projects.some((project) => project.key === selectedProjectKey)) {
      setSelectedProjectKey(projects[0].key);
    }
  }, [projects, selectedProjectKey]);

  useEffect(() => {
    if (members.length && !members.some((member) => member.username === selectedMemberUsername)) {
      setSelectedMemberUsername(members[0].username);
    }
  }, [members, selectedMemberUsername]);

  const visibleMembers = useMemo(() => {
    const seen = new Map();
    for (const member of members) {
      if (!seen.has(member.username)) seen.set(member.username, member);
    }
    for (const allocation of items) {
      if (!seen.has(allocation.username)) {
        seen.set(allocation.username, {
          username: allocation.username,
          display_name: allocation.display_name || allocation.username,
        });
      }
    }
    const allMembers = [...seen.values()];
    if (viewScope === 'all' || !currentUsername) return allMembers;
    return allMembers.filter((member) => member.username === currentUsername);
  }, [members, items, viewScope, currentUsername]);

  useEffect(() => {
    if (viewScope === 'self' && visibleMembers.length && !visibleMembers.some((member) => member.username === selectedMemberUsername)) {
      setSelectedMemberUsername(visibleMembers[0].username);
    }
  }, [viewScope, visibleMembers, selectedMemberUsername]);

  const conflictKeys = useMemo(() => {
    const keys = new Set();
    for (let index = 0; index < items.length; index += 1) {
      const current = items[index];
      for (let other = index + 1; other < items.length; other += 1) {
        const candidate = items[other];
        if (
          current.username === candidate.username
          && current.start_date <= candidate.end_date
          && candidate.start_date <= current.end_date
        ) {
          keys.add(String(current.id));
          keys.add(String(candidate.id));
        }
      }
    }
    return keys;
  }, [items]);

  function projectName(projectKey) {
    return projects.find((project) => project.key === projectKey)?.name || projectKey;
  }

  function projectColor(projectKey) {
    if (projectColors[projectKey]) return projectColors[projectKey];
    const index = Math.max(0, projects.findIndex((project) => project.key === projectKey));
    return DEFAULT_PROJECT_COLORS[index % DEFAULT_PROJECT_COLORS.length];
  }

  function memberName(username) {
    return visibleMembers.find((member) => member.username === username)?.display_name || username;
  }

  function beginSelection(event, track) {
    if (readOnly) return;
    event.preventDefault();
    const rect = track.getBoundingClientRect();
    const startDay = Math.floor((event.clientX - rect.left) / pxPerDay);
    const element = document.createElement('div');
    element.className = 'time-gantt-selection';
    element.style.left = `${startDay * pxPerDay}px`;
    track.appendChild(element);
    selectionRef.current = {
      track,
      username: String(track.dataset.username || ''),
      startDay,
      element,
    };
    track.setPointerCapture(event.pointerId);
  }

  function updateSelection(event) {
    const selection = selectionRef.current;
    if (!selection) return;
    const rect = selection.track.getBoundingClientRect();
    const currentDay = Math.floor((event.clientX - rect.left) / pxPerDay);
    const from = Math.min(selection.startDay, currentDay);
    const to = Math.max(selection.startDay, currentDay);
    selection.element.style.left = `${from * pxPerDay}px`;
    selection.element.style.width = `${(to - from + 1) * pxPerDay}px`;
  }

  function commitSelection(event) {
    const selection = selectionRef.current;
    if (!selection) return;
    selection.element.remove();
    selectionRef.current = null;
    const rect = selection.track.getBoundingClientRect();
    const currentDay = Math.floor((event.clientX - rect.left) / pxPerDay);
    const from = Math.min(selection.startDay, currentDay);
    const to = Math.max(selection.startDay, currentDay);
    if (from < 0 || to >= totalDays || to < from || !selectedProjectKey || !selection.username) return;
    const item = {
      id: -Date.now(),
      project_key: selectedProjectKey,
      project_name: projectName(selectedProjectKey),
      username: selection.username,
      display_name: memberName(selection.username),
      start_date: dateFromDay(from, computedViewStart),
      end_date: dateFromDay(to, computedViewStart),
      daily_hours: DEFAULT_DAILY_HOURS,
      note: '',
    };
    setItems((current) => [...current, item]);
    void persistCreate(item);
  }

  function beginBlockDrag(event, block, mode) {
    if (readOnly) return;
    event.preventDefault();
    const id = Number(block.dataset.id || 0);
    const allocation = items.find((item) => item.id === id);
    if (!allocation) return;
    const startIndex = dayIndex(allocation.start_date, computedViewStart);
    const endIndex = dayIndex(allocation.end_date, computedViewStart);
    blockDragRef.current = {
      block,
      id,
      mode,
      startX: event.clientX,
      startIndex,
      endIndex,
      nextStart: startIndex,
      nextEnd: endIndex,
    };
    block.setPointerCapture(event.pointerId);
  }

  function updateBlockDrag(event) {
    const drag = blockDragRef.current;
    if (!drag) return;
    const deltaDays = Math.round((event.clientX - drag.startX) / pxPerDay);
    let nextStart = drag.startIndex;
    let nextEnd = drag.endIndex;
    if (drag.mode === 'move') {
      const length = drag.endIndex - drag.startIndex;
      nextStart = Math.max(0, Math.min(drag.startIndex + deltaDays, totalDays - length - 1));
      nextEnd = nextStart + length;
    } else if (drag.mode === 'resize-l') {
      nextStart = Math.max(0, Math.min(drag.startIndex + deltaDays, drag.endIndex - 1));
    } else {
      nextEnd = Math.min(totalDays - 1, Math.max(drag.endIndex + deltaDays, drag.startIndex + 1));
    }
    drag.nextStart = nextStart;
    drag.nextEnd = nextEnd;
    drag.block.style.left = `${nextStart * pxPerDay}px`;
    drag.block.style.width = `${(nextEnd - nextStart + 1) * pxPerDay}px`;
  }

  function commitBlockDrag() {
    const drag = blockDragRef.current;
    if (!drag) return;
    blockDragRef.current = null;
    const allocation = items.find((item) => item.id === drag.id);
    if (!allocation) return;
    const startDate = dateFromDay(drag.nextStart, computedViewStart);
    const endDate = dateFromDay(drag.nextEnd, computedViewStart);
    if (allocation.start_date === startDate && allocation.end_date === endDate) return;
    const next = { ...allocation, start_date: startDate, end_date: endDate };
    setItems((current) => current.map((item) => item.id === drag.id ? next : item));
    void persistUpdate(next);
  }

  function handleGanttPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const block = /** @type {HTMLElement | null} */ (target.closest('.time-gantt-allocation'));
    const handle = target.closest('.time-gantt-resize-l, .time-gantt-resize-r');
    if (block) {
      const mode = handle
        ? (handle.classList.contains('time-gantt-resize-l') ? 'resize-l' : 'resize-r')
        : 'move';
      beginBlockDrag(event, block, mode);
      return;
    }
    const track = target.closest('.time-gantt-track');
    if (track) beginSelection(event, track);
  }

  function handleGanttPointerMove(event) {
    updateSelection(event);
    updateBlockDrag(event);
  }

  function handleGanttPointerUp(event) {
    commitSelection(event);
    commitBlockDrag();
  }

  function handleGanttDoubleClick(event) {
    if (readOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const block = /** @type {HTMLElement | null} */ (target.closest('.time-gantt-allocation'));
    if (!block) return;
    const id = Number(block.dataset.id || 0);
    setItems((current) => current.filter((item) => item.id !== id));
    void persistDelete(id);
  }

  async function persistCreate(item) {
    if (!onCreate) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({
        username: item.username,
        projectKey: item.project_key,
        startDate: item.start_date,
        endDate: item.end_date,
        dailyHours: item.daily_hours,
        note: item.note,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建排期失败。');
    } finally {
      setBusy(false);
    }
  }

  async function persistUpdate(allocation) {
    if (!onUpdate) return;
    setBusy(true);
    setError('');
    try {
      await onUpdate(allocation.id, {
        username: allocation.username,
        projectKey: allocation.project_key,
        startDate: allocation.start_date,
        endDate: allocation.end_date,
        dailyHours: allocation.daily_hours,
        note: allocation.note,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '更新排期失败。');
    } finally {
      setBusy(false);
    }
  }

  async function persistDelete(id) {
    if (!onDelete) return;
    setBusy(true);
    setError('');
    try {
      await onDelete(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除排期失败。');
    } finally {
      setBusy(false);
    }
  }

  function handleManualAdd(event) {
    event.preventDefault();
    if (!selectedProjectKey || !selectedMemberUsername || !manualStart || !manualEnd) {
      setError('请选择项目和成员，并填写开始/结束日期。');
      return;
    }
    if (manualStart > manualEnd) {
      setError('结束日期不能早于开始日期。');
      return;
    }
    const item = {
      id: -Date.now(),
      project_key: selectedProjectKey,
      project_name: projectName(selectedProjectKey),
      username: selectedMemberUsername,
      display_name: memberName(selectedMemberUsername),
      start_date: manualStart,
      end_date: manualEnd,
      daily_hours: DEFAULT_DAILY_HOURS,
      note: '',
    };
    setItems((current) => [...current, item]);
    void persistCreate(item);
  }

  const axisLabels = useMemo(() => {
    const labels = [];
    const start = new Date(`${computedViewStart}T00:00:00Z`);
    const end = new Date(`${computedViewEnd}T00:00:00Z`);
    const cursor = new Date(start);
    if (viewScale === 'month') {
      cursor.setUTCDate(1);
      while (cursor <= end) {
        const labelDate = cursor.toISOString().slice(0, 10);
        labels.push({
          key: labelDate,
          label: `${cursor.getUTCMonth() + 1}月`,
          left: dayIndex(labelDate, computedViewStart) * pxPerDay,
          tier: 'month',
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      return labels;
    }

    const monthCursor = new Date(start);
    monthCursor.setUTCDate(1);
    while (monthCursor <= end) {
      const labelDate = monthCursor.toISOString().slice(0, 10);
      labels.push({
        key: `month:${labelDate}`,
        label: `${monthCursor.getUTCMonth() + 1}月`,
        left: Math.max(0, dayIndex(labelDate, computedViewStart) * pxPerDay),
        tier: 'month',
      });
      monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
    }

    while (cursor <= end) {
      const labelDate = cursor.toISOString().slice(0, 10);
      labels.push({
        key: labelDate,
        label: viewScale === 'week'
          ? `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`
          : String(cursor.getUTCDate()),
        left: dayIndex(labelDate, computedViewStart) * pxPerDay,
        tier: viewScale === 'week' ? 'date' : 'day',
      });
      if (viewScale === 'week') {
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return labels;
  }, [computedViewStart, computedViewEnd, viewScale, pxPerDay]);

  const todayLeft = dayIndex(dateFromMs(today), computedViewStart) * pxPerDay;

  return (
    <div className="time-management">
      {!readOnly ? (
        <form className="time-management-toolbar" onSubmit={handleManualAdd}>
          <label className="time-management-field">
            <span>项目（拖拽生成时使用）</span>
            <Select className="time-management-select" searchable searchPlaceholder="搜索项目" value={selectedProjectKey} onChange={(event) => setSelectedProjectKey(event.currentTarget.value)}>
              {projects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
            </Select>
          </label>
          <label className="time-management-field">
            <span>手动添加成员</span>
            <Select className="time-management-select" searchable searchPlaceholder="搜索成员" value={selectedMemberUsername} onChange={(event) => setSelectedMemberUsername(event.currentTarget.value)}>
              {visibleMembers.map((member) => <option key={member.username} value={member.username}>{member.display_name || member.username}</option>)}
            </Select>
          </label>
          <label className="time-management-field">
            <span>开始日期</span>
            <input type="date" value={manualStart} onChange={(event) => setManualStart(event.currentTarget.value)} />
          </label>
          <label className="time-management-field">
            <span>结束日期</span>
            <input type="date" value={manualEnd} onChange={(event) => setManualEnd(event.currentTarget.value)} />
          </label>
          <button className="time-management-primary" type="submit" disabled={busy}>添加排期</button>
        </form>
      ) : null}

      <div className="time-management-controls">
        <div className="time-management-controls-left">
          <div className="time-management-scale" role="group" aria-label="时间粒度">
            {[['day', '日'], ['week', '周'], ['month', '月']].map(([value, label]) => (
              <button key={value} type="button" className={viewScale === value ? 'active' : ''}
                aria-pressed={viewScale === value} onClick={() => setViewScale(/** @type {'day' | 'week' | 'month'} */ (value))}>
                {label}
              </button>
            ))}
          </div>
          <label className="time-management-range">
            <span>时间跨度</span>
            <input type="number" min="1" max="12" value={spanInput}
              onChange={(event) => setSpanInput(event.currentTarget.value)}
              onBlur={() => setSpanInput(String(normalizeSpanMonths(spanInput)))} />
            <em>月</em>
          </label>
        </div>
        {currentUsername ? (
          <div className="time-management-view" role="group" aria-label="查看范围">
            <button type="button" className={viewScope === 'all' ? 'active' : ''}
              aria-pressed={viewScope === 'all'} onClick={() => setViewScope('all')}>
              查看全部人
            </button>
            <button type="button" className={viewScope === 'self' ? 'active' : ''}
              aria-pressed={viewScope === 'self'} onClick={() => setViewScope('self')}>
              查看自己
            </button>
          </div>
        ) : null}
      </div>

      {projects.length ? (
        <div className="time-management-legend" aria-label="项目图例">
          {(legendExpanded ? projects : projects.slice(0, LEGEND_COLLAPSED_LIMIT)).map((project) => (
            <span className="time-management-legend-item" key={project.key}>
              <i style={{ background: projectColor(project.key) }} aria-hidden="true" />
              {project.name}
            </span>
          ))}
          {projects.length > LEGEND_COLLAPSED_LIMIT ? (
            <button type="button" className="time-management-legend-toggle" aria-expanded={legendExpanded}
              onClick={() => setLegendExpanded((current) => !current)}>
              {legendExpanded ? '收起' : `+${projects.length - LEGEND_COLLAPSED_LIMIT} 个项目`}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="time-management-error" role="alert">{error}</div> : null}

      <div className="time-gantt-wrap">
        <div className={`time-gantt${viewScale !== 'day' ? ' time-gantt-fill' : ''}`} ref={ganttRef}
          onPointerDown={handleGanttPointerDown}
          onPointerMove={handleGanttPointerMove}
          onPointerUp={handleGanttPointerUp}
          onPointerCancel={handleGanttPointerUp}
          onDoubleClick={handleGanttDoubleClick}>
          <div className="time-gantt-axis-row">
            <div className="time-gantt-axis-label">成员 / 时间</div>
            <div className="time-gantt-axis" style={{ width: `${totalWidth}px` }}>
              {axisLabels.map((label) => (
                <span key={label.key} className={`time-gantt-axis-${label.tier}`} style={{ left: `${label.left}px` }}>{label.label}</span>
              ))}
            </div>
          </div>
          {visibleMembers.map((member) => {
            const memberItems = items.filter((item) => item.username === member.username);
            return (
              <div className="time-gantt-member-row" key={member.username}>
                <div className="time-gantt-row-label">{member.display_name || member.username}</div>
                <div className="time-gantt-track" data-username={member.username} style={{ width: `${totalWidth}px` }}>
                  <span className="time-gantt-today" style={{ left: `${todayLeft}px` }} aria-hidden="true" />
                  {memberItems.map((allocation) => {
                    const start = Math.max(0, dayIndex(allocation.start_date, computedViewStart));
                    const end = Math.min(totalDays - 1, dayIndex(allocation.end_date, computedViewStart));
                    const conflict = conflictKeys.has(String(allocation.id));
                    return (
                      <div key={allocation.id}
                        className={`time-gantt-allocation${conflict ? ' time-gantt-allocation-conflict' : ''}`}
                        data-id={allocation.id}
                        style={{ left: `${start * pxPerDay}px`, width: `${(end - start + 1) * pxPerDay}px`, background: projectColor(allocation.project_key) }}
                        title={`${member.display_name || member.username} · ${allocation.project_name}\n${allocation.start_date} ~ ${allocation.end_date}\n每天 ${allocation.daily_hours} 小时${allocation.note ? `\n${allocation.note}` : ''}`}>
                        <span className="time-gantt-allocation-name">{allocation.project_name}</span>
                        <span className="time-gantt-allocation-meta">{allocation.start_date.slice(5)} ~ {allocation.end_date.slice(5)} {allocation.daily_hours}h/天</span>
                        {!readOnly ? <>
                          <i className="time-gantt-resize-l" aria-hidden="true" />
                          <i className="time-gantt-resize-r" aria-hidden="true" />
                        </> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!visibleMembers.length ? (
            <div className="time-gantt-empty">暂无成员，请先在项目中添加成员。</div>
          ) : null}
        </div>
      </div>
      <p className="time-management-tip">
        {readOnly
          ? '当前为只读视图：色块表示成员在项目上的时间投入，重叠部分会高亮冲突；可切换日/周/月粒度并调整时间跨度。'
          : '操作方式：在成员行按住拖动画出一段排期；拖动色块可移动，拖动左右边缘可调整起止；双击色块删除；同一成员重叠会标红警告；可切换日/周/月粒度并调整时间跨度。'}
      </p>
    </div>
  );
}

function normalizeSpanMonths(value) {
  if (String(value).trim() === '') return DEFAULT_SPAN_MONTHS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SPAN_MONTHS;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function addUtcMonths(ms, months) {
  const date = new Date(ms);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

function normalizeAllocation(allocation) {
  return {
    ...allocation,
    project_name: allocation.project_name || allocation.project_key,
    display_name: allocation.display_name || allocation.username,
    daily_hours: Number(allocation.daily_hours) || DEFAULT_DAILY_HOURS,
    note: allocation.note || '',
  };
}

function startOfToday() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return Date.UTC(year || 1970, (month || 1) - 1, day || 1);
}

function dayIndex(value, viewStart) {
  return Math.round((parseDate(value) - parseDate(viewStart)) / DAY_MS);
}

function dateFromDay(index, viewStart) {
  return dateFromMs(parseDate(viewStart) + index * DAY_MS);
}

function dateFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
