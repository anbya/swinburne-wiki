import { WikiManagementClient } from "../wiki-management/WikiManagementClient";

export default async function WikiPage({
  searchParams,
}: {
  searchParams?: Promise<{ categoryId?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const raw = resolvedSearchParams?.categoryId;
  const categoryId = typeof raw === "string" ? raw : "";

  return (
    <WikiManagementClient
      key={categoryId}
      initialCategoryId={categoryId}
      mode="view"
    />
  );
}
