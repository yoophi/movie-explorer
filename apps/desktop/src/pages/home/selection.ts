export type DirectorySelection = { rootPath: string | null; id: string | null };
export type DirectorySelectionStatus = "inProgress" | "complete" | "error";

type DirectoryNodeLike = { id: string; children: readonly DirectoryNodeLike[] };

function containsDirectory(nodes: readonly DirectoryNodeLike[], id: string): boolean {
  return nodes.some((node) => node.id === id || containsDirectory(node.children, id));
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
  let id = previousId;
  if (id === null || (status === "complete" && !containsDirectory(completeNodes, id))) {
    id = visibleNodes[0]?.id ?? null;
  }
  return current.rootPath === rootPath && current.id === id ? current : { rootPath, id };
}
