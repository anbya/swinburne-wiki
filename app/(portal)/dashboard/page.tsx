import { ChatWorkspace } from "../_components/chat-workspace";

export default async function DashboardPage(
  props: PageProps<"/dashboard">
) {
  const searchParams = await props.searchParams;
  const sessionId = (searchParams.sessionId ?? "").trim();

  return <ChatWorkspace mode={sessionId ? "dashboard" : "new"} />;
}
