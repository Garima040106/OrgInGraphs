import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import LenisProvider from "../components/LenisProvider";

export const metadata: Metadata = {
  title: {
    default: "OrgInGraphs — Company Intelligence Hub",
    template: "%s | OrgInGraphs",
  },
  description:
    "Connect your company's knowledge across Confluence, Jira, GitHub, Slack, and your people directory with OrgInGraphs.",
  applicationName: "OrgInGraphs",
  icons: {
    icon: "/img/logo.png",
    shortcut: "/img/logo.png",
    apple: "/img/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}