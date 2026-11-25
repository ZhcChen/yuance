-- 工作项操作记录按 (target_type, target_id, action) 过滤，原仅有 (project_id, created_at) 索引，详情页每次全表扫描。
CREATE INDEX IF NOT EXISTS idx_project_activities_target
    ON project_activities (target_type, target_id, action, created_at DESC);

-- 审计列表按 created_at DESC, id DESC 分页，原无对应索引，数据量增长后排序代价线性上升。
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
    ON audit_logs (created_at DESC, id DESC);
