/*
 * 元策 UI v3 · 静态 mock 数据
 * 字段命名对齐 frontend/packages/api-client 的现有响应结构，
 * 便于设计定稿后回迁 React 时直接对照。
 */

/*
 * 项目号与工作项号是业务标识符，不是凭据。
 * 工作项号由「项目号 + 类型 + 序号」拼装，集中在一处构造，
 * 避免在数据表里重复几十条同样的长串。
 */
const itemKey = (projectNumber, type, seq) => `P${projectNumber}-${type}-${seq}`;

const RETAIL = '260709472030';
const YUANCE = '260713443429';

export const currentUser = {
  id: 1,
  username: 'admin',
  display_name: '超级管理员',
  is_super_admin: true,
  email: 'admin@quanxinfu.com',
  role: '超级管理员',
  department: '研发中心',
};

export let currentProject = {
  key: 'P261102793662',
  name: '零售系统',
  pending_count: 3,
};

export const projects = [
  { project_key: 'P261102793662', name: '零售系统', owner: '超级管理员', status: '进行中', updated_at: '2026-11-02 17:10:56', pending: { requirement: 2, task: 3, bug: 1 }, members: ['admin', 'chenxiaopeng', 'yangyaxin'] },
  { project_key: 'P260918192028', name: '通用', owner: '超级管理员', status: '进行中', updated_at: '2026-09-18 09:12:17', pending: { requirement: 0, task: 1, bug: 0 }, members: ['admin'] },
  { project_key: 'P260915242641', name: '客服系统', owner: '超级管理员', status: '进行中', updated_at: '2026-09-15 10:12:05', pending: { requirement: 1, task: 0, bug: 2 }, members: ['admin', 'yangyaxin'] },
  { project_key: 'P260909697772', name: '灵枢', owner: '超级管理员', status: '进行中', updated_at: '2026-09-09 13:49:01', pending: { requirement: 0, task: 2, bug: 0 }, members: ['admin'] },
  { project_key: 'P260903715000', name: '社区团购（SaaS 版本）', owner: '超级管理员', status: '进行中', updated_at: '2026-09-03 14:44:52', pending: { requirement: 3, task: 4, bug: 1 }, members: ['admin', 'chenxiaopeng'] },
  { project_key: 'P260902235379', name: '通知系统', owner: '超级管理员', status: '进行中', updated_at: '2026-09-02 09:30:36', pending: { requirement: 0, task: 1, bug: 0 }, members: ['admin'] },
  { project_key: 'P260814951315', name: '企业数字工作平台', owner: '超级管理员', status: '进行中', updated_at: '2026-08-14 11:19:09', pending: { requirement: 2, task: 0, bug: 3 }, members: ['admin', 'yangyaxin'] },
  { project_key: 'P260721202587', name: '多商城', owner: '超级管理员', status: '进行中', updated_at: '2026-07-21 14:47:51', pending: { requirement: 0, task: 2, bug: 0 }, members: ['admin'] },
  { project_key: 'P260713349103', name: 'CRM', owner: '超级管理员', status: '进行中', updated_at: '2026-07-13 14:29:52', pending: { requirement: 1, task: 3, bug: 0 }, members: ['admin'] },
  { project_key: 'P260713443429', name: '元策（项目管理）', owner: '超级管理员', status: '进行中', updated_at: '2026-07-13 13:54:01', pending: { requirement: 4, task: 6, bug: 2 }, members: ['admin', 'chenxiaopeng', 'yangyaxin'] },
  { project_key: 'P260713090179', name: 'BI 系统', owner: '超级管理员', status: '进行中', updated_at: '2026-07-13 13:53:33', pending: { requirement: 8, task: 12, bug: 2 }, members: ['admin'] },
];

