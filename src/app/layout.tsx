import type { Metadata } from "next";
import type { ReactNode } from "react";

import { projectMetadata } from "@/lib/project";

import "./globals.css";

export const metadata: Metadata = {
  title: projectMetadata.name,
  description: projectMetadata.description,
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
