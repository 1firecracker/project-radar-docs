import { notFound } from "next/navigation";
import { DocsSite } from "../../components/DocsSite";
import { validateContentPath } from "../../../lib/content/paths";

interface DocumentPageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { slug } = await params;
  try {
    return <DocsSite initialPath={validateContentPath(slug.join("/"))} />;
  } catch {
    notFound();
  }
}