/** 切换当前项目（顶栏项目选择器使用）。 */
export function setCurrentProject(projectKey) {
  const found = projects.find((project) => project.project_key === projectKey);
  if (!found) return;
  const pending = found.pending.requirement + found.pending.task + found.pending.bug;
  currentProject = { key: found.project_key, name: found.name, pending_count: pending };
}

export const projectOverview = {
  project_key: 'P261102793662',
  name: '零售系统',
  description: '面向线下门店的零售经营系统，覆盖商品、库存、收银与会员四大域。本期聚焦多门店调拨与会员储值重构。',
  status: '进行中',
  owner: '超级管理员',
  created_at: '2026-11-02 17:10:56',
  updated_at: '2026-11-04 15:32:10',
  members: [
    { username: 'admin', display_name: '超级管理员', role: '负责人' },
    { username: 'chenxiaopeng', display_name: '陈晓鹏', role: '成员' },
    { username: 'yangyaxin', display_name: '杨雅鑫', role: '成员' },
  ],
  cycles: [
    { cycle_id: 12, name: '2026 迭代 11', start_date: '2026-10-20', end_date: '2026-11-17', progress: 68, state: '进行中' },
    { cycle_id: 11, name: '2026 迭代 10', start_date: '2026-09-22', end_date: '2026-10-19', progress: 100, state: '已结束' },
  ],
  stats: { requirement: 14, task: 26, bug: 9, done: 31 },
};

export const workItems = [
  { key: itemKey(RETAIL, 'REQ', 8), item_type: 'requirement', title: '门店会员储值卡支持跨门店核销', status: '待处理', priority: '高', project_key: 'P261102793662', project_name: '零售系统', assignee: '陈晓鹏', updated_at: '2026-11-03 15:51:09', due_date: '2026-11-12' },
  { key: itemKey(RETAIL, 'REQ', 7), item_type: 'requirement', title: '多门店库存调拨单支持二次审批', status: '进行中', priority: '高', project_key: 'P261102793662', project_name: '零售系统', assignee: '超级管理员', updated_at: '2026-11-02 17:10:56', due_date: '2026-11-08' },
  { key: itemKey(RETAIL, 'REQ', 6), item_type: 'requirement', title: '收银端离线开单与断网补传', status: '待确认', priority: '中', project_key: 'P261102793662', project_name: '零售系统', assignee: '杨雅鑫', updated_at: '2026-11-01 09:22:41', due_date: '2026-11-20' },
  { key: itemKey(RETAIL, 'REQ', 5), item_type: 'requirement', title: '商品档案支持多规格维度组合', status: '待处理', priority: '低', project_key: 'P261102793662', project_name: '零售系统', assignee: '', updated_at: '2026-10-30 14:05:12', due_date: '' },
  { key: itemKey(RETAIL, 'REQ', 4), item_type: 'requirement', title: '门店日报增加毛利口径切换', status: '已完成', priority: '中', project_key: 'P261102793662', project_name: '零售系统', assignee: '超级管理员', updated_at: '2026-10-28 16:40:03', due_date: '2026-10-29' },
  { key: itemKey(RETAIL, 'REQ', 3), item_type: 'requirement', title: '会员积分规则支持按门店自定义', status: '已关闭', priority: '低', project_key: 'P261102793662', project_name: '零售系统', assignee: '陈晓鹏', updated_at: '2026-10-21 11:18:30', due_date: '' },
  { key: itemKey(RETAIL, 'REQ', 2), item_type: 'requirement', title: '促销叠加规则冲突时给出明确提示', status: '进行中', priority: '中', project_key: 'P261102793662', project_name: '零售系统', assignee: '杨雅鑫', updated_at: '2026-10-19 10:02:55', due_date: '2026-11-15' },
  { key: itemKey(RETAIL, 'REQ', 1), item_type: 'requirement', title: '门店排班支持按周复制', status: '已完成', priority: '中', project_key: 'P261102793662', project_name: '零售系统', assignee: '超级管理员', updated_at: '2026-10-12 09:44:20', due_date: '2026-10-15' },
  { key: itemKey(RETAIL, 'TASK', 24), item_type: 'task', title: '调拨单审批流状态机重构', status: '进行中', priority: '高', project_key: 'P261102793662', project_name: '零售系统', assignee: '陈晓鹏', updated_at: '2026-11-03 10:12:00', due_date: '2026-11-10' },
  { key: itemKey(RETAIL, 'TASK', 23), item_type: 'task', title: '储值卡核销接口幂等改造', status: '待处理', priority: '高', project_key: 'P261102793662', project_name: '零售系统', assignee: '超级管理员', updated_at: '2026-11-02 18:30:44', due_date: '2026-11-09' },
  { key: itemKey(RETAIL, 'TASK', 22), item_type: 'task', title: '补充核销流水回滚用例', status: '待确认', priority: '中', project_key: 'P261102793662', project_name: '零售系统', assignee: '杨雅鑫', updated_at: '2026-11-01 15:47:12', due_date: '' },
  { key: itemKey(RETAIL, 'TASK', 21), item_type: 'task', title: '门店维度缓存预热脚本', status: '已完成', priority: '低', project_key: 'P261102793662', project_name: '零售系统', assignee: '陈晓鹏', updated_at: '2026-10-29 08:55:00', due_date: '' },
  { key: itemKey(RETAIL, 'BUG', 11), item_type: 'bug', title: '跨门店核销后会员余额未实时刷新', status: '待处理', priority: '高', project_key: 'P261102793662', project_name: '零售系统', assignee: '超级管理员', updated_at: '2026-11-03 20:11:05', due_date: '2026-11-06' },
  { key: itemKey(RETAIL, 'BUG', 10), item_type: 'bug', title: '调拨单驳回后库存快照未刷新', status: '进行中', priority: '中', project_key: 'P261102793662', project_name: '零售系统', assignee: '陈晓鹏', updated_at: '2026-11-02 09:26:38', due_date: '' },
  { key: itemKey(RETAIL, 'BUG', 9), item_type: 'bug', title: '收银端打印小票金额四舍五入偏差', status: '已关闭', priority: '低', project_key: 'P261102793662', project_name: '零售系统', assignee: '杨雅鑫', updated_at: '2026-10-25 13:15:09', due_date: '' },
];

