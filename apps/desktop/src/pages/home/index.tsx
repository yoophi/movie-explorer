import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBytes as formatSharedBytes } from "@yoophi/explorer-core";
import { useSettings } from "@yoophi/settings-core/react";
import { SettingsField, SettingsSection, SettingsStatus } from "@yoophi/settings-ui";
import { Badge } from "@movie-explorer/ui/components/badge";
import { Button } from "@movie-explorer/ui/components/button";
import { Input } from "@movie-explorer/ui/components/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@movie-explorer/ui/components/resizable";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Grid2X2,
  List,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type MovieFile, movieKeys, scanMovieFilesStream } from "@/entities/movie";
import {
  DEFAULT_INCLUDE_PATTERN,
  confirmedPatternDraft,
  editPatternDraft,
  moviePreferences,
  syncPatternDraft,
  type MovieFileViewMode,
} from "@/features/preferences";
import { reconcileDirectorySelection, type DirectorySelectionStatus } from "./selection";

type DirectoryNode = {
  id: string;
  label: string;
  files: MovieFile[];
  children: DirectoryNode[];
  totalFiles: number;
  totalSizeBytes: number;
};

type MutableDirectoryNode = {
  id: string;
  label: string;
  files: MovieFile[];
  children: Map<string, MutableDirectoryNode>;
};

const EMPTY_MOVIES: MovieFile[] = [];

