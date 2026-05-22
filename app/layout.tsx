import type { Metadata } from "next";
import "./globals.css";
import { CerebroBackground } from "@/components/CerebroBackground";

export const metadata: Metadata = {
  title: "The Operator — by Black Vault",
  description: "Hire your Operator. An AI agent that builds and runs a premium apparel brand on Shopify + Printful in 48 hours."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        {/* CerebroBackground sits at z-index: -3, behind .app-background
            (-2) and the grid overlay (-1), so it provides an ambient
            glow layer on every page including the (now dark) marketing
            and onboard surfaces. */}
        <CerebroBackground />
        <div className="app-background" aria-hidden="true">
          <div className="app-background-media" />
          <div className="app-background-overlay" />
        </div>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
