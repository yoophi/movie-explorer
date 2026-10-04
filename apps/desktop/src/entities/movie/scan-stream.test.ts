import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScanEvent, ScanTransport } from "@yoophi/scan-client";
import type { MovieFile } from "./api.ts";
import { collectMovieScan } from "./scan-stream.ts";

function movie(name: string): MovieFile {
  return { id: name, name, path: `/fixture/${name}`, directory: "/fixture",
    extension: "mp4", sizeBytes: 1, modifiedMs: null };
}

function fakeTransport() {
  let receive: ((event: ScanEvent<MovieFile>) => void) | undefined;
  let started = false;
  let cancelled = 0;
  let unlistened = false;
  const transport: ScanTransport<MovieFile> = {
    listen: async (listener) => {
      receive = listener;
      return () => { unlistened = true; receive = undefined; };
    },
    start: async () => { assert.ok(receive, "listener must precede start"); started = true; },
    cancel: async () => { cancelled += 1; },
  };
  return {
    transport,
    emit: (event: ScanEvent<MovieFile>) => { receive?.(event); },
    started: () => started,
    cancelled: () => cancelled,
    unlistened: () => unlistened,
  };
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitForBatch = () => new Promise((resolve) => setTimeout(resolve, 55));

test("items render in a batch before terminal completion; final result is name-sorted", async () => {
  const fake = fakeTransport();
  const progress: string[][] = [];
  const running = collectMovieScan(fake.transport, "scan-1", new AbortController().signal,
    (files) => progress.push(files.map((file) => file.name)));
  await nextTask();
  assert.equal(fake.started(), true);
  fake.emit({ scanId: "scan-1", status: "item", item: movie("z.mp4") });
  await waitForBatch();
  assert.deepEqual(progress, [["z.mp4"]]);
  fake.emit({ scanId: "scan-1", status: "item", item: movie("A.mp4") });
  fake.emit({ scanId: "scan-1", status: "completed" });
  assert.deepEqual((await running).map((file) => file.name), ["A.mp4", "z.mp4"]);
  assert.equal(fake.unlistened(), true);
});

test("BMP private-use name sorts before supplementary-plane name in progress and final output", async () => {
  const fake = fakeTransport();
  const progress: string[][] = [];
  const running = collectMovieScan(fake.transport, "unicode", new AbortController().signal,
    (files) => progress.push(files.map((file) => file.name)));
  await nextTask();
  fake.emit({ scanId: "unicode", status: "item", item: movie("\u{10000}.mp4") });
  fake.emit({ scanId: "unicode", status: "item", item: movie("\uE000.mp4") });
  await waitForBatch();
  assert.deepEqual(progress, [["\uE000.mp4", "\u{10000}.mp4"]]);
  fake.emit({ scanId: "unicode", status: "completed" });
  assert.deepEqual((await running).map((file) => file.name), ["\uE000.mp4", "\u{10000}.mp4"]);
});

test("abort cancels and ignores late items; replacement accepts only its own scan ID", async () => {
  const old = fakeTransport();
  const controller = new AbortController();
  const oldProgress: MovieFile[][] = [];
  const oldRun = collectMovieScan(old.transport, "old", controller.signal,
    (files) => oldProgress.push(files));
  await nextTask();
  old.emit({ scanId: "old", status: "item", item: movie("old.mp4") });
  controller.abort();
  await assert.rejects(oldRun, { name: "AbortError" });
  old.emit({ scanId: "old", status: "completed" });
  await waitForBatch();
  assert.equal(old.cancelled(), 1);
  assert.equal(old.unlistened(), true);
  assert.deepEqual(oldProgress, []);

  const replacement = fakeTransport();
  const nextRun = collectMovieScan(replacement.transport, "new", new AbortController().signal,
    () => {});
  await nextTask();
  replacement.emit({ scanId: "old", status: "item", item: movie("stale.mp4") });
  replacement.emit({ scanId: "new", status: "item", item: movie("new.mp4") });
  replacement.emit({ scanId: "new", status: "completed" });
  assert.deepEqual((await nextRun).map((file) => file.name), ["new.mp4"]);
});

test("failed and cancelled terminals reject without returning provisional success", async () => {
  for (const terminal of [
    { scanId: "scan", status: "failed" as const, error: "Invalid glob pattern" },
    { scanId: "scan", status: "cancelled" as const },
  ]) {
    const fake = fakeTransport();
    const progress: MovieFile[][] = [];
    const running = collectMovieScan(fake.transport, "scan", new AbortController().signal,
      (files) => progress.push(files));
    await nextTask();
    fake.emit({ scanId: "scan", status: "item", item: movie("partial.mp4") });
    await waitForBatch();
    assert.equal(progress.length, 1);
    fake.emit(terminal);
    await assert.rejects(running, terminal.status === "failed" ? /Invalid glob pattern/ : { name: "AbortError" });
    assert.equal(fake.unlistened(), true);
  }
});
