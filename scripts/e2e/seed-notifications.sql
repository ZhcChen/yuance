-- 浏览器验收用通知种子数据：一条未读提及、一条已读指派。
-- 由 scripts/start-web-e2e-server.sh 与 web/e2e/support/fixtures.mjs 共用。
INSERT INTO notifications (
    recipient_user_id,
    actor_user_id,
    actor_display_name_snapshot,
    kind,
    work_item_id,
    comment_id,
    title,
    body
)
VALUES (
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    '系统管理员',
    'comment_mentioned',
    (SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'),
    (
        SELECT id
        FROM work_item_comments
        WHERE work_item_id = (SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2')
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
    ),
    '请查看待处理讨论',
    '这是一条用于浏览器验收的未读通知'
);

INSERT INTO notifications (
    recipient_user_id,
    actor_user_id,
    actor_display_name_snapshot,
    kind,
    work_item_id,
    comment_id,
    title,
    body,
    read_at
)
VALUES (
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    '系统管理员',
    'work_item_assigned',
    (SELECT id FROM work_items WHERE item_key = 'YCE-TASK-1'),
    NULL,
    '已读指派消息',
    '这是一条用于浏览器验收的已读通知',
    '2026-07-30T00:00:00Z'
);
