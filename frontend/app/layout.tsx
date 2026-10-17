import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import LenisProvider from "../components/LenisProvider";

export const metadata: Metadata = {
  title: "OIG — OrgInGraphs",
  description: "Make your company knowledge discoverable and connected.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><LenisProvider>{children}</LenisProvider></body>
    </html>
  );
}
