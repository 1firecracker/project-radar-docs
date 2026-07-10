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

function routePathFromHash(hash: string): string {
  const route = hash.replace(/^#/, "") || "/";
  // Hashes may include a document anchor or query string after the route.
  // Strip those suffixes before validating the content path.
  return route.split(/[?#]/, 1)[0] || "/";
}

export function isDocumentRouteHash(hash: string): boolean {
  const route = routePathFromHash(hash);
  return route === "/" || (route.startsWith("/docs/") && route.length > "/docs/".length);
}

export function documentPathFromHash(hash: string): string {
  const route = routePathFromHash(hash);
  if (route === "/") return "README.md";
  if (!route.startsWith("/docs/")) return "README.md";
  return validateContentPath(
    route.slice("/docs/".length).split("/").map(decodeURIComponent).join("/"),
  );
}
