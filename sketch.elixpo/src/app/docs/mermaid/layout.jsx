export const metadata = {
  title: 'Mermaid Support — LixSketch Docs',
  description: 'Import Mermaid flowcharts, sequence, ER, pie and XY charts into LixSketch as editable shapes. Supported syntax, styling and limitations.',
  openGraph: {
    title: 'Mermaid Support in LixSketch',
    description: 'Supported Mermaid diagram types, syntax subset, styling and limitations.',
    url: '/docs/mermaid',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch Mermaid support' }],
  },
  alternates: { canonical: '/docs/mermaid' },
}

export default function MermaidDocsLayout({ children }) {
  return children
}
