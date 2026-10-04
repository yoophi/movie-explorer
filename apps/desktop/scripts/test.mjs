import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const temp = mkdtempSync(path.join(tmpdir(), "movie-stream-test-"));
try {
  const output = path.join(temp, "scan-stream.test.mjs");
  run("pnpm", ["exec", "esbuild", "src/entities/movie/scan-stream.test.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${output}`]);
  run(process.execPath, ["--test", "src/features/preferences/model.test.ts", "src/pages/home/selection.test.ts", output]);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
