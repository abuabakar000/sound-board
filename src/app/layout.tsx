import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SonicPad // Premium Interactive Soundboard",
  description: "An ultra-low-latency, glassmorphic soundboard for IRL calling, games, and streaming. Play sounds instantly with custom keyboard keybinds, stored securely on your local device.",
  icons: {
    icon: "/favicon.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
