// @ts-check
/* global Element, ResizeObserver */

import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';

import { Button, Modal, Select, TextArea, TextInput } from './primitives.jsx';

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
 * @property {string} phase_task_name
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
 *   initialViewMode?: 'members' | 'projects',
 *   readOnly?: boolean,
 *   projectColors?: Record<string, string>,
 *   onCreate?: (payload: { username: string, projectKey: string, startDate: string, endDate: string, dailyHours: number, phaseTaskName?: string, note?: string }) => Promise<unknown> | unknown,
 *   onUpdate?: (id: number, payload: { username: string, projectKey: string, startDate: string, endDate: string, dailyHours: number, phaseTaskName?: string, note?: string }) => Promise<unknown> | unknown,
 *   onDelete?: (id: number) => Promise<unknown> | unknown,
 *   onSave?: (items: TimeAllocation[], operations: { created: TimeAllocation[], updated: TimeAllocation[], deleted: TimeAllocation[] }) => Promise<unknown> | unknown,
 *   onOpenRecords?: () => void,
 * }} props
 */
export function TimeAllocationGantt({
  allocations = [],
  projects = [],
  members = [],
  currentUsername = '',
  viewStart,
  viewEnd,
  initialViewMode = 'members',
  readOnly = false,
  projectColors = {},
  onCreate,
  onUpdate,
  onDelete,
  onSave,
  onOpenRecords,
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
  const [viewMode, setViewMode] = useState(/** @type {'members' | 'projects'} */ (initialViewMode));
  const [projectViewUsername, setProjectViewUsername] = useState('');
  const manualSave = Boolean(onSave);
  const viewReadOnly = readOnly || viewMode === 'projects';
  const [timeline, dispatchTimeline] = useReducer(
    timeAllocationHistoryReducer,
    allocations,
    (initial) => ({ items: initial.map(normalizeAllocation), undoStack: [], redoStack: [] }),
  );
  const items = timeline.items;
  const [selectedProjectKey, setSelectedProjectKey] = useState(projects[0]?.key || '');
  const [selectedMemberUsername, setSelectedMemberUsername] = useState(members[0]?.username || '');
  const [manualStart, setManualStart] = useState(dateFromMs(today));
  const [manualEnd, setManualEnd] = useState(dateFromMs(today + 29 * DAY_MS));
  const [manualTaskName, setManualTaskName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(/** @type {TimeAllocation | null} */ (null));
  const [editPopover, setEditPopover] = useState(/** @type {{ left: number, top: number } | null} */ (null));
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
    dispatchTimeline({
      type: 'replace',
      items: allocations.map(normalizeAllocation),
    });
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
    for (const allocation of items) {
      if (!seen.has(allocation.username)) {
        const member = members.find((candidate) => candidate.username === allocation.username);
        seen.set(allocation.username, {
          username: allocation.username,
          display_name: member?.display_name || allocation.display_name || allocation.username,
        });
      }
    }
    const allMembers = [...seen.values()];
    if (viewScope === 'all' || !currentUsername) return allMembers;
    return allMembers.filter((member) => member.username === currentUsername);
  }, [members, items, viewScope, currentUsername]);

  const effectiveProjectViewUsername = (() => {
    if (projectViewUsername && visibleMembers.some((member) => member.username === projectViewUsername)) {
      return projectViewUsername;
    }
    if (currentUsername && visibleMembers.some((member) => member.username === currentUsername)) {
      return currentUsername;
    }
    return visibleMembers[0]?.username || '';
  })();

  const projectViewGroups = useMemo(() => {
    if (viewMode !== 'projects' || !effectiveProjectViewUsername) return [];
    const groups = new Map();
    for (const allocation of items) {
      if (allocation.username !== effectiveProjectViewUsername) continue;
      const existing = groups.get(allocation.project_key);
      if (existing) {
        existing.push(allocation);
      } else {
        groups.set(allocation.project_key, [allocation]);
      }
    }
    return [...groups.entries()]
      .map(([projectKey, allocations]) => ({
        project_key: projectKey,
        project_name: projectName(projectKey),
        allocations,
      }))
      .sort((a, b) => a.project_name.localeCompare(b.project_name, 'zh-CN') || a.project_key.localeCompare(b.project_key));
  }, [items, viewMode, effectiveProjectViewUsername]);

  useEffect(() => {
    if (viewMode !== 'projects') return;
    const preferred = currentUsername && visibleMembers.some((member) => member.username === currentUsername)
      ? currentUsername
      : visibleMembers[0]?.username || '';
    setProjectViewUsername(preferred);
  }, [viewMode, currentUsername, visibleMembers]);

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

  function allocationBlock(allocation, ownerLabel) {
    const start = Math.max(0, dayIndex(allocation.start_date, computedViewStart));
    const end = Math.min(totalDays - 1, dayIndex(allocation.end_date, computedViewStart));
    const conflict = conflictKeys.has(String(allocation.id));
    return (
      <div key={allocation.id}
        className={`time-gantt-allocation${conflict ? ' time-gantt-allocation-conflict' : ''}`}
        data-id={allocation.id}
        style={{ left: `${start * pxPerDay}px`, width: `${(end - start + 1) * pxPerDay}px`, background: projectColor(allocation.project_key) }}
        title={`${ownerLabel} · ${allocation.project_name}${allocation.phase_task_name ? `\n阶段任务：${allocation.phase_task_name}` : ''}\n${allocation.start_date} ~ ${allocation.end_date}\n每天 ${allocation.daily_hours} 小时${allocation.note ? `\n${allocation.note}` : ''}`}>
        <span className="time-gantt-allocation-name">{allocation.phase_task_name || allocation.project_name}</span>
        <span className="time-gantt-allocation-meta">{allocation.phase_task_name ? `${allocation.project_name} · ` : ''}{allocation.start_date.slice(5)} ~ {allocation.end_date.slice(5)} {allocation.daily_hours}h/天</span>
        {!viewReadOnly ? <>
          <i className="time-gantt-resize-l" aria-hidden="true" />
          <i className="time-gantt-resize-r" aria-hidden="true" />
        </> : null}
      </div>
    );
  }

  function beginSelection(event, track) {
    if (viewReadOnly) return;
    event.preventDefault();
    const rect = track.getBoundingClientRect();
    const startDay = Math.floor((event.clientX - rect.left) / pxPerDay);
    const element = track.ownerDocument.createElement('div');
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
      phase_task_name: manualTaskName.trim(),
      note: '',
    };
    dispatchTimeline({ type: 'change', items: [...items, item] });
    if (!manualSave) void persistCreate(item);
  }

  function beginBlockDrag(event, block, mode) {
    if (viewReadOnly) return;
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
    dispatchTimeline({ type: 'change', items: items.map((item) => item.id === drag.id ? next : item) });
    if (!manualSave) void persistUpdate(next);
  }

  function handleGanttPointerDown(event) {
    if (event.button !== 0) return;
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
    if (viewReadOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const block = /** @type {HTMLElement | null} */ (target.closest('.time-gantt-allocation'));
    if (!block) return;
    const id = Number(block.dataset.id || 0);
    const removed = items.find((item) => item.id === id);
    dispatchTimeline({ type: 'change', items: items.filter((item) => item.id !== id) });
    if (!manualSave && removed) void persistDelete(id);
  }

  function handleGanttContextMenu(event) {
    if (viewReadOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const block = /** @type {HTMLElement | null} */ (target.closest('.time-gantt-allocation'));
    if (!block) return;
    const id = Number(block.dataset.id || 0);
    const allocation = items.find((item) => item.id === id);
    if (!allocation) return;
    event.preventDefault();
    const view = event.currentTarget.ownerDocument.defaultView;
    const left = Math.min(event.clientX, Math.max(0, (view?.innerWidth || 0) - 336 - 12));
    const top = Math.min(event.clientY, Math.max(0, (view?.innerHeight || 0) - 430 - 12));
    setEditDraft({ ...allocation });
    setEditPopover({ left, top });
  }

  function closeEditPopover() {
    setEditDraft(null);
    setEditPopover(null);
  }

  function submitEditPopover(event) {
    event.preventDefault();
    if (!editDraft) return;
    if (editDraft.start_date > editDraft.end_date) {
      setError('结束日期不能早于开始日期。');
      return;
    }
    const current = items.find((item) => item.id === editDraft.id);
    if (!current) {
      closeEditPopover();
      return;
    }
    const next = {
      ...current,
      start_date: editDraft.start_date,
      end_date: editDraft.end_date,
      phase_task_name: editDraft.phase_task_name.trim(),
      note: editDraft.note.trim(),
    };
    dispatchTimeline({ type: 'change', items: items.map((item) => item.id === next.id ? next : item) });
    if (!manualSave) void persistUpdate(next);
    closeEditPopover();
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
        phaseTaskName: item.phase_task_name,
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
        phaseTaskName: allocation.phase_task_name,
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
      phase_task_name: manualTaskName.trim(),
      note: '',
    };
    dispatchTimeline({ type: 'change', items: [...items, item] });
    if (!manualSave) void persistCreate(item);
  }

  function undo() {
    dispatchTimeline({ type: 'undo' });
  }

  function redo() {
    dispatchTimeline({ type: 'redo' });
  }

  function buildSaveOperations() {
    const original = allocations.map(normalizeAllocation);
    const created = items.filter((item) => item.id < 0);
    const byId = new Map(items.map((item) => [item.id, item]));
    const updated = [];
    const deleted = [];
    for (const source of original) {
      const next = byId.get(source.id);
      if (!next) {
        deleted.push(source);
      } else if (
        next.project_key !== source.project_key
        || next.username !== source.username
        || next.start_date !== source.start_date
        || next.end_date !== source.end_date
        || next.daily_hours !== source.daily_hours
        || next.phase_task_name !== source.phase_task_name
        || next.note !== source.note
      ) {
        updated.push(next);
      }
    }
    return { created, updated, deleted };
  }

  async function confirmSave() {
    if (!onSave || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(items, buildSaveOperations());
      dispatchTimeline({ type: 'clearHistory' });
      setSaveConfirmOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存排期失败。');
    } finally {
      setBusy(false);
    }
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
  const pendingSaveOperations = saveConfirmOpen ? buildSaveOperations() : null;

  return (
    <div className="time-management">
      {!viewReadOnly ? (
        <form className="time-management-toolbar" onSubmit={handleManualAdd}>
          <label className="time-management-field">
            <span>项目（拖拽生成时使用）</span>
            <Select className="time-management-select" searchable searchPlaceholder="搜索项目" value={selectedProjectKey} onChange={(event) => setSelectedProjectKey(event.currentTarget.value)}>
              {projects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
            </Select>
          </label>
          <label className="time-management-field">
            <span>阶段任务名称</span>
            <input type="text" maxLength={200} placeholder="例如：需求分析、开发、联调" value={manualTaskName} onChange={(event) => setManualTaskName(event.currentTarget.value)} />
          </label>
          <label className="time-management-field">
            <span>手动添加成员</span>
            <Select className="time-management-select" searchable searchPlaceholder="搜索成员" value={selectedMemberUsername} onChange={(event) => setSelectedMemberUsername(event.currentTarget.value)}>
              {members.map((member) => <option key={member.username} value={member.username}>{member.display_name || member.username}</option>)}
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
          <div className="time-management-view" role="group" aria-label="排期视角">
            <button type="button" className={viewMode === 'members' ? 'active' : ''}
              aria-pressed={viewMode === 'members'} onClick={() => setViewMode('members')}>
              人员排期
            </button>
            <button type="button" className={viewMode === 'projects' ? 'active' : ''}
              aria-pressed={viewMode === 'projects'} onClick={() => setViewMode('projects')}>
              项目排期
            </button>
          </div>
          {viewMode === 'projects' ? (
            <label className="time-management-field">
              <span>查看成员</span>
              <Select className="time-management-select" searchable searchPlaceholder="搜索成员" value={effectiveProjectViewUsername} onChange={(event) => setProjectViewUsername(event.currentTarget.value)}>
                {visibleMembers.map((member) => <option key={member.username} value={member.username}>{member.display_name || member.username}</option>)}
              </Select>
            </label>
          ) : null}
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
          {onOpenRecords ? (
            <Button variant="secondary" size="sm" onClick={onOpenRecords}>记录</Button>
          ) : null}
        </div>
        {manualSave && !viewReadOnly ? (
          <div className="time-management-controls-right" role="group" aria-label="排期编辑操作">
            <Button variant="secondary" size="sm" disabled={!timeline.undoStack.length || busy} onClick={undo}>回退</Button>
            <Button variant="secondary" size="sm" disabled={!timeline.redoStack.length || busy} onClick={redo}>前进</Button>
            <Button disabled={!timeline.undoStack.length || busy} onClick={() => setSaveConfirmOpen(true)}>保存</Button>
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
          onDoubleClick={handleGanttDoubleClick}
          onContextMenu={handleGanttContextMenu}>
          <div className="time-gantt-axis-row">
            <div className="time-gantt-axis-label">{viewMode === 'projects' ? '项目 / 时间' : '成员 / 时间'}</div>
            <div className="time-gantt-axis" style={{ width: `${totalWidth}px` }}>
              {axisLabels.map((label) => (
                <span key={label.key} className={`time-gantt-axis-${label.tier}`} style={{ left: `${label.left}px` }}>{label.label}</span>
              ))}
            </div>
          </div>
          {viewMode === 'projects'
            ? projectViewGroups.map((group) => (
              <div className="time-gantt-member-row" key={group.project_key}>
                <div className="time-gantt-row-label">
                  <i style={{ background: projectColor(group.project_key) }} aria-hidden="true" />
                  <span className="time-gantt-row-project-name">{group.project_name}</span>
                </div>
                <div className="time-gantt-track time-gantt-track-readonly" data-username={effectiveProjectViewUsername} style={{ width: `${totalWidth}px` }}>
                  <span className="time-gantt-today" style={{ left: `${todayLeft}px` }} aria-hidden="true" />
                  {group.allocations.map((allocation) => allocationBlock(allocation, memberName(effectiveProjectViewUsername)))}
                </div>
              </div>
            ))
            : visibleMembers.map((member) => {
              const memberItems = items.filter((item) => item.username === member.username);
              return (
                <div className="time-gantt-member-row" key={member.username}>
                  <div className="time-gantt-row-label">{member.display_name || member.username}</div>
                  <div className="time-gantt-track" data-username={member.username} style={{ width: `${totalWidth}px` }}>
                    <span className="time-gantt-today" style={{ left: `${todayLeft}px` }} aria-hidden="true" />
                    {memberItems.map((allocation) => allocationBlock(allocation, member.display_name || member.username))}
                  </div>
                </div>
              );
            })}
          {viewMode === 'projects'
            ? !effectiveProjectViewUsername || !projectViewGroups.length ? (
              <div className="time-gantt-empty">
                {members.length ? '暂无排期，请先切回“人员排期”添加排期。' : '暂无成员，请先在项目中添加成员。'}
              </div>
            ) : null
            : !visibleMembers.length ? (
            <div className="time-gantt-empty">
              {members.length ? '暂无排期，请先通过上方表单添加排期。' : '暂无成员，请先在项目中添加成员。'}
            </div>
          ) : null}
        </div>
      </div>
      <p className="time-management-tip">
        {viewMode === 'projects'
          ? '项目视角为只读：按项目查看成员排期，时间轴上的空白部分即为空窗期；如需调整排期，请切回“人员排期”视图。'
          : readOnly
            ? '当前为只读视图：色块表示成员在项目上的时间投入，重叠部分会高亮冲突；可切换日/周/月粒度并调整时间跨度。'
            : manualSave
              ? '操作方式：在成员行按住拖动画出一段排期；拖动色块可移动，拖动左右边缘可调整起止；右键色块可编辑阶段任务、日期与备注；双击色块删除；同一成员重叠会标红警告；修改后点击右上角“保存”生效，保存前可回退/前进。'
              : '操作方式：在成员行按住拖动画出一段排期；拖动色块可移动，拖动左右边缘可调整起止；右键色块可编辑阶段任务、日期与备注；双击色块删除；同一成员重叠会标红警告；可切换日/周/月粒度并调整时间跨度。'}
      </p>

      {manualSave && !viewReadOnly ? (
        <Modal open={saveConfirmOpen} title="确认保存排期" onClose={() => setSaveConfirmOpen(false)}
          footer={<>
            <Button variant="secondary" disabled={busy} onClick={() => setSaveConfirmOpen(false)}>取消</Button>
            <Button loading={busy} onClick={() => void confirmSave()}>确认保存</Button>
          </>}>
          <p>保存后将对线上排期生效，本次将：</p>
          <ul className="time-management-save-summary">
            <li>新增 {pendingSaveOperations?.created.length || 0} 条</li>
            <li>更新 {pendingSaveOperations?.updated.length || 0} 条</li>
            <li>删除 {pendingSaveOperations?.deleted.length || 0} 条</li>
          </ul>
        </Modal>
      ) : null}

      {editDraft && editPopover ? (
        <>
          <div className="time-gantt-popover-backdrop" onClick={closeEditPopover} />
          <div className="time-gantt-popover" role="dialog" aria-label="编辑排期" style={{ left: `${editPopover.left}px`, top: `${editPopover.top}px` }}>
            <h4>编辑排期</h4>
            <p className="time-gantt-popover-meta">{editDraft.project_name} · {editDraft.display_name || editDraft.username}</p>
            <form onSubmit={submitEditPopover}>
              <label className="time-gantt-popover-field">
                <span>阶段任务名称</span>
                <TextInput value={editDraft.phase_task_name || ''} maxLength={200} placeholder="例如：需求分析、开发、联调" onChange={(event) => setEditDraft((current) => current ? { ...current, phase_task_name: event.currentTarget.value } : current)} />
              </label>
              <div className="time-gantt-popover-dates">
                <label className="time-gantt-popover-field">
                  <span>开始日期</span>
                  <TextInput type="date" value={editDraft.start_date} onChange={(event) => setEditDraft((current) => current ? { ...current, start_date: event.currentTarget.value } : current)} />
                </label>
                <label className="time-gantt-popover-field">
                  <span>结束日期</span>
                  <TextInput type="date" value={editDraft.end_date} onChange={(event) => setEditDraft((current) => current ? { ...current, end_date: event.currentTarget.value } : current)} />
                </label>
              </div>
              <label className="time-gantt-popover-field">
                <span>备注</span>
                <TextArea rows={3} maxLength={500} placeholder="补充排期说明" value={editDraft.note || ''} onChange={(event) => setEditDraft((current) => current ? { ...current, note: event.currentTarget.value } : current)} />
              </label>
              <div className="time-gantt-popover-actions">
                <Button variant="secondary" type="button" onClick={closeEditPopover}>取消</Button>
                <Button type="submit">保存</Button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   items: TimeAllocation[],
 *   undoStack: TimeAllocation[][],
 *   redoStack: TimeAllocation[][],
 * }} state
 * @param {{
 *   type: 'replace' | 'change' | 'undo' | 'redo' | 'clearHistory',
 *   items?: TimeAllocation[],
 * }} action
 */
function timeAllocationHistoryReducer(state, action) {
  switch (action.type) {
    case 'replace':
      return { items: action.items || [], undoStack: [], redoStack: [] };
    case 'change':
      return {
        items: action.items || [],
        undoStack: [...state.undoStack, state.items],
        redoStack: [],
      };
    case 'undo': {
      const previous = state.undoStack[state.undoStack.length - 1];
      if (!previous) return state;
      return {
        items: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.items],
      };
    }
    case 'redo': {
      const next = state.redoStack[state.redoStack.length - 1];
      if (!next) return state;
      return {
        items: next,
        undoStack: [...state.undoStack, state.items],
        redoStack: state.redoStack.slice(0, -1),
      };
    }
    case 'clearHistory':
      return { ...state, undoStack: [], redoStack: [] };
    default:
      return state;
  }
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
    phase_task_name: allocation.phase_task_name || '',
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
