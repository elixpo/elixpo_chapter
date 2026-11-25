'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/docs/lixsketch-dsl.md'

export default function LixSketchDslDocsPage() {
  return (
    <CanvasPageLayout
      title=".lixsketch Format & DSL"
      description="Reference for the .lixsketch text format: every shape, property, connection and setting, with the EBNF grammar."
      icon="bx bx-code-curly"
      tags={['dsl', 'file format', 'lixscript', 'reference']}
      breadcrumbs={[
        { label: 'Docs', href: '/docs' },
        { label: '.lixsketch DSL' },
      ]}
      backHref="/docs"
      backLabel="Back to Docs"
      content={content}
    />
  )
}
