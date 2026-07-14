#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = normalizeBaseUrl(process.env.YUANCE_BASE_URL || '');
const API_TOKEN = (process.env.YUANCE_API_TOKEN || '').trim();

if (!BASE_URL || !API_TOKEN) {
  console.error(
    'yuance-mcp: missing YUANCE_BASE_URL or YUANCE_API_TOKEN. See docs/mcp/ai-mcp-setup.md.',
  );
  process.exit(1);
}

class YuanceApiError extends Error {
  constructor(status, code, message) {
    super(`Yuance API error ${status}${code ? ` ${code}` : ''}: ${message}`);
    this.name = 'YuanceApiError';
    this.status = status;
    this.code = code;
    this.apiMessage = message;
  }
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function cleanQuery(query = {}) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

async function yuanceRequest(path, { method = 'GET', query, body } = {}) {
  const url = new URL(path, `${BASE_URL}/`);
  for (const [key, value] of Object.entries(cleanQuery(query))) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${API_TOKEN}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    const error = payload?.error || {};
    throw new YuanceApiError(
      response.status,
      error.code || '',
      error.message || response.statusText || 'request failed',
    );
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }
  return payload;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

function textResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

function registerTool(server, name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return textResult(await handler(args || {}));
    } catch (error) {
      return errorResult(error);
    }
  });
}

async function protectedResourceMetadata(projectKey, resourceId, error) {
  if (!(error instanceof YuanceApiError) || error.status !== 403) {
    throw error;
  }
  const resources = await yuanceRequest(`/api/v1/projects/${encodeURIComponent(projectKey)}/resources`);
  const resource = Array.isArray(resources)
    ? resources.find((item) => Number(item.id) === Number(resourceId))
    : null;
  if (!resource) {
    throw error;
  }
  return {
    ...resource,
    body: '',
    protected_note:
      '这条资料受访问密码保护。默认不返回正文或附件地址。只有用户明确授权并提供该条资料密码时，才调用 yuance_unlock_project_resource。',
  };
}

const server = new McpServer({
  name: 'yuance',
  version: '0.1.0',
});

registerTool(
  server,
  'yuance_list_projects',
  {
    title: '列出元策项目',
    description: '列出当前 PAT 可见的项目。需要 project:read scope。',
    inputSchema: {
      status: z.string().optional().describe('项目状态筛选，可留空。'),
      page: z.number().int().min(1).optional().describe('页码，默认 1。'),
      per_page: z.number().int().min(1).max(100).optional().describe('每页数量，默认 20。'),
    },
  },
  ({ status, page, per_page }) =>
    yuanceRequest('/api/v1/projects', { query: { status, page, per_page } }),
);

registerTool(
  server,
  'yuance_get_project',
  {
    title: '获取项目详情',
    description: '读取一个项目的详情。需要 project:read scope。',
    inputSchema: {
      project_key: z.string().min(1).describe('项目编号，例如 YCE。'),
    },
  },
  ({ project_key }) => yuanceRequest(`/api/v1/projects/${encodeURIComponent(project_key)}`),
);

registerTool(
  server,
  'yuance_list_work_items',
  {
    title: '列出需求/任务/Bug',
    description: '按项目、类型、状态、优先级、处理人或关键词查询工作项。需要 work_item:read scope。',
    inputSchema: {
      item_type: z.enum(['requirement', 'task', 'bug']).optional().describe('工作项类型。'),
      project_key: z.string().optional().describe('项目编号，建议显式传入。'),
      q: z.string().optional().describe('关键词。'),
      status: z.string().optional().describe('状态。'),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional().describe('优先级。'),
      assignee_username: z.string().optional().describe('处理人用户名。'),
      page: z.number().int().min(1).optional().describe('页码。'),
      per_page: z.number().int().min(1).max(100).optional().describe('每页数量。'),
    },
  },
  (args) => yuanceRequest('/api/v1/work-items', { query: args }),
);

registerTool(
  server,
  'yuance_get_work_item',
  {
    title: '获取工作项详情',
    description: '读取需求、任务或 Bug 的详情。需要 work_item:read scope。',
    inputSchema: {
      item_key: z.string().min(1).describe('工作项编号，例如 YCE-BUG-1。'),
    },
  },
  ({ item_key }) => yuanceRequest(`/api/v1/work-items/${encodeURIComponent(item_key)}`),
);

registerTool(
  server,
  'yuance_list_work_item_comments',
  {
    title: '列出工作项评论',
    description: '读取一个工作项下的评论、回复和平铺流转记录。需要 work_item:read scope。',
    inputSchema: {
      item_key: z.string().min(1).describe('工作项编号。'),
    },
  },
  ({ item_key }) => yuanceRequest(`/api/v1/work-items/${encodeURIComponent(item_key)}/comments`),
);

