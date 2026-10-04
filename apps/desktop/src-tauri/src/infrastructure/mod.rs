use crate::application::{MovieFile, MovieScanner};
use explorer_fs_core::{scan_files_stream, ScannedFile};

pub struct FsMovieScanner;

impl MovieScanner for FsMovieScanner {
    fn scan_stream(
        &self,
        root_path: String,
        include_patterns: Vec<String>,
        cancelled: &dyn Fn() -> bool,
        on_file: &mut dyn FnMut(MovieFile) -> Result<(), String>,
    ) -> Result<(), String> {
        scan_files_stream(root_path, include_patterns, cancelled, &mut |file| {
            on_file(MovieFile::from(file))
        })
    }
}

impl From<ScannedFile> for MovieFile {
    fn from(file: ScannedFile) -> Self {
        Self {
            id: file.id,
            name: file.name,
            path: file.path,
            directory: file.directory,
            extension: file.extension,
            size_bytes: file.size_bytes,
            modified_ms: file.modified_ms,
        }
    }
}
