import { reconcileSelection } from "@yoophi/collection-core";

export type DirectorySelection = { rootPath: string | null; id: string | null };
export type DirectorySelectionStatus = "inProgress" | "complete" | "error";

type DirectoryNodeLike = { id: string; children: readonly DirectoryNodeLike[] };

function directoryIds(nodes: readonly DirectoryNodeLike[]): string[] {
  return nodes.flatMap((node) => [node.id, ...directoryIds(node.children)]);
}

/** Partial scans cannot prove a previously selected directory was removed. */
export function reconcileDirectorySelection(
  current: DirectorySelection,
  rootPath: string | null,
  visibleNodes: readonly DirectoryNodeLike[],
  status: DirectorySelectionStatus,
  completeNodes: readonly DirectoryNodeLike[] = visibleNodes,
): DirectorySelection {
  if (rootPath === null) {
    return current.rootPath === null && current.id === null ? current : { rootPath: null, id: null };
  }

  const previousId = current.rootPath === rootPath ? current.id : null;
  const fallback = visibleNodes[0]?.id ?? null;
  // A partial/error snapshot cannot invalidate a selection from the last complete scan.
  const candidates = status === "complete" ? directoryIds(completeNodes) : [previousId, fallback].filter((id): id is string => id !== null);
  const id = reconcileSelection(previousId, candidates, () => fallback);
  return current.rootPath === rootPath && current.id === id ? current : { rootPath, id };
}
