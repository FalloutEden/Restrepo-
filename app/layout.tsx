import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Black Vault Umbrella Operator",
  description: "Managing-director agent for the Restrepo commerce pipeline. Chat-driven. Autonomous between visits."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <div className="app-background" aria-hidden="true">
          <div className="app-background-media" />
          <div className="app-background-overlay" />
        </div>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
