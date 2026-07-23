use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use tokio::sync::broadcast;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserRealtimeEvent {
    pub user_ids: Vec<i64>,
    pub kind: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemRealtimeEvent {
    pub item_key: String,
    pub kind: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemTypingUser {
    pub user_id: i64,
    pub display_name: String,
}

const USER_REALTIME_KIND_TOPBAR: &str = "topbar";
const USER_REALTIME_CHANNEL_SIZE: usize = 256;
const WORK_ITEM_REALTIME_KIND_DISCUSSION_REFRESH: &str = "discussion-refresh";
const WORK_ITEM_REALTIME_KIND_TYPING: &str = "typing";
const WORK_ITEM_REALTIME_CHANNEL_SIZE: usize = 256;
const WORK_ITEM_TYPING_TTL: Duration = Duration::from_secs(15);

fn realtime_sender() -> &'static broadcast::Sender<UserRealtimeEvent> {
    static USER_REALTIME_SENDER: OnceLock<broadcast::Sender<UserRealtimeEvent>> = OnceLock::new();
    USER_REALTIME_SENDER.get_or_init(|| {
        let (sender, _receiver) = broadcast::channel(USER_REALTIME_CHANNEL_SIZE);
        sender
    })
}

pub fn subscribe_user_realtime() -> broadcast::Receiver<UserRealtimeEvent> {
    realtime_sender().subscribe()
}

fn work_item_realtime_sender() -> &'static broadcast::Sender<WorkItemRealtimeEvent> {
    static WORK_ITEM_REALTIME_SENDER: OnceLock<broadcast::Sender<WorkItemRealtimeEvent>> =
        OnceLock::new();
    WORK_ITEM_REALTIME_SENDER.get_or_init(|| {
        let (sender, _receiver) = broadcast::channel(WORK_ITEM_REALTIME_CHANNEL_SIZE);
        sender
    })
}

pub fn subscribe_work_item_realtime() -> broadcast::Receiver<WorkItemRealtimeEvent> {
    work_item_realtime_sender().subscribe()
}

#[derive(Debug, Clone)]
struct TypingPresenceEntry {
    user_id: i64,
    display_name: String,
    expires_at: Instant,
}

type WorkItemTypingPresence = HashMap<String, HashMap<String, TypingPresenceEntry>>;

fn work_item_typing_presence() -> &'static Mutex<WorkItemTypingPresence> {
    static WORK_ITEM_TYPING_PRESENCE: OnceLock<Mutex<WorkItemTypingPresence>> = OnceLock::new();
    WORK_ITEM_TYPING_PRESENCE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn publish_topbar_refresh_for_user(user_id: i64) {
    publish_topbar_refresh_for_users([user_id]);
}

pub fn publish_topbar_refresh_for_users<I>(user_ids: I)
where
    I: IntoIterator<Item = i64>,
{
    let user_ids = normalized_user_ids(user_ids);
    if user_ids.is_empty() {
        return;
    }

    let _ = realtime_sender().send(UserRealtimeEvent {
        user_ids,
        kind: USER_REALTIME_KIND_TOPBAR,
    });
}

pub fn publish_work_item_discussion_refresh(item_key: &str) {
    let item_key = normalized_item_key(item_key);
    if item_key.is_empty() {
        return;
    }

    let _ = work_item_realtime_sender().send(WorkItemRealtimeEvent {
        item_key,
        kind: WORK_ITEM_REALTIME_KIND_DISCUSSION_REFRESH,
    });
}

pub fn update_work_item_typing_presence(
    item_key: &str,
    client_id: &str,
    user_id: i64,
    display_name: &str,
    active: bool,
) -> Vec<WorkItemTypingUser> {
    let item_key = normalized_item_key(item_key);
    let client_id = normalized_client_id(client_id);
    if item_key.is_empty() || client_id.is_empty() || user_id <= 0 {
        return Vec::new();
    }

    let mut store = work_item_typing_presence()
        .lock()
        .expect("work item typing presence mutex should not be poisoned");
    cleanup_expired_typing_presence(&mut store);

    if active {
        store.entry(item_key.clone()).or_default().insert(
            client_id,
            TypingPresenceEntry {
                user_id,
                display_name: normalized_display_name(display_name, user_id),
                expires_at: Instant::now() + WORK_ITEM_TYPING_TTL,
            },
        );
    } else if let Some(item_entries) = store.get_mut(&item_key) {
        item_entries.remove(&client_id);
        if item_entries.is_empty() {
            store.remove(&item_key);
        }
    }

    let snapshot = typing_snapshot_for_item(&mut store, &item_key, None);
    let _ = work_item_realtime_sender().send(WorkItemRealtimeEvent {
        item_key,
        kind: WORK_ITEM_REALTIME_KIND_TYPING,
    });
    snapshot
}

