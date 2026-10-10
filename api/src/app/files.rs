use crate::{
    app::FilesCommand,
    domains::files,
    platform::{
        config::Settings,
        db,
        error::{AppError, AppResult},
    },
};

pub async fn run(command: FilesCommand) -> AppResult<()> {
    let settings = Settings::from_env()?;
    let pool = db::connect_pool(&settings).await?;

    match command {
        FilesCommand::CleanupPending {
            dry_run,
            older_than_hours,
        } => {
            let summary =
                files::cleanup_pending_file_objects(&pool, older_than_hours, dry_run).await?;
            if dry_run {
                println!(
                    "pending file cleanup dry-run: matched={} older_than_hours={}",
                    summary.matched_count, older_than_hours
                );
            } else {
                println!(
                    "pending file cleanup applied: matched={} deleted={} older_than_hours={}",
                    summary.matched_count, summary.deleted_count, older_than_hours
                );
            }
        }
        FilesCommand::AuditObjects { include_deleted } => {
            let summary = files::audit_file_objects(&pool, include_deleted).await?;
            println!(
                "file object audit: total={} attached={} orphan={} pending_orphan={} uploaded_orphan={} deleted_orphan={} include_deleted={}",
                summary.total_count,
                summary.attached_count,
                summary.orphan_count,
                summary.pending_orphan_count,
                summary.uploaded_orphan_count,
                summary.deleted_orphan_count,
                summary.include_deleted
            );
        }
        FilesCommand::DeletionJobs { limit } => {
            let jobs = files::list_open_file_object_deletion_jobs(&pool, limit).await?;
            println!("deleted file cleanup jobs: count={}", jobs.len());
            for job in jobs {
                let message = job
                    .last_error
                    .chars()
                    .map(|character| {
                        if character.is_control() {
                            ' '
                        } else {
                            character
                        }
                    })
                    .take(500)
                    .collect::<String>();
                let message = serde_json::to_string(&message)
                    .unwrap_or_else(|_| "\"<error unavailable>\"".to_string());
                println!(
                    "job_id={} file_object_id={} status={} attempts={} next_attempt_at={} last_error={}",
                    job.id,
                    job.file_object_id,
                    job.status,
                    job.attempt_count,
                    job.next_attempt_at,
                    message
                );
            }
        }
        FilesCommand::CleanupDeleted { dry_run, limit } => {
            let summary =
                files::cleanup_deleted_file_objects(&pool, &settings, dry_run, limit).await?;
            if dry_run {
                println!(
                    "deleted file cleanup dry-run: due={} not_due={} limit={} pending={}",
                    summary.due_count, summary.not_due_count, limit, summary.pending_count
                );
            } else {
                println!(
                    "deleted file cleanup applied: due={} not_due={} processed={} completed={} failed={} lease_lost={} pending={}",
                    summary.due_count,
                    summary.not_due_count,
                    summary.processed_count,
                    summary.completed_count,
                    summary.failed_count,
                    summary.lease_lost_count,
                    summary.pending_count
                );
                if summary.failed_count > 0 || summary.lease_lost_count > 0 {
                    return Err(AppError::BadRequest(
                        "部分对象清理任务未完成；运行 files deletion-jobs 查看诊断，修复后重试"
                            .to_string(),
                    ));
                }
            }
        }
    }

    Ok(())
}
