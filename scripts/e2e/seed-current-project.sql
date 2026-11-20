-- 浏览器验收初始状态：开发管理员的当前项目为 YCE。
-- 每个 e2e 用例都从该模板库启动全新服务，用例不再依赖其他用例先行设置当前项目。
INSERT INTO user_project_preferences (user_id, current_project_id)
SELECT u.id, p.id
FROM users u, projects p
WHERE u.username = 'yuance_admin' AND p.project_key = 'YCE'
ON CONFLICT (user_id) DO UPDATE SET current_project_id = excluded.current_project_id, updated_at = datetime('now');
