interface HtmlDocumentProps {
  path: string;
  title: string;
}

export function HtmlDocument({ path, title }: HtmlDocumentProps) {
  const src = `/raw/${path.split("/").map(encodeURIComponent).join("/")}`;
  return (
    <iframe
      className="html-document-frame"
      sandbox=""
      src={src}
      title={`${title} HTML 文档`}
    />
  );
}
