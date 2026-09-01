import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DC Ortho Care — Clinic Books & Billing",
  description: "Clinic books & billing for DC Ortho Care",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
