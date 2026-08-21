import type { Metadata } from 'next';
import { Chakra_Petch, Manrope } from 'next/font/google';
import './globals.css';

// Display face: angular, telemetry-flavoured — headings, numerals, buttons.
const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-face',
  display: 'swap',
});

// Body face: variable, high legibility at small sizes — everything readable.
const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body-face',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Circuit Break',
  description: 'The office trivia grand prix',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
