'use client';

import dynamic from 'next/dynamic';

// Disable SSR for the Soundboard dashboard since it depends on browser-only Web Audio API and IndexedDB
const Soundboard = dynamic(() => import('../components/Soundboard'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#05070f',
      color: '#94a3b8',
      gap: '16px',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h2 style={{ color: '#fff', fontSize: '1.25rem' }}>Preparing Audio Workspace...</h2>
      <p style={{ fontSize: '0.9rem' }}>SonicPad loading, please wait.</p>
    </div>
  )
});

export default function Home() {
  return <Soundboard />;
}
