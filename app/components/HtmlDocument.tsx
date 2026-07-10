interface HtmlDocumentProps {
  path: string;
  title: string;
  staticSnapshot?: boolean;
}

export function HtmlDocument({ path, title, staticSnapshot = false }: HtmlDocumentProps) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const src = staticSnapshot ? `/content/raw/${encodedPath}` : `/raw/${encodedPath}`;
  return (
    <iframe
      className="html-document-frame"
      sandbox=""
      src={src}
      title={`${title} HTML 文档`}
    />
  );
}
