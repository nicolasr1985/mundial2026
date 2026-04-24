// app/layout.tsx
import "./globals.css";
import ClientLayout from "./client-layout";

export const metadata = {
  title: "Polla Mundial 2026",
  description: "Haz tus predicciones del Mundial 2026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}