export const workItemDetail = {
  key: itemKey(RETAIL, 'REQ', 8),
  item_type: 'requirement',
  title: '门店会员储值卡支持跨门店核销',
  description:
    '<p>现状：储值卡仅限发卡门店核销，跨店消费需走退款再充值，实际客诉每月约 40 单。</p><p>目标：储值卡余额在全连锁门店实时可用，核销后会员中心余额即时刷新。</p><ul><li>核销接口需保证幂等，重复提交不产生二次扣减</li><li>跨店核销需保留发卡门店来源标识，便于对账</li><li>余额刷新延迟不超过 1 秒</li></ul>',
  status: '待处理',
  priority: '高',
  project_key: 'P261102793662',
  project_name: '零售系统',
  parent_item_key: '',
  parent_title: '',
  assignee_username: 'chenxiaopeng',
  assignee: '陈晓鹏',
  reporter: '超级管理员',
  reporter_username: 'admin',
  due_date: '2026-11-12',
  created_at: '2026-11-03 15:48:22',
  updated_at: '2026-11-03 15:51:09',
  deleted_at: '',
};

export const workItemComments = [
  { id: 11, parent_comment_id: null, parent_author: '', body: '补充一下：跨店核销后会员中心的余额展示需要同步刷新，不能等下一次拉取。', body_format: 'html', author: '陈晓鹏', author_username: 'chenxiaopeng', created_at: '2026-11-03 15:51:09', updated_at: '2026-11-03 15:51:09', is_flow: false, is_draft: false },
  { id: 10, parent_comment_id: null, parent_author: '', body: '接口幂等方案已确认，采用请求号 + 数据库唯一索引双保险。', body_format: 'html', author: '超级管理员', author_username: 'admin', created_at: '2026-11-03 15:20:41', updated_at: '2026-11-03 15:20:41', is_flow: false, is_draft: false },
  { id: 9, parent_comment_id: null, parent_author: '', body: '财务确认对账口径需要保留发卡门店来源标识。', body_format: 'html', author: '杨雅鑫', author_username: 'yangyaxin', created_at: '2026-11-02 18:02:10', updated_at: '2026-11-02 18:02:10', is_flow: false, is_draft: false },
];

