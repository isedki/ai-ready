import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Copilote projet',
  description: 'Questions-réponses sourcées sur les documents, le suivi, l’annuaire et les emails du projet.',
}

export default function CopiloteLayout({ children }: { children: React.ReactNode }) {
  return children
}
