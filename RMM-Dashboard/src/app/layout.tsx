import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fixsmith RMM",
  description: "Fixsmith RMM - Remote Monitoring & Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
