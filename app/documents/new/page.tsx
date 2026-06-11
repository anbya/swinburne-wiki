import { redirect } from "next/navigation";

export default function OldDocumentNewPage() {
  redirect("/documents/new");
}
