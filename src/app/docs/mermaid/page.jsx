'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/docs/mermaid.md'

export default function MermaidDocsPage() {
  return (
    <CanvasPageLayout
      title="Mermaid Support"
      description="Which Mermaid diagrams LixSketch imports, the supported syntax for each, styling and limitations."
      icon="bx bx-git-branch"
      tags={['mermaid', 'import', 'flowchart', 'sequence', 'reference']}
      breadcrumbs={[
        { label: 'Docs', href: '/docs' },
        { label: 'Mermaid' },
      ]}
      backHref="/docs"
      backLabel="Back to Docs"
      content={content}
    />
  )
}
