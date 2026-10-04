mod application;
mod infrastructure;

use application::{MovieFile, ScanMovieFiles};
use explorer_scan_job::{ScanRegistry, TerminalState};
use infrastructure::FsMovieScanner;
use tauri::{Emitter, State};

const MOVIE_SCAN_EVENT: &str = "movie-scan-event";

#[derive(Clone, serde::Serialize)]
struct MovieScanEvent {
    #[serde(rename = "scanId")]
    scan_id: String,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    item: Option<MovieFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn terminal_event(
    scan_id: String,
    state: TerminalState,
    result: &Result<(), String>,
) -> MovieScanEvent {
    match state {
        TerminalState::Completed => MovieScanEvent {
            scan_id,
            status: "completed",
            item: None,
            error: None,
        },
        TerminalState::Cancelled => MovieScanEvent {
            scan_id,
            status: "cancelled",
            item: None,
            error: None,
        },
        TerminalState::Failed => MovieScanEvent {
            scan_id,
            status: "failed",
            item: None,
            error: Some(
                result
                    .as_ref()
                    .err()
                    .cloned()
                    .unwrap_or_else(|| "Movie scan failed.".into()),
            ),
        },
    }
}

#[derive(serde::Serialize)]
struct AppInfo {
    name: String,
    version: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "Movie Explorer".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
async fn scan_movie_files(
    root_path: String,
    include_patterns: Vec<String>,
) -> Result<Vec<MovieFile>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_movie_files_sync(root_path, include_patterns))
        .await
        .map_err(|error| format!("Movie scan task failed: {error}"))?
}

fn scan_movie_files_sync(
    root_path: String,
    include_patterns: Vec<String>,
) -> Result<Vec<MovieFile>, String> {
    ScanMovieFiles::new(FsMovieScanner).run(root_path, include_patterns)
}

#[tauri::command]
fn start_movie_scan(
    app: tauri::AppHandle,
    registry: State<'_, ScanRegistry>,
    scan_id: String,
    root_path: String,
    include_patterns: Vec<String>,
) -> Result<(), String> {
    if scan_id.is_empty() {
        return Err("Scan ID is required.".into());
    }
    let job = registry
        .register(scan_id.clone())
        .map_err(|_| "Scan ID is already active.".to_string())?;
    let token = job.token();
    tauri::async_runtime::spawn(async move {
        let worker_app = app.clone();
        let worker_scan_id = scan_id.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            ScanMovieFiles::new(FsMovieScanner).stream(
                root_path,
                include_patterns,
                &|| token.is_cancelled(),
                &mut |file| {
                    worker_app
                        .emit(
                            MOVIE_SCAN_EVENT,
                            MovieScanEvent {
                                scan_id: worker_scan_id.clone(),
                                status: "item",
                                item: Some(file),
                                error: None,
                            },
                        )
                        .map_err(|error| format!("Failed to emit movie scan item: {error}"))
                },
            )
        })
        .await
        .map_err(|error| format!("Movie scan task failed: {error}"))
        .and_then(|result| result);
        let state = job.finish(&result);
        if let Err(error) = app.emit(MOVIE_SCAN_EVENT, terminal_event(scan_id, state, &result)) {
            eprintln!("Movie scan terminal event failed: {error}");
        }
    });
    Ok(())
}

#[tauri::command]
fn cancel_movie_scan(registry: State<'_, ScanRegistry>, scan_id: String) {
    registry.cancel(&scan_id);
}

#[cfg(test)]
mod tests {
    use super::{scan_movie_files_sync, terminal_event, ScanRegistry, TerminalState};

    #[test]
    fn empty_patterns_keep_the_movie_default_and_snake_case_dto() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("movie.MP4"), b"movie").unwrap();
        std::fs::write(directory.path().join("Another.avi"), b"another").unwrap();
        std::fs::write(directory.path().join("notes.txt"), b"notes").unwrap();

        for patterns in [vec![], vec!["  ".into()]] {
            let files =
                scan_movie_files_sync(directory.path().display().to_string(), patterns).unwrap();
            assert_eq!(files.len(), 2);
            assert_eq!(files[0].name, "Another.avi");
            assert_eq!(files[1].name, "movie.MP4");
        }

        let files =
            scan_movie_files_sync(directory.path().display().to_string(), vec!["*.txt".into()])
                .unwrap();
        assert_eq!(files[0].name, "notes.txt");
        let dto = serde_json::to_value(&files[0]).unwrap();
        assert_eq!(dto["size_bytes"], 5);
        assert!(dto.get("modified_ms").is_some());
    }

    #[test]
    fn invalid_glob_still_reports_an_error() {
        let directory = tempfile::tempdir().unwrap();
        let result =
            scan_movie_files_sync(directory.path().display().to_string(), vec!["[".into()]);
        assert!(result.err().unwrap().contains("Invalid glob pattern"));
    }

    #[test]
    fn registry_cancels_active_scan_and_rejects_duplicate_ids() {
        let registry = ScanRegistry::default();
        let job = registry.register("scan-1").unwrap();
        assert!(registry.register("scan-1").is_err());
        assert!(registry.cancel("scan-1"));
        assert!(job.is_cancelled());
        assert_eq!(job.finish(&Ok::<(), String>(())), TerminalState::Cancelled);
        registry.register("scan-1").unwrap();
    }

    #[test]
    fn terminal_events_distinguish_completion_failure_and_cancellation() {
        let completed = serde_json::to_value(terminal_event(
            "one".into(),
            TerminalState::Completed,
            &Ok(()),
        ))
        .unwrap();
        assert_eq!(completed["scanId"], "one");
        assert_eq!(completed["status"], "completed");
        let failed = serde_json::to_value(terminal_event(
            "two".into(),
            TerminalState::Failed,
            &Err("bad glob".into()),
        ))
        .unwrap();
        assert_eq!(failed["status"], "failed");
        assert_eq!(failed["error"], "bad glob");
        let cancelled = serde_json::to_value(terminal_event(
            "three".into(),
            TerminalState::Cancelled,
            &Err("stopped".into()),
        ))
        .unwrap();
        assert_eq!(cancelled["status"], "cancelled");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScanRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            scan_movie_files,
            start_movie_scan,
            cancel_movie_scan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
