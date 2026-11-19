import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Copilote projet',
  description: 'Questions-réponses sourcées sur les documents, le suivi, l’annuaire et les emails du projet.',
  manifest: '/copilote.webmanifest',
  appleWebApp: { capable: true, title: 'Copilote', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/copilote-192.png', apple: '/icons/copilote-180.png' },
}

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function CopiloteLayout({ children }: { children: React.ReactNode }) {
  return children
}
