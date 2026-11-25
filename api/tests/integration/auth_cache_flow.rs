//! 请求级会话校验缓存（体检 T011 后半）：同一请求内复用会话校验结果，写操作后失效。

use yuance_api::domains::{auth, users};

use crate::support::{bootstrap_admin_session, test_pool};

#[tokio::test]
async fn session_lookup_is_reused_within_a_request_and_invalidated_by_writes() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    let session = auth::issue_session(&pool, admin.user_id, 3600)
        .await
        .expect("session");
    let raw = session.raw_token.clone();

    auth::with_request_auth_cache(async {
        assert!(
            auth::user_from_raw_session(&pool, &raw)
                .await
                .unwrap()
                .is_some()
        );
        // 绕过领域函数直接改库：同一请求内仍命中缓存，证明没有重复查询。
        sqlx::query("UPDATE sessions SET session_status = 'revoked'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            auth::user_from_raw_session(&pool, &raw)
                .await
                .unwrap()
                .is_some()
        );
        // 领域写操作清空缓存，之后读到最新状态。
        auth::invalidate_request_auth_cache();
        assert!(
            auth::user_from_raw_session(&pool, &raw)
                .await
                .unwrap()
                .is_none()
        );
    })
    .await;

    // 作用域外不缓存。
    let fresh = auth::issue_session(&pool, admin.user_id, 3600)
        .await
        .expect("session");
    assert!(
        auth::user_from_raw_session(&pool, &fresh.raw_token)
            .await
            .unwrap()
            .is_some()
    );
    sqlx::query("UPDATE sessions SET session_status = 'revoked'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        auth::user_from_raw_session(&pool, &fresh.raw_token)
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn profile_and_session_writes_invalidate_the_request_cache() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    let session = auth::issue_session(&pool, admin.user_id, 3600)
        .await
        .expect("session");
    let raw = session.raw_token.clone();

    auth::with_request_auth_cache(async {
        let before = auth::user_from_raw_session(&pool, &raw)
            .await
            .unwrap()
            .unwrap();
        users::update_own_profile(
            &pool,
            admin.user_id,
            users::UpdateOwnProfileInput {
                display_name: "缓存后的新名字".to_string(),
                email: String::new(),
                mobile: String::new(),
            },
        )
        .await
        .expect("profile update");
        let after = auth::user_from_raw_session(&pool, &raw)
            .await
            .unwrap()
            .unwrap();
        assert_ne!(before.display_name, after.display_name);
        assert_eq!(after.display_name, "缓存后的新名字");

        auth::revoke_session(&pool, &raw, "logout")
            .await
            .expect("revoke");
        assert!(
            auth::user_from_raw_session(&pool, &raw)
                .await
                .unwrap()
                .is_none()
        );
    })
    .await;
}
