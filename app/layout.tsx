import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Umbrella Commerce Division",
  description: "8-agent autonomous commerce group — research, route, build, ship."
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
