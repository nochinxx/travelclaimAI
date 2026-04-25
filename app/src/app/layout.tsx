import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TravelClaim AI",
  description: "Regulation retrieval for travel claim policy review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
