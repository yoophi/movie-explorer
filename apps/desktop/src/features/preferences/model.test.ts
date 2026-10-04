import assert from "node:assert/strict";
import { test } from "node:test";
import { createSettingsStore } from "@yoophi/settings-core";
import {
  DEFAULT_MOVIE_PREFERENCES,
  confirmedPatternDraft,
  editPatternDraft,
  parseMoviePreferences,
  syncPatternDraft,
} from "./model.ts";

function fixture(initial: string | null = null) {
  let document = initial;
  let denyWrite = false;
  const storage = () => ({
    getItem: () => document,
    setItem: (_key: string, value: string) => {
      if (denyWrite) throw new Error("Storage denied");
      document = value;
    },
  });
  const create = () => createSettingsStore({
    key: "movie-explorer.preferences",
    version: 1,
    defaults: DEFAULT_MOVIE_PREFERENCES,
    parse: parseMoviePreferences,
    storage,
  });
  return {
    create,
    document: () => document,
    setExternal: (value: string) => { document = value; },
    denyWrite: (denied: boolean) => { denyWrite = denied; },
  };
}

test("preferences roundtrip persists folder, applied glob text and view mode", () => {
  const memory = fixture();
  const store = memory.create();
  assert.equal(store.getSnapshot().value.directoryPath, null);
  assert.equal(memory.document(), null);
  assert.equal(store.update((current) => ({
    ...current,
    directoryPath: "/fixture/movies",
    includePatternText: "*.mkv *.mp4",
    viewMode: "compact",
  })), true);
  assert.deepEqual(JSON.parse(memory.document()!), {
    version: 1,
    value: {
      directoryPath: "/fixture/movies",
      includePatternText: "*.mkv *.mp4",
      viewMode: "compact",
    },
  });
  assert.deepEqual(memory.create().getSnapshot().value, store.getSnapshot().value);
});

test("invalid and unsupported fixtures remain unchanged until explicit reset", () => {
  const invalidValues = [
    "{broken",
    JSON.stringify({ version: 2, value: DEFAULT_MOVIE_PREFERENCES }),
    JSON.stringify({ version: 1, value: { ...DEFAULT_MOVIE_PREFERENCES, viewMode: "unknown" } }),
    JSON.stringify({ version: 1, value: { ...DEFAULT_MOVIE_PREFERENCES, extra: true } }),
    JSON.stringify({ version: 1, value: { ...DEFAULT_MOVIE_PREFERENCES, directoryPath: "" } }),
  ];
  for (const invalid of invalidValues) {
    const memory = fixture(invalid);
    const store = memory.create();
    assert.ok(store.getSnapshot().error);
    assert.equal(store.update((current) => ({ ...current, viewMode: "grid" })), false);
    assert.equal(memory.document(), invalid);
    assert.equal(store.reset(), true);
    assert.equal(store.getSnapshot().error, null);
    assert.deepEqual(store.getSnapshot().value, DEFAULT_MOVIE_PREFERENCES);
  }
});

test("external applied pattern updates a clean draft but preserves an edited draft", () => {
  let draft = confirmedPatternDraft("*.mp4");
  draft = syncPatternDraft(draft, "*.mkv");
  assert.deepEqual(draft, confirmedPatternDraft("*.mkv"));

  draft = editPatternDraft(draft, "*.avi");
  assert.equal(draft.dirty, true);
  draft = syncPatternDraft(draft, "*.webm");
  assert.deepEqual(draft, { text: "*.avi", appliedText: "*.webm", dirty: true });
  draft = editPatternDraft(draft, "*.webm");
  assert.equal(draft.dirty, false);
});

test("failed Apply retains dirty text; successful Apply and Reset clear it even for a no-op", () => {
  const memory = fixture();
  const store = memory.create();
  let draft = confirmedPatternDraft(store.getSnapshot().value.includePatternText);
  draft = editPatternDraft(draft, "*.avi");

  memory.setExternal(JSON.stringify({
    version: 1,
    value: { ...DEFAULT_MOVIE_PREFERENCES, includePatternText: "*.mkv" },
  }));
  store.refresh();
  draft = syncPatternDraft(draft, store.getSnapshot().value.includePatternText);
  assert.deepEqual(draft, { text: "*.avi", appliedText: "*.mkv", dirty: true });

  memory.denyWrite(true);
  if (store.update((current) => ({ ...current, includePatternText: draft.text }))) {
    draft = confirmedPatternDraft(draft.text);
  }
  assert.equal(draft.dirty, true);
  assert.equal(draft.text, "*.avi");
  assert.equal(store.getSnapshot().value.includePatternText, "*.mkv");
  assert.match(store.getSnapshot().error!, /denied/);

  memory.denyWrite(false);
  if (store.update((current) => ({ ...current, includePatternText: draft.text }))) {
    draft = confirmedPatternDraft(draft.text);
  }
  assert.deepEqual(draft, confirmedPatternDraft("*.avi"));
  draft = editPatternDraft(draft, "*.mp4");
  if (store.update((current) => ({ ...current, includePatternText: "*.avi" }))) {
    draft = confirmedPatternDraft("*.avi");
  }
  assert.deepEqual(draft, confirmedPatternDraft("*.avi"));
});
