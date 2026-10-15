import type { MetadataRoute } from 'next'

// Lets Chrome/Edge "Install" the Meeting Copilot as a desktop app (own window and dock/taskbar icon).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Meeting Copilot',
    short_name:       'Copilot',
    start_url:        '/meeting',
    scope:            '/',
    display:          'standalone',
    background_color: '#09090b',
    theme_color:      '#09090b',
    icons: [
      { src: '/meeting-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/meeting-icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/meeting-icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
