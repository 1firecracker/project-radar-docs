function invalidPath(message: string): never {
  throw new Error(`Invalid content path: ${message}`);
}

export function validateContentPath(input: string): string {
  if (typeof input !== "string" || input.length === 0) invalidPath("empty");
  if (input.includes("\0")) invalidPath("NUL byte");
  if (input.startsWith("/") || /^[A-Za-z]:[\\/]/.test(input)) {
    invalidPath("absolute path");
  }

  const normalized = input.replaceAll("\\", "/").normalize("NFC");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    invalidPath("unsafe segment");
  }
  if (segments.some((segment) => segment.startsWith("."))) {
    throw new Error("Hidden path is not allowed");
  }
  return segments.join("/");
}

export function resolveContentPath(from: string, target: string): string {
  const source = validateContentPath(from);
  if (typeof target !== "string" || target.length === 0) invalidPath("empty target");
  if (target.startsWith("/") || /^[A-Za-z][A-Za-z\d+.-]*:/.test(target)) {
    invalidPath("external or absolute target");
  }

  const cleanTarget = target.split(/[?#]/, 1)[0].replaceAll("\\", "/");
  const stack = source.split("/").slice(0, -1);
  for (const segment of cleanTarget.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) invalidPath("target escapes root");
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return validateContentPath(stack.join("/"));
}

export function documentHref(path: string): string {
  const safePath = validateContentPath(path);
  if (safePath === "README.md") return "/";
  return `/docs/${safePath.split("/").map(encodeURIComponent).join("/")}`;
}