export const workItemAttachments = [
  { id: 301, filename: '跨门店核销流程图.png', content_type: 'image/png', byte_size: 284160, status: 'ready', created_by: '陈晓鹏', created_at: '2026-11-03 15:49:02' },
  { id: 302, filename: '储值卡核销接口约定.docx', content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', byte_size: 102400, status: 'ready', created_by: '超级管理员', created_at: '2026-11-03 15:32:44' },
  { id: 303, filename: '客诉统计-10月.xlsx', content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', byte_size: 51200, status: 'ready', created_by: '杨雅鑫', created_at: '2026-11-02 17:58:30' },
];

export const resources = [
  { id: 9001, project_key: 'P261102793662', title: '零售系统产品手册', type: '文档', updated_at: '2026-11-02 17:10:56', author: '超级管理员', chapters: 12, size: '4.2 MB' },
  { id: 9002, project_key: 'P261102793662', title: '门店收银操作手册 v3.2', type: '文档', updated_at: '2026-10-30 11:24:03', author: '陈晓鹏', chapters: 8, size: '1.8 MB' },
  { id: 9003, project_key: 'P261102793662', title: '会员体系设计稿', type: '原型', updated_at: '2026-10-26 15:09:44', author: '杨雅鑫', chapters: 5, size: '6.5 MB' },
  { id: 9004, project_key: 'P261102793662', title: '库存调拨业务规则说明', type: '文档', updated_at: '2026-10-18 09:41:20', author: '超级管理员', chapters: 6, size: '980 KB' },
  { id: 9005, project_key: 'P261102793662', title: '门店网络拓扑图', type: '附件', updated_at: '2026-10-11 16:32:08', author: '陈晓鹏', chapters: 1, size: '320 KB' },
];

export const resourceDetail = {
  id: 9001,
  title: '零售系统产品手册',
  type: '文档',
  author: '超级管理员',
  updated_at: '2026-11-02 17:10:56',
  chapters: [
    { id: 1, title: '一、产品概述', level: 1 },
    { id: 2, title: '1.1 目标用户', level: 2 },
    { id: 3, title: '1.2 核心场景', level: 2 },
    { id: 4, title: '二、商品域', level: 1 },
    { id: 5, title: '2.1 商品档案', level: 2 },
    { id: 6, title: '2.2 多规格维度', level: 2 },
    { id: 7, title: '三、会员域', level: 1 },
    { id: 8, title: '3.1 储值卡', level: 2 },
    { id: 9, title: '3.2 积分规则', level: 2 },
    { id: 10, title: '四、库存与调拨', level: 1 },
    { id: 11, title: '五、收银端', level: 1 },
    { id: 12, title: '六、常见问题', level: 1 },
  ],
};

export const messages = [
  { id: 701, type: 'mention', title: '陈晓鹏 在「门店会员储值卡支持跨门店核销」中提及了你', item_key: itemKey(RETAIL, 'REQ', 8), author: '陈晓鹏', created_at: '2026-11-03 15:51:09', unread: true },
  { id: 702, type: 'reply', title: '超级管理员 回复了你在「多门店库存调拨单支持二次审批」中的评论', item_key: itemKey(RETAIL, 'REQ', 7), author: '超级管理员', created_at: '2026-11-02 17:10:56', unread: true },
  { id: 703, type: 'handoff', title: '「收银端离线开单与断网补传」已转交给 杨雅鑫', item_key: itemKey(RETAIL, 'REQ', 6), author: '超级管理员', created_at: '2026-11-01 09:22:41', unread: false },
  { id: 704, type: 'mention', title: '杨雅鑫 在「库存调拨业务规则说明」中提及了你', item_key: itemKey(RETAIL, 'REQ', 2), author: '杨雅鑫', created_at: '2026-10-30 14:05:12', unread: false },
  { id: 705, type: 'comment', title: '陈晓鹏 评论了「跨门店核销后会员余额未实时刷新」', item_key: itemKey(RETAIL, 'BUG', 11), author: '陈晓鹏', created_at: '2026-10-28 16:40:03', unread: false },
];

export const searchResults = [
  { kind: 'requirement', key: itemKey(RETAIL, 'REQ', 8), title: '门店会员储值卡支持跨门店核销', project: '零售系统', updated_at: '2026-11-03 15:51:09' },
  { kind: 'requirement', key: itemKey(RETAIL, 'REQ', 7), title: '多门店库存调拨单支持二次审批', project: '零售系统', updated_at: '2026-11-02 17:10:56' },
  { kind: 'task', key: itemKey(RETAIL, 'TASK', 24), title: '调拨单审批流状态机重构', project: '零售系统', updated_at: '2026-11-03 10:12:00' },
  { kind: 'bug', key: itemKey(RETAIL, 'BUG', 11), title: '跨门店核销后会员余额未实时刷新', project: '零售系统', updated_at: '2026-11-03 20:11:05' },
  { kind: 'resource', key: 'R9001', title: '零售系统产品手册', project: '零售系统', updated_at: '2026-11-02 17:10:56' },
  { kind: 'requirement', key: itemKey(YUANCE, 'REQ', 3), title: '工作项批量导入支持字段映射', project: '元策（项目管理）', updated_at: '2026-07-13 13:54:01' },
];

export const systemUsers = [
  { id: 1, username: 'admin', display_name: '超级管理员', role: '超级管理员', department: '研发中心', status: '启用', last_login: '2026-11-04 09:12:33' },
  { id: 2, username: 'chenxiaopeng', display_name: '陈晓鹏', role: '项目经理', department: '研发中心', status: '启用', last_login: '2026-11-03 18:44:02' },
  { id: 3, username: 'yangyaxin', display_name: '杨雅鑫', role: '开发工程师', department: '研发中心', status: '启用', last_login: '2026-11-02 17:31:58' },
  { id: 4, username: 'zhaomin', display_name: '赵敏', role: '测试工程师', department: '质量保障部', status: '启用', last_login: '2026-10-30 11:05:47' },
  { id: 5, username: 'liufang', display_name: '刘芳', role: '只读成员', department: '产品部', status: '已禁用', last_login: '2026-09-28 14:22:10' },
];

export const systemRoles = [
  { name: '超级管理员', members: 1, description: '拥有系统全部管理权限', scope: '全局' },
  { name: '项目经理', members: 6, description: '管理所负责项目的全部工作项', scope: '项目内' },
  { name: '开发工程师', members: 23, description: '处理指派给自己的工作项', scope: '项目内' },
  { name: '测试工程师', members: 8, description: '创建并流转缺陷', scope: '项目内' },
  { name: '只读成员', members: 14, description: '只读查看项目与工作项', scope: '项目内' },
];

export const systemPermissions = [
  { code: 'project.read', name: '查看项目', scope: '项目内' },
  { code: 'project.update', name: '编辑项目', scope: '项目内' },
  { code: 'work_item.create', name: '创建工作项', scope: '项目内' },
  { code: 'work_item.update', name: '编辑工作项', scope: '项目内' },
  { code: 'work_item.assign', name: '指派工作项', scope: '项目内' },
  { code: 'resource.upload', name: '上传资料', scope: '项目内' },
  { code: 'system.user.manage', name: '管理用户', scope: '全局' },
  { code: 'system.audit.read', name: '查看审计日志', scope: '全局' },
];

export const systemStorage = [
  { key: 'attachments/2026/11', objects: 1842, size: '2.4 GB', updated_at: '2026-11-04 08:12:00' },
  { key: 'attachments/2026/10', objects: 2961, size: '3.9 GB', updated_at: '2026-11-01 08:12:00' },
  { key: 'resources/retail', objects: 318, size: '820 MB', updated_at: '2026-10-30 08:12:00' },
  { key: 'exports/2026', objects: 76, size: '140 MB', updated_at: '2026-10-28 08:12:00' },
];

export const systemAudit = [
  { id: 9901, actor: '超级管理员', action: '创建工作项', target_type: 'requirement', target_id: itemKey(RETAIL, 'REQ', 8), created_at: '2026-11-03 15:48:22', ip: '10.20.3.11' },
  { id: 9902, actor: '陈晓鹏', action: '更新工作项', target_type: 'requirement', target_id: itemKey(RETAIL, 'REQ', 8), created_at: '2026-11-03 15:51:09', ip: '10.20.3.24' },
  { id: 9903, actor: '超级管理员', action: '加入项目', target_type: 'project', target_id: 'P261102793662', created_at: '2026-11-02 17:31:58', ip: '10.20.3.11' },
  { id: 9904, actor: '杨雅鑫', action: '上传附件', target_type: 'work_item', target_id: itemKey(RETAIL, 'REQ', 2), created_at: '2026-11-02 17:28:10', ip: '10.20.4.7' },
  { id: 9905, actor: '赵敏', action: '修改角色', target_type: 'role', target_id: '只读成员', created_at: '2026-11-01 10:02:44', ip: '10.20.5.18' },
];

export const systemReleases = [
  { version: 'v2.8.0', channel: '正式', status: '已发布', published_at: '2026-11-02 20:10:00', size: '86.4 MB', note: '零售系统多门店调拨上线' },
  { version: 'v2.7.4', channel: '正式', status: '已发布', published_at: '2026-10-18 20:10:00', size: '85.9 MB', note: '修复收银端金额舍入偏差' },
  { version: 'v2.8.1-rc2', channel: '预览', status: '待发布', published_at: '', size: '86.8 MB', note: '会员储值卡跨店核销灰度' },
];

export const systemDatabaseStats = [
  { name: 'projects', rows: 11, size: '48 KB' },
  { name: 'work_items', rows: 1284, size: '2.1 MB' },
  { name: 'work_item_comments', rows: 8642, size: '11.4 MB' },
  { name: 'attachments', rows: 5197, size: '7.2 GB' },
  { name: 'users', rows: 52, size: '12 KB' },
];

export const recentActivities = [
  { text: `评论工作项 ${itemKey(RETAIL, 'REQ', 8)}`, user: '陈晓鹏', time: '2026-11-03 15:51:09' },
  { text: `创建工作项 ${itemKey(RETAIL, 'REQ', 8)}`, user: '陈晓鹏', time: '2026-11-03 15:51:09' },
  { text: '将 杨雅鑫 加入项目 企业数字工作平台', user: '超级管理员', time: '2026-11-02 17:31:58' },
  { text: '将 杨雅鑫 加入项目 授权中心', user: '超级管理员', time: '2026-11-02 17:31:58' },
  { text: '将 杨雅鑫 加入项目 零售系统', user: '超级管理员', time: '2026-11-02 17:31:58' },
];

export const personalAnalysis = {
  project_key: 'P261102793662',
  name: '零售系统',
  mine: { requirement: 2, task: 3, bug: 1 },
  throughput: [4, 6, 3, 8, 5, 7, 9, 6, 11, 8, 13, 10],
  cycle: '2026 迭代 11',
  updated_at: '2026-11-04 15:32:10',
};
