use std::{collections::BTreeSet, sync::OnceLock};

use tokio::sync::broadcast;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserRealtimeEvent {
    pub user_ids: Vec<i64>,
    pub kind: &'static str,
}

const USER_REALTIME_KIND_TOPBAR: &str = "topbar";
const USER_REALTIME_CHANNEL_SIZE: usize = 256;

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

#[cfg(test)]
mod tests {
    use super::{publish_topbar_refresh_for_users, subscribe_user_realtime};

    #[tokio::test]
    async fn publish_topbar_refresh_deduplicates_user_ids() {
        let mut receiver = subscribe_user_realtime();
        publish_topbar_refresh_for_users([3, 3, -1, 2]);

        let event = receiver.recv().await.expect("event should be published");
        assert_eq!(event.kind, "topbar");
        assert_eq!(event.user_ids, vec![2, 3]);
    }
}
