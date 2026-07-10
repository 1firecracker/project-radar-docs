import { validateContentPath } from "../content/paths";

export function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function withBasePath(basePath: string, pathname: string): string {
  const base = normalizeBasePath(basePath);
  return `${base}/${pathname.replace(/^\/+/, "")}`;
}

export function pagesDocumentHref(path: string): string {
  const safe = validateContentPath(path);
  if (safe === "README.md") return "#/";
  return `#/docs/${safe.split("/").map(encodeURIComponent).join("/")}`;
}

export function documentPathFromHash(hash: string): string {
  const route = hash.replace(/^#/, "") || "/";
  if (route === "/") return "README.md";
  if (!route.startsWith("/docs/")) return "README.md";
  return validateContentPath(
    route.slice("/docs/".length).split("/").map(decodeURIComponent).join("/"),
  );
}
