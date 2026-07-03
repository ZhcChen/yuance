use crate::{
    app::FilesCommand,
    domains::files,
    platform::{config::Settings, db, error::AppResult},
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
    }

    Ok(())
}
