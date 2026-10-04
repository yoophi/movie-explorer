import { consumeScan, type ScanTransport } from "@yoophi/scan-client";
import { compareLowercasedCodePoints } from "@yoophi/explorer-core";
import type { MovieFile } from "./api";

const BATCH_SIZE = 64;
const BATCH_DELAY_MS = 40;

function sortByName(files: MovieFile[]) {
  return files.sort((left, right) => compareLowercasedCodePoints(left.name, right.name));
}

/** Progress is provisional; only the resolved return value belongs in the query cache. */
export async function collectMovieScan(
  transport: ScanTransport<MovieFile>,
  scanId: string,
  signal: AbortSignal,
  onProgress: (files: MovieFile[]) => void,
): Promise<MovieFile[]> {
  const files: MovieFile[] = [];
  let pending: MovieFile[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    if (signal.aborted || pending.length === 0) return;
    files.push(...pending);
    pending = [];
    onProgress(sortByName([...files]));
  };

  try {
    await consumeScan(transport, scanId, (file) => {
      pending.push(file);
      if (pending.length >= BATCH_SIZE) {
        if (timer) clearTimeout(timer);
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, BATCH_DELAY_MS);
      }
    }, signal);
    if (timer) clearTimeout(timer);
    flush();
    return sortByName(files);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
