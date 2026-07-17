use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, rbac},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[tokio::test]
async fn system_users_page_renders_accounts_and_roles_for_admin() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("用户管理"));
    assert!(body.contains("系统管理员"));
    assert!(body.contains("系统管理"));
    assert!(body.contains("角色权限"));
    assert!(body.contains("topnav-menu"));
    assert!(body.contains(r#"data-modal-open="user-create-modal""#));
    assert!(body.contains(r#"id="user-create-modal""#));
    assert!(body.contains(r#"action="/web/system/users""#));
    assert!(body.contains(r#"data-select-search-placeholder="搜索角色""#));
    assert!(!body.contains("action-menu"));
    assert!(!body.contains("<aside class=\"sidebar\""));
}

#[tokio::test]
async fn system_users_page_paginates_with_shared_controls() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    for index in 1..=12 {
        create_user_with_role(
            &pool,
            &format!("page_user_{index:02}"),
            &format!("分页用户 {index:02}"),
            "MemberPass2026!",
            "member",
        )
        .await;
    }
    rbac::create_role(&pool, "page_viewer", "分页观察员", "self")
        .await
        .expect("role should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let first_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/users?per_page=5")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(first_page_response.status(), StatusCode::OK);
    let first_body = response_body(first_page_response).await;
    assert_eq!(first_body.matches("class=\"user-table-row\"").count(), 5);
    assert!(first_body.contains(r#"aria-label="用户列表分页""#));
    assert!(first_body.contains("当前显示 1-5"));
    assert!(first_body.contains("共 13 个用户"));
    assert!(first_body.contains("data-pagination-size"));
    assert!(first_body.contains(r#"<option value="5" selected>当前 5</option>"#));
    assert!(first_body.contains("value=\"100\""));
    assert!(first_body.contains("aria-label=\"跳转页码\""));
    assert!(first_body.contains("page=2"));
    assert!(first_body.contains("per_page=5"));
    assert!(first_body.contains(r#"name="page" value="1""#));
    assert!(first_body.contains(r#"name="per_page" value="5""#));
    assert!(first_body.contains(r#"id="user-role-modal-page_user_"#));
    assert!(first_body.contains(r#"data-select-search-placeholder="搜索角色""#));

    let third_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/users?per_page=5&page=3")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(third_page_response.status(), StatusCode::OK);
    let third_body = response_body(third_page_response).await;
    assert_eq!(third_body.matches("class=\"user-table-row\"").count(), 3);
    assert!(third_body.contains("当前显示 11-13"));
    assert!(third_body.contains(r#"aria-current="page">3</a>"#));
    assert!(third_body.contains(r#"action="/web/system/users/page_user_01/status""#));
    assert!(third_body.contains(r#"action="/web/system/users/page_user_02/role""#));
    assert!(third_body.contains(r#"action="/web/system/users/page_user_02/password""#));
    assert_pagination_fields(
        html_fragment(&third_body, r#"action="/web/system/users""#, "</form>"),
        3,
        5,
    );
    assert_pagination_fields(
        html_fragment(
            &third_body,
            r#"action="/web/system/users/page_user_01/status""#,
            "</form>",
        ),
        3,
        5,
    );
    assert_pagination_fields(
        html_fragment(
            &third_body,
            r#"action="/web/system/users/page_user_02/role""#,
            "</form>",
        ),
        3,
        5,
    );
    assert_pagination_fields(
        html_fragment(
            &third_body,
            r#"action="/web/system/users/page_user_02/password""#,
            "</form>",
        ),
        3,
        5,
    );

    let overflow_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/users?per_page=5&page=999")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(overflow_page_response.status(), StatusCode::OK);
    let overflow_body = response_body(overflow_page_response).await;
    assert_eq!(overflow_body.matches("class=\"user-table-row\"").count(), 3);
    assert!(overflow_body.contains("当前显示 11-13"));
    assert!(overflow_body.contains(r#"aria-current="page">3</a>"#));

    let status_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/page_user_01/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("status=disabled&page=3&per_page=5")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(status_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        status_response.headers().get(header::LOCATION).unwrap(),
        "/web/system/users?page=3&per_page=5"
    );

    let role_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/page_user_02/role")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "role_code=page_viewer&page=3&per_page=5",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(role_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        role_response.headers().get(header::LOCATION).unwrap(),
        "/web/system/users?page=3&per_page=5"
    );

    let password_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/page_user_02/password")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "password=MemberPass2027%21&page=3&per_page=5",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(password_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        password_response.headers().get(header::LOCATION).unwrap(),
        "/web/system/users?page=3&per_page=5"
    );

    let invalid_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "username=bad_page_user&display_name=%E9%94%99%E8%AF%AF%E5%88%86%E9%A1%B5&email=badpage%40example.test&mobile=13800000009&password=MemberPass2026%21&role_code=member&page=0&per_page=5",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_create_response.status(), StatusCode::BAD_REQUEST);
    let invalid_created =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE username = 'bad_page_user'")
            .fetch_one(&pool)
            .await
            .expect("user count should load");
    assert_eq!(invalid_created, 0);

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "username=page_user_new&display_name=%E5%88%86%E9%A1%B5%E6%96%B0%E7%94%A8%E6%88%B7&email=page-new%40example.test&mobile=13800000010&password=MemberPass2026%21&role_code=member&page=3&per_page=5",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        create_response.headers().get(header::LOCATION).unwrap(),
        "/web/system/users?per_page=5"
    );
    assert_eq!(user_role_code(&pool, "page_user_new").await, "member");

    let invalid_page_response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users?page=0&per_page=5")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_page_response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn admin_can_create_member_user_and_member_can_login() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "username=member1&display_name=%E6%88%90%E5%91%98%E4%B8%80&email=member1%40example.test&mobile=13800000001&password=MemberPass2026%21&role_code=member",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/system/users"
    );

    let role = user_role_code(&pool, "member1").await;
    assert_eq!(role, "member");

    let session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("created member should login");
    assert!(!session.raw_token.is_empty());
}

#[tokio::test]
async fn user_create_rejects_invalid_contact_duplicate_username_and_inactive_role() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    rbac::create_role(&pool, "inactive_role", "停用角色", "self")
        .await
        .expect("role should create");
    rbac::set_role_status(&pool, "inactive_role", "disabled")
        .await
        .expect("role should disable");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let invalid_email = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "username=bademail&display_name=%E9%82%AE%E7%AE%B1%E9%94%99%E8%AF%AF&email=invalid-email&mobile=13800000001&password=MemberPass2026%21&role_code=member",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_email.status(), StatusCode::BAD_REQUEST);

    let invalid_mobile = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "username=badmobile&display_name=%E6%89%8B%E6%9C%BA%E9%94%99%E8%AF%AF&email=badmobile%40example.test&mobile=1380000abc&password=MemberPass2026%21&role_code=member",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_mobile.status(), StatusCode::BAD_REQUEST);

    let inactive_role = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "username=inactiverole&display_name=%E5%81%9C%E7%94%A8%E8%A7%92%E8%89%B2&email=inactiverole%40example.test&mobile=13800000001&password=MemberPass2026%21&role_code=inactive_role",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(inactive_role.status(), StatusCode::BAD_REQUEST);

    create_user_with_role(&pool, "duplicate1", "重复用户", "MemberPass2026!", "member").await;
    let duplicate = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "username=duplicate1&display_name=%E9%87%8D%E5%A4%8D%E7%94%A8%E6%88%B7&email=duplicate%40example.test&mobile=13800000001&password=MemberPass2026%21&role_code=member",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(duplicate.status(), StatusCode::CONFLICT);
}

#[tokio::test]
async fn disabled_user_loses_existing_session() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let member_session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/member1/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("status=disabled")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, member_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login"
    );
}

#[tokio::test]
async fn locked_user_loses_session_and_cannot_login_until_unlocked() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let member_session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let lock_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/users/member1/status")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"locked"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(lock_response.status(), StatusCode::OK);
    assert!(
        response_body(lock_response)
            .await
            .contains(r#""status":"locked""#)
    );

    let page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(page_response.status(), StatusCode::OK);
    let page_body = response_body(page_response).await;
    assert!(page_body.contains("锁定"));
    assert!(page_body.contains("解锁"));
    assert!(
        page_body.contains(r#"action="/web/system/users/member1/status" data-confirm-submit-form"#)
    );
    assert!(page_body.contains("确认解锁用户"));

    let stale_session_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, member_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(stale_session_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        stale_session_response
            .headers()
            .get(header::LOCATION)
            .unwrap(),
        "/web/login"
    );

    let locked_login = auth::login(&pool, "member1", "MemberPass2026!").await;
    assert!(locked_login.is_err());

    let unlock_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/member1/status")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(with_csrf("status=active")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(unlock_response.status(), StatusCode::SEE_OTHER);
    let unlocked_login = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("unlocked user should login");
    assert!(!unlocked_login.raw_token.is_empty());
}

#[tokio::test]
async fn resetting_password_revokes_old_sessions_and_allows_new_password() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let member_session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/member1/password")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("password=MemberPass2027%21")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, member_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let old_login = auth::login(&pool, "member1", "MemberPass2026!").await;
    assert!(old_login.is_err());
    let new_login = auth::login(&pool, "member1", "MemberPass2027!")
        .await
        .expect("new password should login");
    assert!(!new_login.raw_token.is_empty());
}

#[tokio::test]
async fn super_admin_cannot_be_disabled_or_downgraded() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let disable_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/admin/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("status=disabled")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(disable_response.status(), StatusCode::BAD_REQUEST);

    let downgrade_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/admin/role")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("role_code=member")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(downgrade_response.status(), StatusCode::BAD_REQUEST);

    let (status, is_super_admin, role_code) = sqlx::query_as::<_, (String, i64, String)>(
        r#"
        SELECT u.status, u.is_super_admin, r.role_code
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.username = 'admin'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("admin should load");
    assert_eq!(status, "active");
    assert_eq!(is_super_admin, 1);
    assert_eq!(role_code, "system_admin");
}

#[tokio::test]
async fn regular_member_cannot_access_system_users_page() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let cookie = auth::session_cookie_header(&session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users?page=2&per_page=5")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn admin_can_replace_regular_user_role() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    rbac::create_role(&pool, "system_viewer", "系统观察员", "self")
        .await
        .expect("role should create");
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/member1/role")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("role_code=system_viewer")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let role = user_role_code(&pool, "member1").await;
    assert_eq!(role, "system_viewer");
}

#[tokio::test]
async fn custom_role_can_receive_permissions_and_drive_system_nav() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_role_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "role_code=system_viewer&role_name=%E7%B3%BB%E7%BB%9F%E8%A7%82%E5%AF%9F%E5%91%98&data_scope_type=self",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_role_response.status(), StatusCode::SEE_OTHER);

    let permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/roles/system_viewer/permissions")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(permissions_response.status(), StatusCode::OK);
    let permissions_body = response_body(permissions_response).await;
    assert!(permissions_body.contains("系统观察员"));
    assert!(permissions_body.contains("system.users.view"));

    let workbench_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/roles?role=system_viewer")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(workbench_response.status(), StatusCode::OK);
    let workbench_body = response_body(workbench_response).await;
    assert!(workbench_body.contains("role-workbench"));
    assert!(workbench_body.contains("role-list"));
    assert!(workbench_body.contains(r#"data-modal-open="role-create-modal""#));
    assert!(workbench_body.contains(r#"id="role-create-modal""#));
    assert!(workbench_body.contains(r#"role="dialog""#));
    assert!(workbench_body.contains(r#"action="/web/system/roles""#));
    assert!(
        workbench_body.contains(
            r#"action="/web/system/roles/system_viewer/status" data-confirm-submit-form"#
        )
    );
    assert!(workbench_body.contains("确认禁用角色"));
    assert!(workbench_body.contains(r#"class="role-status-form""#));
    assert!(
        workbench_body.contains(r#"class="btn btn-sm btn-secondary" type="submit">禁用</button>"#)
    );
    assert!(!workbench_body.contains("role-status-button"));
    assert!(!workbench_body.contains("role-create-form"));
    assert!(workbench_body.contains("data-permission-tree"));
    assert!(workbench_body.contains("data-permission-group-key=\"system\""));
    assert!(workbench_body.contains("查看用户管理"));
    assert!(workbench_body.contains("管理用户"));

    let update_permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/system_viewer/permissions")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("permission_keys=system.users.view")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(update_permissions_response.status(), StatusCode::SEE_OTHER);

    create_user_with_role(
        &pool,
        "viewer1",
        "观察员一",
        "ViewerPass2026!",
        "system_viewer",
    )
    .await;
    let viewer_session = auth::login(&pool, "viewer1", "ViewerPass2026!")
        .await
        .expect("viewer should login");
    let viewer_cookie = auth::session_cookie_header(&viewer_session.raw_token, false);

    let users_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, viewer_cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(users_response.status(), StatusCode::OK);
    let users_body = response_body(users_response).await;
    assert!(users_body.contains("用户管理"));
    assert!(users_body.contains("/web/system/users"));
    assert!(!users_body.contains("/web/system/roles"));
    assert!(!users_body.contains("/web/system/storage"));
    assert!(!users_body.contains("/web/system/database-stats"));

    let roles_response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/roles")
                .header(header::COOKIE, viewer_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(roles_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn system_roles_page_paginates_with_shared_controls() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    for index in 1..=12 {
        rbac::create_role(
            &pool,
            &format!("page_role_{index:02}"),
            &format!("分页角色 {index:02}"),
            "self",
        )
        .await
        .expect("role should create");
    }
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let first_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/roles?per_page=5")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(first_page_response.status(), StatusCode::OK);
    let first_body = response_body(first_page_response).await;
    assert_eq!(first_body.matches("class=\"role-list-row").count(), 5);
    assert!(first_body.contains(r#"aria-label="角色列表分页""#));
    assert!(first_body.contains("当前显示 1-5"));
    assert!(first_body.contains("共 14 个角色"));
    assert!(first_body.contains("data-pagination-size"));
    assert!(first_body.contains("value=\"100\""));
    assert!(first_body.contains("aria-label=\"跳转页码\""));
    assert!(first_body.contains("role=system_admin"));
    assert!(first_body.contains("page=2"));
    assert!(first_body.contains("per_page=5"));
    assert!(first_body.contains(r#"name="page" value="1""#));
    assert!(first_body.contains(r#"name="per_page" value="5""#));

    let third_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/roles?per_page=5&page=3")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(third_page_response.status(), StatusCode::OK);
    let third_body = response_body(third_page_response).await;
    assert_eq!(third_body.matches("class=\"role-list-row").count(), 4);
    assert!(third_body.contains("当前显示 11-14"));
    assert!(third_body.contains(r#"aria-current="page">3</a>"#));

    let selected_cross_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/roles?role=page_role_12&per_page=5&page=1")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(selected_cross_page_response.status(), StatusCode::OK);
    let selected_cross_page_body = response_body(selected_cross_page_response).await;
    assert!(selected_cross_page_body.contains("当前角色：分页角色 12"));

    let status_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/page_role_12/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("status=disabled&page=3&per_page=5")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(status_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        status_response.headers().get(header::LOCATION).unwrap(),
        "/web/system/roles?role=page_role_12&page=3&per_page=5"
    );

    let permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/page_role_12/permissions")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "permission_keys=system.users.view&page=3&per_page=5",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(permissions_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        permissions_response
            .headers()
            .get(header::LOCATION)
            .unwrap(),
        "/web/system/roles?role=page_role_12&page=3&per_page=5"
    );

    let invalid_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "role_code=page_role_bad&role_name=%E9%94%99%E8%AF%AF%E5%88%86%E9%A1%B5&data_scope_type=self&page=0&per_page=5",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_create_response.status(), StatusCode::BAD_REQUEST);
    let invalid_created = rbac::find_role(&pool, "page_role_bad")
        .await
        .expect("role lookup should succeed");
    assert!(invalid_created.is_none());

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "role_code=page_role_new&role_name=%E5%88%86%E9%A1%B5%E6%96%B0%E8%A7%92%E8%89%B2&data_scope_type=self&page=1&per_page=5",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        create_response.headers().get(header::LOCATION).unwrap(),
        "/web/system/roles?role=page_role_new&page=3&per_page=5"
    );

    let invalid_page_response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/roles?page=0&per_page=5")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_page_response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn role_permission_update_adds_parent_page_for_action_permission() {
    let pool = test_pool().await;
    rbac::seed_core(&pool)
        .await
        .expect("rbac core seed should run");
    rbac::create_role(&pool, "operator", "运营", "self")
        .await
        .expect("role should create");

    rbac::replace_role_permissions(&pool, "operator", &["system.users.manage".to_string()])
        .await
        .expect("permissions should replace");

    let permissions = rbac::list_permissions_for_role(&pool, Some("operator"))
        .await
        .expect("permissions should load");
    let granted = permissions
        .into_iter()
        .filter(|permission| permission.granted)
        .map(|permission| permission.permission_key)
        .collect::<Vec<_>>();

    assert!(granted.contains(&"system.users.manage".to_string()));
    assert!(granted.contains(&"system.users.view".to_string()));
}

#[tokio::test]
async fn system_role_permissions_cannot_be_modified_from_page() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/member/permissions")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("permission_keys=project.view")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn role_status_controls_assigned_permissions() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    rbac::create_role(&pool, "system_viewer", "系统观察员", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(&pool, "system_viewer", &["system.users.view".to_string()])
        .await
        .expect("permissions should replace");
    create_user_with_role(
        &pool,
        "viewer1",
        "观察员一",
        "ViewerPass2026!",
        "system_viewer",
    )
    .await;
    let viewer_session = auth::login(&pool, "viewer1", "ViewerPass2026!")
        .await
        .expect("viewer should login");
    let viewer_cookie = auth::session_cookie_header(&viewer_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/system_viewer/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("status=disabled")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, viewer_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn system_database_stats_page_renders_cache_shell_for_admin() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/database-stats")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("数据库统计"));
    assert!(body.contains(r#"data-database-stats-page"#));
    assert!(body.contains(r#"data-api-url="/api/v1/system/database-stats""#));
    assert!(body.contains("浏览器暂无缓存"));
    assert!(body.contains(r#"href="/web/system/database-stats""#));
}

#[tokio::test]
async fn api_system_database_stats_requires_permission_and_returns_snapshot() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(
        &pool,
        "stats_member",
        "统计成员",
        "StatsPass2026!",
        "member",
    )
    .await;
    let regular_session = auth::login(&pool, "stats_member", "StatsPass2026!")
        .await
        .expect("member should login");
    let regular_cookie = auth::session_cookie_header(&regular_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let success_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/database-stats")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(success_response.status(), StatusCode::OK);
    let success_body = response_body(success_response).await;
    assert!(success_body.contains(r#""table_name":"users""#));
    assert!(success_body.contains(r#""remark":"用户账号""#));
    assert!(success_body.contains(r#""table_name":"refresh_sessions""#));

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/database-stats")
                .header(header::COOKIE, regular_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_system_user_management_flow_uses_rbac_and_csrf() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let regular_user_id = create_user_with_role(
        &pool,
        "api_regular",
        "API 普通用户",
        "RegularPass2026!",
        "member",
    )
    .await;
    let regular_session = auth::issue_session(&pool, regular_user_id, 3600)
        .await
        .expect("session should issue");
    let regular_cookie = auth::session_cookie_header(&regular_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/users")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"username":"api_member","display_name":"API 成员","email":"api@example.test","mobile":"13800138000","password":"MemberPass2026!","role_code":"member"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::CREATED);
    let create_body = response_body(create_response).await;
    assert!(create_body.contains(r#""username":"api_member""#));
    assert!(create_body.contains(r#""role_code":"member""#));

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/users")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = response_body(list_response).await;
    assert!(list_body.contains("api_member"));
    assert!(!list_body.contains("MemberPass2026!"));

    let disable_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/users/api_member/status")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"disabled"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(disable_response.status(), StatusCode::OK);
    assert!(
        response_body(disable_response)
            .await
            .contains(r#""status":"disabled""#)
    );

    let reset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/users/api_member/password")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"password":"NewMemberPass2026!"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reset_response.status(), StatusCode::OK);
    assert!(
        !response_body(reset_response)
            .await
            .contains("NewMemberPass2026!")
    );

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/users")
                .header(header::COOKIE, regular_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_system_role_permissions_flow_matches_permission_tree_model() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/roles")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"role_code":"api_viewer","role_name":"API 观察员","data_scope_type":"self"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::CREATED);
    assert!(
        response_body(create_response)
            .await
            .contains(r#""role_code":"api_viewer""#)
    );

    let permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/roles/api_viewer/permissions")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"permission_keys":["system.users.manage"]}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(permissions_response.status(), StatusCode::OK);
    let permissions_body = response_body(permissions_response).await;
    assert!(permissions_body.contains(r#""permission_key":"system.users.manage""#));
    assert!(permissions_body.contains(r#""permission_key":"system.users.view""#));
    assert!(permissions_body.contains(r#""granted":true"#));

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/roles")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    assert!(response_body(list_response).await.contains("api_viewer"));

    let system_role_response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/roles/member/permissions")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"permission_keys":["system.users.view"]}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(system_role_response.status(), StatusCode::BAD_REQUEST);
}

async fn bootstrap_admin_session(pool: &sqlx::SqlitePool) -> InitializedAdmin {
    let result = bootstrap::bootstrap_init(
        pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");

    InitializedAdmin {
        cookie: auth::session_cookie_header(&result.session.raw_token, false),
    }
}

struct InitializedAdmin {
    cookie: String,
}

async fn create_user_with_role(
    pool: &sqlx::SqlitePool,
    username: &str,
    display_name: &str,
    password: &str,
    role_code: &str,
) -> i64 {
    let password_hash = auth::hash_password(password).expect("password should hash");
    let user_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO users (
            username,
            password_hash,
            display_name,
            status,
            is_super_admin
        )
        VALUES (?1, ?2, ?3, 'active', 0)
        RETURNING id
        "#,
    )
    .bind(username)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(pool)
    .await
    .expect("user should create");

    let mut tx = pool.begin().await.expect("tx should begin");
    rbac::assign_role_to_user(&mut tx, user_id, role_code)
        .await
        .expect("role should assign");
    tx.commit().await.expect("tx should commit");

    user_id
}

async fn user_role_code(pool: &sqlx::SqlitePool, username: &str) -> String {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT r.role_code
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.username = ?1
        "#,
    )
    .bind(username)
    .fetch_one(pool)
    .await
    .expect("role code should load")
}

async fn response_body(response: axum::response::Response) -> String {
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    std::str::from_utf8(&body)
        .expect("body should be utf-8")
        .to_string()
}

fn html_fragment<'a>(body: &'a str, marker: &str, closing: &str) -> &'a str {
    let start = body.find(marker).expect("fragment marker should exist");
    let tail = &body[start..];
    let end = tail.find(closing).expect("fragment closing should exist") + closing.len();
    &tail[..end]
}

fn assert_pagination_fields(fragment: &str, page: i64, per_page: i64) {
    assert!(fragment.contains(&format!(r#"name="page" value="{page}""#)));
    assert!(fragment.contains(&format!(r#"name="per_page" value="{per_page}""#)));
}

async fn test_pool() -> sqlx::SqlitePool {
    let settings = test_settings();
    let pool = db::connect_pool(&settings)
        .await
        .expect("pool should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    pool
}

fn test_settings() -> Settings {
    Settings {
        http_addr: "127.0.0.1:33033"
            .parse()
            .expect("test socket address should parse"),
        database_url: "sqlite::memory:".to_string(),
        data_dir: "data".to_string(),
        session_secret: "test-session-secret".to_string(),
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key".to_string(),
        onlyoffice_document_server_url: String::new(),
        onlyoffice_jwt_secret: String::new(),
    }
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; yuance_csrf={CSRF_TOKEN}")
}

fn with_csrf(body: &str) -> String {
    format!("{body}&_csrf={CSRF_TOKEN}")
}