pub fn work_item_typing_snapshot_for_user(
    item_key: &str,
    exclude_user_id: i64,
) -> Vec<WorkItemTypingUser> {
    let item_key = normalized_item_key(item_key);
    if item_key.is_empty() {
        return Vec::new();
    }

    let mut store = work_item_typing_presence()
        .lock()
        .expect("work item typing presence mutex should not be poisoned");
    cleanup_expired_typing_presence(&mut store);
    typing_snapshot_for_item(
        &mut store,
        &item_key,
        if exclude_user_id > 0 {
            Some(exclude_user_id)
        } else {
            None
        },
    )
}

fn normalized_user_ids<I>(user_ids: I) -> Vec<i64>
where
    I: IntoIterator<Item = i64>,
{
    user_ids
        .into_iter()
        .filter(|user_id| *user_id > 0)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn normalized_item_key(item_key: &str) -> String {
    item_key.trim().to_string()
}

fn normalized_client_id(client_id: &str) -> String {
    client_id
        .trim()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'))
        .take(128)
        .collect()
}

fn normalized_display_name(display_name: &str, user_id: i64) -> String {
    let normalized = display_name.trim();
    if normalized.is_empty() {
        return format!("用户{user_id}");
    }
    normalized.chars().take(64).collect()
}

fn cleanup_expired_typing_presence(store: &mut WorkItemTypingPresence) {
    let now = Instant::now();
    store.retain(|_, item_entries| {
        item_entries.retain(|_, entry| entry.expires_at > now);
        !item_entries.is_empty()
    });
}

fn typing_snapshot_for_item(
    store: &mut WorkItemTypingPresence,
    item_key: &str,
    exclude_user_id: Option<i64>,
) -> Vec<WorkItemTypingUser> {
    let Some(item_entries) = store.get_mut(item_key) else {
        return Vec::new();
    };

    let now = Instant::now();
    item_entries.retain(|_, entry| entry.expires_at > now);
    if item_entries.is_empty() {
        store.remove(item_key);
        return Vec::new();
    }

    let mut users = BTreeMap::new();
    for entry in item_entries.values() {
        if exclude_user_id == Some(entry.user_id) {
            continue;
        }
        users
            .entry(entry.user_id)
            .or_insert_with(|| entry.display_name.clone());
    }

    users
        .into_iter()
        .map(|(user_id, display_name)| WorkItemTypingUser {
            user_id,
            display_name,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        WorkItemTypingUser, publish_topbar_refresh_for_users, publish_work_item_discussion_refresh,
        subscribe_user_realtime, subscribe_work_item_realtime, update_work_item_typing_presence,
        work_item_typing_snapshot_for_user,
    };

    #[tokio::test]
    async fn publish_topbar_refresh_deduplicates_user_ids() {
        let mut receiver = subscribe_user_realtime();
        publish_topbar_refresh_for_users([3, 3, -1, 2]);

        let event = receiver.recv().await.expect("event should be published");
        assert_eq!(event.kind, "topbar");
        assert_eq!(event.user_ids, vec![2, 3]);
    }

    #[tokio::test]
    async fn publish_work_item_discussion_refresh_emits_item_scoped_event() {
        let item_key = "TEST-REALTIME-ITEM";
        let mut receiver = subscribe_work_item_realtime();
        publish_work_item_discussion_refresh(item_key);

        loop {
            let event = receiver.recv().await.expect("event should be published");
            if event.kind == "discussion-refresh" && event.item_key == item_key {
                break;
            }
        }
    }

    #[test]
    fn work_item_typing_presence_deduplicates_users_and_cleans_up_removed_clients() {
        let item_key = "TEST-TYPING-ITEM";
        update_work_item_typing_presence(item_key, "client-a", 7, "张三", true);
        update_work_item_typing_presence(item_key, "client-b", 7, "张三", true);
        update_work_item_typing_presence(item_key, "client-c", 8, "李四", true);

        let visible_to_zhangsan = work_item_typing_snapshot_for_user(item_key, 7);
        assert_eq!(
            visible_to_zhangsan,
            vec![WorkItemTypingUser {
                user_id: 8,
                display_name: "李四".to_string(),
            }]
        );

        let visible_to_all = work_item_typing_snapshot_for_user(item_key, 0);
        assert_eq!(
            visible_to_all,
            vec![
                WorkItemTypingUser {
                    user_id: 7,
                    display_name: "张三".to_string(),
                },
                WorkItemTypingUser {
                    user_id: 8,
                    display_name: "李四".to_string(),
                },
            ]
        );

        update_work_item_typing_presence(item_key, "client-a", 7, "张三", false);
        update_work_item_typing_presence(item_key, "client-b", 7, "张三", false);
        assert_eq!(
            work_item_typing_snapshot_for_user(item_key, 0),
            vec![WorkItemTypingUser {
                user_id: 8,
                display_name: "李四".to_string(),
            }]
        );

        update_work_item_typing_presence(item_key, "client-c", 8, "李四", false);
        assert!(work_item_typing_snapshot_for_user(item_key, 0).is_empty());
    }
}
