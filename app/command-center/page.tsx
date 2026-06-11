import CommandCenter from "@/components/CommandCenter";

export const metadata = { title: "CEREBRO · Command Center" };

export default function CommandCenterPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#04050a", padding: 16, display: "flex", flexDirection: "column" }}>
      <CommandCenter />
    </main>
  );
}
