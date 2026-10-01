import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteChrome } from "../components/SiteChrome";

export const metadata: Metadata = {
  title: "OpenWallstreet | Company research",
  description:
    "Explore the decisions, promises, and outcomes behind company leadership, with evidence and context.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
