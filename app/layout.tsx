import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Radar 文档",
  description: "Project Radar 的产品、需求、技术设计、实施计划与决策记录。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
