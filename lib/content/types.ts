export type ContentKind = "markdown" | "html" | "asset";

export interface ManifestFile {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  kind: ContentKind;
}

export interface ContentManifest {
  schemaVersion: 1;
  revision: string;
  generatedAt: string;
  files: ManifestFile[];
}
