import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileDirectorySelection as reconcile, type DirectorySelection } from "./selection.ts";

const a = { id: "/movies/A", children: [] };
const b = { id: "/movies/B", children: [] };
const selectedB: DirectorySelection = { rootPath: "/movies", id: b.id };

test("first lookup selects the first arriving directory and keeps it at completion", () => {
  let selection: DirectorySelection = { rootPath: null, id: null };
  selection = reconcile(selection, "/movies", [], "inProgress");
  assert.deepEqual(selection, { rootPath: "/movies", id: null });
  selection = reconcile(selection, "/movies", [a], "inProgress");
  assert.equal(selection.id, a.id);
  selection = reconcile(selection, "/movies", [a, b], "complete");
  assert.equal(selection.id, a.id);
});

test("rescan keeps B through partial A, then partial A/B, and successful completion", () => {
  const partial = reconcile(selectedB, "/movies", [a], "inProgress");
  assert.strictEqual(partial, selectedB);
  assert.strictEqual(reconcile(partial, "/movies", [a, b], "inProgress"), selectedB);
  assert.strictEqual(reconcile(partial, "/movies", [a, b], "complete"), selectedB);
});

test("only a completed scan prunes B when removed, including an empty result", () => {
  assert.equal(reconcile(selectedB, "/movies", [a], "inProgress").id, b.id);
  assert.equal(reconcile(selectedB, "/movies", [a], "complete").id, a.id);
  assert.equal(reconcile(selectedB, "/movies", [], "complete").id, null);
});

test("errors and cancellation preserve the last completed selection", () => {
  assert.strictEqual(reconcile(selectedB, "/movies", [], "error"), selectedB);
  assert.strictEqual(reconcile(selectedB, "/movies", [a], "error"), selectedB);
  assert.strictEqual(reconcile(selectedB, "/movies", [], "inProgress"), selectedB);
  assert.equal(reconcile(selectedB, "/movies", [a, b], "complete").id, b.id);
});

test("path change drops the old root selection; glob change on the same path keeps it until complete", () => {
  const nextRoot = { id: "/other/A", children: [] };
  assert.deepEqual(reconcile(selectedB, "/other", [], "inProgress"), { rootPath: "/other", id: null });
  assert.deepEqual(reconcile(selectedB, "/other", [nextRoot], "inProgress"), { rootPath: "/other", id: nextRoot.id });
  assert.strictEqual(reconcile(selectedB, "/movies", [a], "inProgress"), selectedB);
  assert.equal(reconcile(selectedB, "/movies", [a], "complete").id, a.id);
  assert.deepEqual(reconcile(selectedB, null, [], "inProgress"), { rootPath: null, id: null });
});

test("text filtering does not treat a completed directory as deleted", () => {
  // A is visible under the text filter; the completed scan still contains B.
  assert.strictEqual(reconcile(selectedB, "/movies", [a], "complete", [a, b]), selectedB);
  // A new selection is initialized only from the visible tree.
  assert.equal(reconcile({ rootPath: "/movies", id: null }, "/movies", [a], "complete", [a, b]).id, a.id);
});
