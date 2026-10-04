import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ScanEvent, ScanTransport } from "@yoophi/scan-client";
import { collectMovieScan } from "./scan-stream";

export type MovieFile = {
  id: string;
  name: string;
  path: string;
  directory: string;
  extension: string;
  sizeBytes: number;
  modifiedMs: number | null;
};

type MovieFileDto = {
  id: string;
  name: string;
  path: string;
  directory: string;
  extension: string;
  size_bytes: number;
  modified_ms: number | null;
};

export const movieKeys = {
  all: ["movie-files"] as const,
  directory: (directoryPath: string | null, includePatterns: string[]) =>
    [...movieKeys.all, "directory", directoryPath, includePatterns] as const,
};

export async function scanMovieFiles(
  directoryPath: string,
  includePatterns: string[],
): Promise<MovieFile[]> {
  const files = await invoke<MovieFileDto[]>("scan_movie_files", {
    rootPath: directoryPath,
    includePatterns,
  });

  return files.map(toMovieFile);
}

function toMovieFile(file: MovieFileDto): MovieFile {
  return {
    id: file.id,
    name: file.name,
    path: file.path,
    directory: file.directory,
    extension: file.extension,
    sizeBytes: file.size_bytes,
    modifiedMs: file.modified_ms,
  };
}

export function scanMovieFilesStream(
  directoryPath: string,
  includePatterns: string[],
  signal: AbortSignal,
  onProgress: (files: MovieFile[]) => void,
): Promise<MovieFile[]> {
  const scanId = crypto.randomUUID();
  const transport: ScanTransport<MovieFile> = {
    listen: async (receive) => listen<ScanEvent<MovieFileDto>>("movie-scan-event", ({ payload }) => {
      if (payload.status === "item") {
        receive({ scanId: payload.scanId, status: "item", item: toMovieFile(payload.item) });
      } else {
        receive(payload);
      }
    }),
    start: () => invoke<void>("start_movie_scan", {
      scanId,
      rootPath: directoryPath,
      includePatterns,
    }),
    cancel: () => invoke<void>("cancel_movie_scan", { scanId }),
  };
  return collectMovieScan(transport, scanId, signal, onProgress);
}
