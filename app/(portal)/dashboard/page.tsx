import { ChatWorkspace } from "../_components/chat-workspace";

export default async function DashboardPage(
  props: PageProps<"/dashboard">
) {
  const searchParams = await props.searchParams;
  const rawSessionId = searchParams.sessionId;
  const sessionId =
    typeof rawSessionId === "string"
      ? rawSessionId.trim()
      : Array.isArray(rawSessionId)
        ? (rawSessionId.find((value) => typeof value === "string" && value.trim()) ?? "").trim()
        : "";

  return <ChatWorkspace mode={sessionId ? "dashboard" : "new"} />;
}
