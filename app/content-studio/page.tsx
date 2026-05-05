import Link from "next/link";
import { ContentStudioPanel } from "@/components/content-studio/ContentStudioPanel";
import "./content-studio.css";

export const dynamic = "force-dynamic";

export default function ContentStudioPage() {
  return (
    <div className="page-shell">
      <nav
        style={{
          display: "flex",
          justifyContent: "flex-start",
          padding: "12px 16px 0",
          fontSize: 13
        }}
      >
        <Link href="/" style={{ color: "rgba(255, 255, 255, 0.6)", textDecoration: "none" }}>
          ← Back to operator
        </Link>
      </nav>
      <header className="cs-header">
        <span className="eyebrow">Content Studio</span>
        <h1 className="cs-title">AI content factory</h1>
        <p className="cs-sub">
          Upload real product photos. The pipeline generates lifestyle images, short videos (when video provider is configured),
          and platform-native captions for Instagram, TikTok, Pinterest, X, and YouTube. Copy what you need, paste it
          into each platform, mark as posted.
        </p>
      </header>
      <ContentStudioPanel />
    </div>
  );
}
