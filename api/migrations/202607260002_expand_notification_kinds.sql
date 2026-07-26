-- no-transaction

PRAGMA foreign_keys = OFF;

CREATE TABLE notifications_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id),
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    actor_display_name_snapshot TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK (kind IN ('work_item_assigned', 'comment_replied', 'comment_mentioned')),
    work_item_id INTEGER NOT NULL REFERENCES work_items(id),
    comment_id INTEGER REFERENCES work_item_comments(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO notifications_new (
    id,
    recipient_user_id,
    actor_user_id,
    actor_display_name_snapshot,
    kind,
    work_item_id,
    comment_id,
    title,
    body,
    read_at,
    created_at
)
SELECT
    id,
    recipient_user_id,
    actor_user_id,
    actor_display_name_snapshot,
    kind,
    work_item_id,
    comment_id,
    title,
    body,
    read_at,
    created_at
FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX idx_notifications_recipient_created
ON notifications(recipient_user_id, created_at DESC, id DESC);

CREATE INDEX idx_notifications_recipient_unread
ON notifications(recipient_user_id, read_at, created_at DESC);

PRAGMA foreign_keys = ON;
