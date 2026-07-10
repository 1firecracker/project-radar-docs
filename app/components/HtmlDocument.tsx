import { withBasePath } from "../../lib/pages/routing";

interface HtmlDocumentProps {
  path: string;
  title: string;
  staticSnapshot?: boolean;
  basePath?: string;
}

export function HtmlDocument({
  path,
  title,
  staticSnapshot = false,
  basePath = "",
}: HtmlDocumentProps) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const src = staticSnapshot
    ? withBasePath(basePath, `/content/raw/${encodedPath}`)
    : `/raw/${encodedPath}`;
  return (
    <iframe
      className="html-document-frame"
      sandbox=""
      src={src}
      title={`${title} HTML 文档`}
    />
  );
}