registerTool(
  server,
  'yuance_create_work_item_comment',
  {
    title: '发表工作项评论',
    description: '向需求、任务或 Bug 发表富文本评论。需要 work_item:read 和 comment:write scope。',
    inputSchema: {
      item_key: z.string().min(1).describe('工作项编号。'),
      body: z.string().min(1).describe('评论正文，支持元策富文本 HTML。'),
      body_format: z.string().optional().describe('正文格式，默认 html。'),
      parent_comment_id: z.number().int().optional().describe('回复目标评论 ID，可留空。'),
    },
  },
  ({ item_key, body, body_format = 'html', parent_comment_id }) =>
    yuanceRequest(`/api/v1/work-items/${encodeURIComponent(item_key)}/comments`, {
      method: 'POST',
      body: { body, body_format, parent_comment_id },
    }),
);

registerTool(
  server,
  'yuance_handoff_work_item',
  {
    title: '提交工作项待确认',
    description:
      'AI 助手完成处理后提交待确认，并记录流转说明。服务端会把状态限制为 pending_confirmation，最终完成、验证或关闭必须由用户确认。需要 work_item:read 和 work_item:write scope。',
    inputSchema: {
      item_key: z.string().min(1).describe('工作项编号。'),
      assignee_username: z
        .string()
        .optional()
        .describe('新处理人用户名，可留空；留空时服务端默认指派回 Token 所属用户。'),
      body: z.string().optional().describe('待确认说明，建议概括 AI 已完成的处理内容。'),
      source_comment_id: z.number().int().optional().describe('来源评论 ID，可留空。'),
    },
  },
  ({ item_key, assignee_username = '', body = '', source_comment_id }) =>
    yuanceRequest(`/api/v1/work-items/${encodeURIComponent(item_key)}/handoff`, {
      method: 'POST',
      body: { status: 'pending_confirmation', assignee_username, body, source_comment_id },
    }),
);

registerTool(
  server,
  'yuance_list_project_resources',
  {
    title: '列出项目资料库',
    description:
      '列出项目资料库记录。受保护资料只返回标题、分类、摘要和受保护状态，不返回正文。需要 project:read 和 resource:read scope。',
    inputSchema: {
      project_key: z.string().min(1).describe('项目编号。'),
      q: z.string().optional().describe('关键词。'),
      category: z
        .enum(['integration', 'customer', 'meeting', 'implementation', 'other'])
        .optional()
        .describe('资料分类。'),
      status: z.enum(['active', 'archived', 'all']).optional().describe('资料状态。'),
    },
  },
  ({ project_key, q, category, status }) =>
    yuanceRequest(`/api/v1/projects/${encodeURIComponent(project_key)}/resources`, {
      query: { q, category, status },
    }),
);

registerTool(
  server,
  'yuance_get_project_resource',
  {
    title: '获取项目资料详情',
    description:
      '读取项目资料。受保护资料默认只返回元信息，不返回正文；不要尝试绕过访问密码。需要 project:read 和 resource:read scope。',
    inputSchema: {
      project_key: z.string().min(1).describe('项目编号。'),
      resource_id: z.number().int().describe('资料 ID。'),
    },
  },
  async ({ project_key, resource_id }) => {
    try {
      return await yuanceRequest(
        `/api/v1/projects/${encodeURIComponent(project_key)}/resources/${resource_id}`,
      );
    } catch (error) {
      return protectedResourceMetadata(project_key, resource_id, error);
    }
  },
);

registerTool(
  server,
  'yuance_unlock_project_resource',
  {
    title: '解锁受保护项目资料',
    description:
      '仅当用户明确授权并提供该条资料访问密码时调用。access_password 只用于本次请求，不缓存、不输出、不写日志。需要 project:read、resource:read 和 resource:unlock scope。',
    inputSchema: {
      project_key: z.string().min(1).describe('项目编号。'),
      resource_id: z.number().int().describe('资料 ID。'),
      access_password: z.string().min(1).describe('用户提供的该条资料访问密码。'),
    },
  },
  ({ project_key, resource_id, access_password }) =>
    yuanceRequest(`/api/v1/projects/${encodeURIComponent(project_key)}/resources/${resource_id}/unlock`, {
      method: 'POST',
      body: { access_password },
    }),
);

registerTool(
  server,
  'yuance_list_notifications',
  {
    title: '读取消息通知',
    description: '读取当前用户消息通知和未读数量。需要 notification:read scope。',
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe('最多返回数量，默认 5。'),
    },
  },
  ({ limit }) => yuanceRequest('/api/v1/notifications', { query: { limit } }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`yuance-mcp: connected to ${BASE_URL}`);
