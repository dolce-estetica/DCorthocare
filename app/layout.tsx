export const metadata = {
  title: 'DC Ortho Care — Clinic Books & Billing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
