import type { Metadata } from "next";
import "./globals.css";

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
        <div className="app-background" aria-hidden="true">
          <div className="app-background-media" />
          <div className="app-background-overlay" />
        </div>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
