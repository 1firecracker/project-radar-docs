import { useEffect, useState } from "react";
import { DocsSite } from "../app/components/DocsSite";
import {
  documentPathFromHash,
  isDocumentRouteHash,
  pagesDocumentHref,
} from "../lib/pages/routing";

export function PagesApp() {
  const [path, setPath] = useState(() =>
    documentPathFromHash(window.location.hash),
  );

  useEffect(() => {
    const update = () => {
      const { hash } = window.location;
      if (!isDocumentRouteHash(hash)) return;
      setPath(documentPathFromHash(hash));
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return (
    <DocsSite
      key={path}
      initialPath={path}
      basePath={import.meta.env.BASE_URL}
      documentHrefFor={pagesDocumentHref}
    />
  );
}
