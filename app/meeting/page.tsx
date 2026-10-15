import type { Metadata } from 'next'
import MeetingClient      from '@/components/meeting/MeetingClient'

export const metadata: Metadata = {
  title:  'Meeting Copilot',
  robots: { index: false, follow: false },
}

export default function MeetingPage() {
  return <MeetingClient />
}
