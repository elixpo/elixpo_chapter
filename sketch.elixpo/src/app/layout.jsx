import './globals.css'
import './site.css'
import 'highlight.js/styles/github-dark-dimmed.css'
import InitHljs from '@/components/InitHljs'
const SITE_URL = 'https://sketch.elixpo.com'
const SITE_NAME = 'Elixpo Sketch'
const SITE_TAGLINE = 'Open Source Infinite Canvas, Hand Drawn Aesthetics, Built In Docs Editor'
const SITE_DESCRIPTION =
  'LixSketch is a free, open-source collaborative whiteboard for technical diagrams, wireframes, flowcharts, architecture drawings, and presentations. No login required — start drawing instantly as a guest. Features AI-powered smart editing (Beta), end-to-end encrypted sharing, real-time collaboration with live cursors, a Notion-style docs editor, LixScript DSL for scripted diagrams, 5,000+ icons, and a VS Code extension. Runs entirely in the browser. Forever free.'

// Site routes always render light. Only the workspace routes (/c, /room, /s)
// restore persisted themes, and they restore two independent values before
// React hydrates so neither flashes:
//   - canvas theme  -> localStorage 'lixsketch-canvas-theme' (legacy 'theme'
//                      is read as a fallback; useUIStore migrates it)
//   - UI theme      -> localStorage 'lix_ui_prefs'.uiTheme
// Both default to light. Keep the keys in sync with src/utils/themePreferences.js.
const canvasThemeBootstrap = `
  (() => {
    try {
      if (!/^\\/(c|room|s)\\//.test(location.pathname)) return;
      const themes = ['light', 'dark', 'system'];
      let prefs = {};
      try { prefs = JSON.parse(localStorage.getItem('lix_ui_prefs') || '{}') || {}; } catch (_) {}
      let canvasTheme = localStorage.getItem('lixsketch-canvas-theme');
      if (!themes.includes(canvasTheme)) {
        const legacy = localStorage.getItem('theme');
        canvasTheme = themes.includes(legacy) ? legacy : (themes.includes(prefs.theme) ? prefs.theme : 'light');
      }
      const uiTheme = themes.includes(prefs.uiTheme) ? prefs.uiTheme : 'light';
      const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
      const resolve = (theme) => theme === 'system' ? (prefersDark ? 'dark' : 'light') : (theme === 'dark' ? 'dark' : 'light');
      const canvas = resolve(canvasTheme);
      const ui = resolve(uiTheme);
      const defaults = { dark: '#15111f', light: '#FAFAF9' };
      const palettes = {
        dark: ['#000000', '#161718', '#15111f', '#181605', '#1b1615'],
        light: ['#fafaf9', '#ffffff', '#f6dbc0', '#f5eed2', '#f5f2ed', '#f5dabf'],
      };
      let stored = localStorage.getItem('lixsketch-canvas-background-' + canvas);
      // Mirror readCanvasBackground's one-time move off the old white default
      // so the first frame already uses the soft off-white canvas.
      if (canvas === 'light' && stored && stored.toLowerCase() === '#ffffff'
        && localStorage.getItem('lixsketch-canvas-light-default-v3') !== '1') stored = null;
      const background = stored && palettes[canvas].includes(stored.toLowerCase())
        ? stored
        : defaults[canvas];
      const root = document.documentElement;
      root.dataset.canvasTheme = canvas;
      root.style.colorScheme = ui;
      root.style.setProperty('--lixsketch-canvas-background', background);
      document.body.classList.add('canvas-mode', 'theme-' + canvas, 'ui-' + ui);
    } catch (_) {}
  })();
`
export const metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,

  applicationName: SITE_NAME,
  authors: [{ name: 'Elixpo', url: 'https://elixpo.com' }],
  creator: 'Elixpo',
  publisher: 'Elixpo',
  generator: 'Next.js',

  keywords: [
    'Elixpo Sketch',
    'Elixpo',
    'open source whiteboard',
    'infinite canvas',
    'sketching tool',
    'wireframing tool',
    'diagram tool',
    'eraser.io alternative',
    'excalidraw alternative',
    'tldraw alternative',
    'hand drawn diagrams',
    'roughjs',
    'perfect freehand',
    'real time collaboration',
    'end to end encrypted whiteboard',
    'block editor',
    'WYSIWYG docs editor',
    'LixScript',
    'mermaid diagrams',
    'graph plotting',
    'SVG canvas',
    'architecture diagrams',
    'flowcharts',
    'sequence diagrams',
    'developer tools',
    'product design',
    'system design',
    'free whiteboard',
    'no login whiteboard',
    'collaborative canvas',
    'AI diagram tool',
    'VS Code whiteboard extension',
    'LixSketch',
    'technical presentation tool',
    'online diagramming',
  ],

  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '1024x1024' },
    ],
    apple: [
      { url: '/icon.png', sizes: '1024x1024', type: 'image/png' },
    ],
    shortcut: '/icon.png',
  },
  manifest: '/site.webmanifest',

  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1280,
        height: 720,
        alt: 'Elixpo Sketch, hand drawn infinite canvas with real time collaboration and built in docs editor',
        type: 'image/png',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
    creator: '@elixpo',
    site: '@elixpo',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  alternates: {
    canonical: SITE_URL,
  },

  category: 'technology',
}

export const viewport = {
  themeColor: '#fbfbf8',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Web',
  logo: `${SITE_URL}/icon.png`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  author: {
    '@type': 'Organization',
    name: 'Elixpo',
    url: 'https://elixpo.com',
  },
  image: `${SITE_URL}/og-image.png`,
  screenshot: `${SITE_URL}/og-image.png`,
  featureList: [
    'Infinite canvas with hand-drawn aesthetics',
    'Real-time collaboration with live cursors',
    'E2E encryption for shared canvases',
    'LixScript diagram DSL',
    'Notion-like docs editor',
    'Icon library with 5,000+ icons',
    'PNG and SVG export',
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="stylesheet" href="/boxicons/css/boxicons.min.css" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: canvasThemeBootstrap }} />
        <InitHljs />
        {children}
      </body>
    </html>
  )
}
