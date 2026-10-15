'use client'

import dynamic from 'next/dynamic'

// Client-only: the app reads localStorage on first render and uses browser audio APIs.
const MeetingApp = dynamic(() => import('./MeetingApp'), { ssr: false })

export default function MeetingClient() {
  return <MeetingApp />
}