export function HomePage() {
  const queryClient = useQueryClient();
  const activeScan = useRef(0);
  const [partialScan, setPartialScan] = useState<{ key: string; files: MovieFile[] } | null>(null);
  const { value: preferences, error: settingsError } = useSettings(moviePreferences);
  const { directoryPath, viewMode } = preferences;
  const [query, setQuery] = useState("");
  const [patternDraft, setPatternDraft] = useState(() =>
    confirmedPatternDraft(preferences.includePatternText),
  );
  const includePatterns = useMemo(
    () => parseIncludePatterns(preferences.includePatternText),
    [preferences.includePatternText],
  );
  const scanKey = JSON.stringify([directoryPath, includePatterns]);

  useEffect(() => () => {
    activeScan.current += 1;
  }, []);

  useEffect(() => {
    setPatternDraft((current) => syncPatternDraft(current, preferences.includePatternText));
  }, [preferences.includePatternText]);

  const moviesQuery = useQuery({
    queryKey: movieKeys.directory(directoryPath, includePatterns),
    queryFn: ({ signal }) => {
      const run = ++activeScan.current;
      setPartialScan({ key: scanKey, files: [] });
      return scanMovieFilesStream(directoryPath ?? "", includePatterns, signal, (files) => {
        if (!signal.aborted && activeScan.current === run) {
          setPartialScan({ key: scanKey, files });
        }
      });
    },
    enabled: Boolean(directoryPath),
  });

  const visibleMovies = moviesQuery.isFetching && partialScan?.key === scanKey && partialScan.files.length > 0
    ? partialScan.files
    : moviesQuery.data ?? EMPTY_MOVIES;

  const filteredMovies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const movies = visibleMovies;

    if (!normalizedQuery) {
      return movies;
    }

    return movies.filter((movie) => {
      const haystack = [movie.name, movie.path, movie.extension].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [visibleMovies, query]);

  const totalSizeBytes = useMemo(
    () => filteredMovies.reduce((total, movie) => total + movie.sizeBytes, 0),
    [filteredMovies],
  );
  const directoryTree = useMemo(
    () => buildDirectoryTree(filteredMovies, directoryPath),
    [directoryPath, filteredMovies],
  );
  const completeDirectoryTree = useMemo(
    () => buildDirectoryTree(moviesQuery.data ?? EMPTY_MOVIES, directoryPath),
    [directoryPath, moviesQuery.data],
  );
  const [directorySelection, setDirectorySelection] = useState({ rootPath: null, id: null } as {
    rootPath: string | null;
    id: string | null;
  });
  const selectedDirectoryId = directorySelection.rootPath === directoryPath ? directorySelection.id : null;
  const selectedDirectory = useMemo(
    () => selectedDirectoryId
      ? findDirectoryNode(directoryTree, selectedDirectoryId)
      : directoryTree[0] ?? null,
    [directoryTree, selectedDirectoryId],
  );
  const selectedFiles = useMemo(
    () => (selectedDirectory ? collectDirectoryFiles(selectedDirectory) : []),
    [selectedDirectory],
  );

  useEffect(() => {
    const status: DirectorySelectionStatus = moviesQuery.isFetching
      ? "inProgress"
      : moviesQuery.isError
        ? "error"
        : moviesQuery.isSuccess
          ? "complete"
          : "inProgress";
    setDirectorySelection((current) =>
      reconcileDirectorySelection(current, directoryPath, directoryTree, status, completeDirectoryTree),
    );
  }, [directoryPath, directoryTree, completeDirectoryTree, moviesQuery.isFetching, moviesQuery.isError, moviesQuery.isSuccess]);

  async function handleSelectDirectory() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select movie directory",
    });

    if (typeof selected === "string") {
      if (moviePreferences.update((current) => ({ ...current, directoryPath: selected }))) {
        setQuery("");
      }
    }
  }

  async function handleRescan() {
    activeScan.current += 1;
    setPartialScan(null);
    await queryClient.cancelQueries({ queryKey: movieKeys.directory(directoryPath, includePatterns), exact: true });
    void moviesQuery.refetch();
  }

  function handleApplyPatterns() {
    const appliedText = patternDraft.text;
    if (moviePreferences.update((current) => ({ ...current, includePatternText: appliedText }))) {
      setPatternDraft(confirmedPatternDraft(appliedText));
    }
  }

  function handleResetPatterns() {
    if (moviePreferences.update((current) => ({ ...current, includePatternText: DEFAULT_INCLUDE_PATTERN }))) {
      setPatternDraft(confirmedPatternDraft(DEFAULT_INCLUDE_PATTERN));
    }
  }

  function handleViewModeChange(nextViewMode: MovieFileViewMode) {
    moviePreferences.update((current) => ({ ...current, viewMode: nextViewMode }));
  }

  function handleResetSettings() {
    if (moviePreferences.reset()) {
      setPatternDraft(confirmedPatternDraft(DEFAULT_INCLUDE_PATTERN));
      setDirectorySelection({ rootPath: null, id: null });
    }
  }

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <section className="border-b border-border bg-sidebar">
        <SettingsSection
          title="타겟디렉토리 설정"
          description="동영상 파일을 조회할 기준 폴더를 선택합니다."
          className="px-6 py-5 [&_h2]:text-lg"
          actions={
            <>
              <Button type="button" onClick={handleSelectDirectory}>
                <FolderOpen />
                Open Folder
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!directoryPath}
                onClick={() => void handleRescan()}
              >
                <RefreshCw />
                Rescan
              </Button>
            </>
          }
        >

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_18rem]">
            <Input
              aria-label="Search movies"
              placeholder="파일명, 경로, 확장자로 필터"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground">
              <Search className="size-4" />
              {directoryPath ? `${filteredMovies.length.toLocaleString()} files` : "No folder selected"}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <SettingsField label="검색 대상 glob">
              {(field) => (
                <Input
                  {...field}
                  aria-label="Include glob patterns"
                  placeholder="검색 대상 glob: **/*.{mp4|avi|mkv}"
                  value={patternDraft.text}
                  onChange={(event) => setPatternDraft((current) => editPatternDraft(current, event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleApplyPatterns();
                    }
                  }}
                />
              )}
            </SettingsField>
            <Button type="button" variant="outline" onClick={handleApplyPatterns}>
              Apply Pattern
            </Button>
            <Button type="button" variant="ghost" onClick={handleResetPatterns}>
              Reset
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            스캔 대상: {includePatterns.join(" ")} · 예: <code>*.mp4</code>,{" "}
            <code>**/*.{`{mp4|avi|mkv}`}</code>. 기본값은 <code>*.ts</code>를 제외합니다.
          </p>

          {directoryPath ? (
            <p className="truncate rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {directoryPath}
            </p>
          ) : null}
          <SettingsStatus error={settingsError} />
          {settingsError ? (
            <Button type="button" variant="outline" className="self-start" onClick={handleResetSettings}>
              설정 초기화
            </Button>
          ) : null}
        </SettingsSection>
      </section>

      <section className="grid grid-cols-3 gap-3 border-b border-border px-6 py-3">
          <Summary label="Visible files" value={filteredMovies.length.toLocaleString()} />
          <Summary label="Total size" value={formatBytes(totalSizeBytes)} />
          <Summary label="Scan status" value={moviesQuery.isFetching ? "Scanning" : "Idle"} />
      </section>

      <section className="min-h-0 flex-1">
        {!directoryPath ? (
          <div className="m-6 rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Choose a folder to scan movie files.
          </div>
        ) : null}

        {moviesQuery.isError ? (
          <div className="m-6 rounded-md border border-border bg-card p-4 text-sm text-card-foreground">
            {(moviesQuery.error as Error).message}
          </div>
        ) : null}

        {directoryPath && !moviesQuery.isFetching && !moviesQuery.isError && filteredMovies.length === 0 ? (
          <div className="m-6 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No movie files found.
          </div>
        ) : null}

        {directoryTree.length > 0 ? (
          <ResizablePanelGroup>
            <ResizablePanel id="folder-tree" defaultSize="320px" minSize="240px" maxSize="45%">
              <div className="flex h-full min-h-0 flex-col border-r border-border bg-card">
                <PaneHeader title="폴더트리" subtitle={`${directoryTree.length.toLocaleString()} roots`} />
                <div className="min-h-0 flex-1 overflow-auto">
                  {directoryTree.map((directory) => (
                    <DirectoryTreeItem
                      key={directory.id}
                      node={directory}
                      depth={0}
                      selectedId={selectedDirectoryId}
                      onSelect={(id) => setDirectorySelection({ rootPath: directoryPath, id })}
                    />
                  ))}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="file-list" minSize="360px">
              <div className="flex h-full min-h-0 flex-col bg-background">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-3 py-2">
                  <PaneHeader
                    title="파일목록"
                    subtitle={
                      selectedDirectory
                        ? `${selectedDirectory.label} · 하위 포함 ${selectedFiles.length.toLocaleString()} files · flat`
                        : "No folder selected"
                    }
                    className="border-0 bg-transparent p-0"
                  />
                  <div className="flex shrink-0 rounded-md border border-border bg-background p-0.5">
                    <IconToggle
                      active={viewMode === "thumbnail"}
                      label="Square thumbnails"
                      onClick={() => handleViewModeChange("thumbnail")}
                    >
                      <Grid2X2 />
                    </IconToggle>
                    <IconToggle
                      active={viewMode === "grid"}
                      label="Detailed list"
                      onClick={() => handleViewModeChange("grid")}
                    >
                      <List />
                    </IconToggle>
                    <IconToggle
                      active={viewMode === "compact"}
                      label="Filename only"
                      onClick={() => handleViewModeChange("compact")}
                    >
                      <FileText />
                    </IconToggle>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {selectedFiles.length > 0 ? (
                    <MovieFileList files={selectedFiles} viewMode={viewMode} />
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      선택한 폴더와 하위 폴더에 표시할 동영상 파일이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : null}
      </section>
    </main>
  );
}

function DirectoryTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: DirectoryNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const active = node.id === selectedId;

  return (
    <div>
      <button
        type="button"
        className={`grid w-full grid-cols-[minmax(0,1fr)_4rem_5rem] items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
          active ? "bg-muted text-foreground" : "hover:bg-muted/60"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="truncate font-medium">{node.label}</h2>
            {node.files.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {node.files.length.toLocaleString()} direct files
              </p>
            ) : null}
          </div>
        </div>
        <span className="text-right text-xs text-muted-foreground">
          {node.totalFiles.toLocaleString()}
        </span>
        <span className="text-right text-xs text-muted-foreground">
          {formatBytes(node.totalSizeBytes)}
        </span>
      </button>

      {node.children.map((child) => (
        <DirectoryTreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function MovieFileList({
  files,
  viewMode,
}: {
  files: MovieFile[];
  viewMode: MovieFileViewMode;
}) {
  if (viewMode === "thumbnail") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-3">
        {files.map((movie) => (
          <article key={movie.id} className="min-w-0">
            <div className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted">
              <FileVideo className="size-8 text-muted-foreground" />
            </div>
            <h3 className="mt-2 line-clamp-2 min-h-10 text-sm font-medium">{movie.name}</h3>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <Badge className="h-5 uppercase">{movie.extension}</Badge>
              <span>{formatBytes(movie.sizeBytes)}</span>
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (viewMode === "compact") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-3 gap-y-1 p-3">
        {files.map((movie) => (
          <div key={movie.id} className="flex min-w-0 items-center gap-1.5 text-sm">
            <FileVideo className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{movie.name}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {files.map((movie) => (
        <div
          key={movie.id}
          className="grid grid-cols-[minmax(16rem,1fr)_7rem_8rem] items-center border-b border-border/60 px-3 py-2 text-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileVideo className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="truncate font-medium">{movie.name}</h3>
              <p className="truncate text-xs text-muted-foreground">{movie.directory}</p>
            </div>
          </div>
          <Badge className="w-fit uppercase">{movie.extension}</Badge>
          <span className="text-muted-foreground">{formatBytes(movie.sizeBytes)}</span>
        </div>
      ))}
    </>
  );
}

function PaneHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <div className={`border-b border-border bg-muted px-3 py-2 ${className ?? ""}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function IconToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex size-7 items-center justify-center rounded-sm transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function findDirectoryNode(nodes: DirectoryNode[], id: string | null): DirectoryNode | null {
  if (!id) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const child = findDirectoryNode(node.children, id);
    if (child) {
      return child;
    }
  }

  return null;
}

function collectDirectoryFiles(node: DirectoryNode): MovieFile[] {
  return [
    ...node.files,
    ...node.children.flatMap((child) => collectDirectoryFiles(child)),
  ].sort((left, right) => left.name.localeCompare(right.name));
}

function parseIncludePatterns(value: string) {
  const patterns = value
    .split(/[\s;]+/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  return patterns.length > 0 ? patterns : [DEFAULT_INCLUDE_PATTERN];
}

function buildDirectoryTree(files: MovieFile[], rootPath: string | null): DirectoryNode[] {
  const root: MutableDirectoryNode = {
    id: rootPath ?? "root",
    label: rootPath ? lastPathSegment(rootPath) : "Movies",
    files: [],
    children: new Map(),
  };

  for (const file of files) {
    const segments = getRelativeDirectorySegments(file.directory, rootPath);
    let current = root;

    for (const segment of segments) {
      const childId = `${current.id}/${segment}`;
      const existingChild = current.children.get(segment);
      const child =
        existingChild ??
        ({
          id: childId,
          label: segment,
          files: [],
          children: new Map(),
        } satisfies MutableDirectoryNode);

      current.children.set(segment, child);
      current = child;
    }

    current.files.push(file);
  }

  const rootNode = toDirectoryNode(root);

  if (root.files.length > 0) {
    return [compressDirectoryNode(rootNode)];
  }

  return rootNode.children.map(compressDirectoryNode);
}

function toDirectoryNode(node: MutableDirectoryNode): DirectoryNode {
  const children = Array.from(node.children.values())
    .map(toDirectoryNode)
    .sort((left, right) => left.label.localeCompare(right.label));
  const totalFiles =
    node.files.length + children.reduce((total, child) => total + child.totalFiles, 0);
  const totalSizeBytes =
    node.files.reduce((total, file) => total + file.sizeBytes, 0) +
    children.reduce((total, child) => total + child.totalSizeBytes, 0);

  return {
    id: node.id,
    label: node.label,
    files: [...node.files].sort((left, right) => left.name.localeCompare(right.name)),
    children,
    totalFiles,
    totalSizeBytes,
  };
}

function compressDirectoryNode(node: DirectoryNode): DirectoryNode {
  let current: DirectoryNode = {
    ...node,
    children: node.children.map(compressDirectoryNode),
  };

  while (current.files.length === 0 && current.children.length === 1) {
    const [child] = current.children;

    if (child.files.length > 0) {
      break;
    }

    current = {
      ...child,
      id: child.id,
      label: `${current.label}/${child.label}`,
    };
  }

  return current;
}

function getRelativeDirectorySegments(directory: string, rootPath: string | null) {
  const normalizedDirectory = normalizePath(directory);
  const normalizedRoot = rootPath ? normalizePath(rootPath) : "";
  const relativeDirectory =
    normalizedRoot && normalizedDirectory.startsWith(normalizedRoot)
      ? normalizedDirectory.slice(normalizedRoot.length).replace(/^\/+/, "")
      : normalizedDirectory;

  return relativeDirectory.split("/").filter(Boolean);
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function lastPathSegment(path: string) {
  const segments = normalizePath(path).split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

// The app has always rounded values of 10 or more to whole units.
function formatBytes(bytes: number) {
  const formatted = formatSharedBytes(bytes);
  const unit = formatted.slice(formatted.lastIndexOf(" ") + 1);
  const unitIndex = ["B", "KB", "MB", "GB", "TB"].indexOf(unit);
  if (unitIndex <= 0) {
    return formatted;
  }

  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}
