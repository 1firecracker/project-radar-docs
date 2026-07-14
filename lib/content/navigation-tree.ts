import { orderedDocuments } from "./manifest";
import type { ContentManifest, ManifestFile } from "./types";

export interface NavigationDocumentNode {
  type: "document";
  file: ManifestFile;
}

export interface NavigationFolderNode {
  type: "folder";
  name: string;
  path: string;
  children: NavigationNode[];
}

export type NavigationNode = NavigationDocumentNode | NavigationFolderNode;

export function documentTitle(file: ManifestFile): string {
  if (file.path === "README.md") return "文档总览";
  const filename = file.path.split("/").at(-1) ?? file.path;
  return filename.replace(/\.(?:md|html?)$/i, "");
}

export function buildNavigationTree(manifest: ContentManifest): NavigationNode[] {
  const root: NavigationNode[] = [];

  for (const file of orderedDocuments(manifest)) {
    const segments = file.path.split("/");
    segments.pop();
    let children = root;
    let folderPath = "";

    for (const segment of segments) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      let folder = children.find(
        (node): node is NavigationFolderNode =>
          node.type === "folder" && node.path === folderPath,
      );
      if (!folder) {
        folder = { type: "folder", name: segment, path: folderPath, children: [] };
        children.push(folder);
      }
      children = folder.children;
    }

    children.push({ type: "document", file });
  }

  return root;
}
