import './globals.css';
import type { Metadata } from 'next';
import LogoutButton from './components/LogoutButton';

export const metadata: Metadata = {
  title: 'ZW Clipper',
  description: 'Pipeline de edición de video con IA — ZW Labs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="border-b border-line px-6 py-4 flex items-center gap-3">
          <span className="font-black text-lg tracking-tight">ZW<span className="text-amber">·</span>CLIPPER</span>
          <span className="tag">crudo → listo para publicar</span>
          <LogoutButton />
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
