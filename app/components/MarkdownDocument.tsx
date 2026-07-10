import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { findManifestFile } from "../../lib/content/manifest";
import { contentObjectUrl } from "../../lib/content/client";
import {
  documentHref,
  resolveContentPath,
} from "../../lib/content/paths";
import type { ContentManifest } from "../../lib/content/types";

interface MarkdownDocumentProps {
  manifest: ContentManifest;
  path: string;
  source: string;
}

function isExternal(value: string): boolean {
  return /^(?:[A-Za-z][A-Za-z\d+.-]*:|\/\/)/.test(value);
}

function splitSuffix(value: string): [string, string] {
  const index = value.search(/[?#]/);
  return index === -1 ? [value, ""] : [value.slice(0, index), value.slice(index)];
}

function resolveUrl(
  value: string | undefined,
  path: string,
  manifest: ContentManifest,
): string | undefined {
  if (!value || value.startsWith("#") || isExternal(value)) return value;
  const [target, suffix] = splitSuffix(value);
  try {
    const resolved = resolveContentPath(path, decodeURIComponent(target));
    const file = findManifestFile(manifest, resolved);
    if (!file) return value;
    if (file.kind === "markdown" || file.kind === "html") {
      return `${documentHref(file.path)}${suffix}`;
    }
    return `${contentObjectUrl(manifest, file.sha256)}${suffix}`;
  } catch {
    return value;
  }
}

export function MarkdownDocument({
  manifest,
  path,
  source,
}: MarkdownDocumentProps) {
  const components: Components = {
    a({ href, children, ...props }) {
      const resolved = resolveUrl(href, path, manifest);
      const external = Boolean(resolved && isExternal(resolved));
      return (
        <a
          {...props}
          href={resolved}
          rel={external ? "noreferrer" : undefined}
          target={external ? "_blank" : undefined}
        >
          {children}
        </a>
      );
    },
    img({ src, alt, ...props }) {
      const resolvedSrc =
        typeof src === "string" ? resolveUrl(src, path, manifest) : src;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img {...props} src={resolvedSrc} alt={alt ?? ""} />
      );
    },
  };

  return (
    <article className="markdown-document">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}
