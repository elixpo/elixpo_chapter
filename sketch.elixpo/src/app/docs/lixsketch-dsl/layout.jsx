export const metadata = {
  title: '.lixsketch Format & DSL — LixSketch Docs',
  description: 'Complete reference for the .lixsketch text file format and DSL: shapes, properties, bindings, frames, groups, errors and grammar.',
  openGraph: {
    title: 'The .lixsketch Format & DSL',
    description: 'Every shape, property and setting of the LixSketch text format, with the EBNF grammar.',
    url: '/docs/lixsketch-dsl',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch .lixsketch format reference' }],
  },
  alternates: { canonical: '/docs/lixsketch-dsl' },
}

export default function LixSketchDslDocsLayout({ children }) {
  return children
}
