import { redirect } from "next/navigation";

type DocumentDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OldDocumentDetailPage({
  params,
}: DocumentDetailPageProps) {
  const { id } = await params;
  redirect(`/documents/${encodeURIComponent(id)}`);
}
