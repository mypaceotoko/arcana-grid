import "./globals.css";

export const metadata = {
  title: "ARCANA GRID",
  description: "Online Tactical Card Battle",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
