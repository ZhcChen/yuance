CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id),
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('work_item_assigned', 'comment_replied')),
    work_item_id INTEGER NOT NULL REFERENCES work_items(id),
    comment_id INTEGER REFERENCES work_item_comments(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_recipient_created
ON notifications(recipient_user_id, created_at DESC, id DESC);

CREATE INDEX idx_notifications_recipient_unread
ON notifications(recipient_user_id, read_at, created_at DESC);
