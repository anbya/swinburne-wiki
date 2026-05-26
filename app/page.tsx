import { getServerSessionSafe } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSessionSafe();
  redirect(session ? "/dashboard" : "/login");
}
