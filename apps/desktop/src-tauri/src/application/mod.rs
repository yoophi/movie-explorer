use serde::Serialize;

const DEFAULT_MOVIE_GLOB: &str = "**/*.{mp4,m4v,mkv,avi,mov,wmv,webm,mpg,mpeg,m2ts,flv,3gp,ogv}";

#[derive(Clone, Debug, Serialize)]
pub struct MovieFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub directory: String,
    pub extension: String,
    pub size_bytes: u64,
    pub modified_ms: Option<u128>,
}

pub trait MovieScanner {
    fn scan_stream(
        &self,
        root_path: String,
        include_patterns: Vec<String>,
        cancelled: &dyn Fn() -> bool,
        on_file: &mut dyn FnMut(MovieFile) -> Result<(), String>,
    ) -> Result<(), String>;
}

pub struct ScanMovieFiles<S: MovieScanner> {
    scanner: S,
}

impl<S: MovieScanner> ScanMovieFiles<S> {
    pub fn new(scanner: S) -> Self {
        Self { scanner }
    }

    pub fn run(
        &self,
        root_path: String,
        include_patterns: Vec<String>,
    ) -> Result<Vec<MovieFile>, String> {
        let mut files = Vec::new();
        self.stream(root_path, include_patterns, &|| false, &mut |file| {
            files.push(file);
            Ok(())
        })?;
        files.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        Ok(files)
    }

    pub fn stream(
        &self,
        root_path: String,
        include_patterns: Vec<String>,
        cancelled: &dyn Fn() -> bool,
        on_file: &mut dyn FnMut(MovieFile) -> Result<(), String>,
    ) -> Result<(), String> {
        let patterns = if include_patterns
            .iter()
            .all(|pattern| pattern.trim().is_empty())
        {
            vec![DEFAULT_MOVIE_GLOB.to_string()]
        } else {
            include_patterns
        };
        self.scanner
            .scan_stream(root_path, patterns, cancelled, on_file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct FakeScanner {
        calls: RefCell<Vec<(String, Vec<String>)>>,
        error: Option<String>,
        files: Vec<MovieFile>,
    }

    impl FakeScanner {
        fn new(error: Option<&str>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                error: error.map(str::to_string),
                files: Vec::new(),
            }
        }
    }

    impl MovieScanner for &FakeScanner {
        fn scan_stream(
            &self,
            root_path: String,
            include_patterns: Vec<String>,
            cancelled: &dyn Fn() -> bool,
            on_file: &mut dyn FnMut(MovieFile) -> Result<(), String>,
        ) -> Result<(), String> {
            self.calls.borrow_mut().push((root_path, include_patterns));
            for file in &self.files {
                if cancelled() {
                    return Err("Directory traversal cancelled.".into());
                }
                on_file(MovieFile {
                    id: file.id.clone(),
                    name: file.name.clone(),
                    path: file.path.clone(),
                    directory: file.directory.clone(),
                    extension: file.extension.clone(),
                    size_bytes: file.size_bytes,
                    modified_ms: file.modified_ms,
                })?;
            }
            self.error.clone().map_or(Ok(()), Err)
        }
    }

    #[test]
    fn empty_and_whitespace_patterns_use_the_movie_default() {
        let scanner = FakeScanner::new(None);
        let use_case = ScanMovieFiles::new(&scanner);
        use_case.run("/fixture".into(), vec![]).unwrap();
        use_case.run("/fixture".into(), vec!["  ".into()]).unwrap();
        assert_eq!(
            scanner.calls.borrow().as_slice(),
            &[
                ("/fixture".into(), vec![DEFAULT_MOVIE_GLOB.into()]),
                ("/fixture".into(), vec![DEFAULT_MOVIE_GLOB.into()]),
            ]
        );
    }

    #[test]
    fn custom_patterns_reach_the_scanner_unchanged() {
        let scanner = FakeScanner::new(None);
        ScanMovieFiles::new(&scanner)
            .run("/fixture".into(), vec!["*.mkv".into(), "**/*.avi".into()])
            .unwrap();
        assert_eq!(
            scanner.calls.borrow().as_slice(),
            &[("/fixture".into(), vec!["*.mkv".into(), "**/*.avi".into()]),]
        );
    }

    #[test]
    fn scanner_errors_are_returned_unchanged() {
        let scanner = FakeScanner::new(Some("Invalid glob pattern"));
        let error = ScanMovieFiles::new(&scanner)
            .run("/fixture".into(), vec!["[".into()])
            .err()
            .unwrap();
        assert_eq!(error, "Invalid glob pattern");
    }

    #[test]
    fn stream_delivers_items_before_completion_and_stops_on_cancel() {
        use std::cell::Cell;
        let mut scanner = FakeScanner::new(None);
        scanner.files = vec![
            MovieFile {
                id: "one".into(),
                name: "one.mp4".into(),
                path: "one".into(),
                directory: "/fixture".into(),
                extension: "mp4".into(),
                size_bytes: 1,
                modified_ms: None,
            },
            MovieFile {
                id: "two".into(),
                name: "two.mp4".into(),
                path: "two".into(),
                directory: "/fixture".into(),
                extension: "mp4".into(),
                size_bytes: 2,
                modified_ms: None,
            },
        ];
        let mut received = Vec::new();
        let should_cancel = Cell::new(false);
        let result = ScanMovieFiles::new(&scanner).stream(
            "/fixture".into(),
            vec![],
            &|| should_cancel.get(),
            &mut |file| {
                received.push(file.name);
                should_cancel.set(true);
                Ok(())
            },
        );
        assert_eq!(received, vec!["one.mp4"]);
        assert_eq!(result.err().unwrap(), "Directory traversal cancelled.");
    }
}
