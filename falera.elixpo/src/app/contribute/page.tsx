import { NextStep } from "@/components/ui";
import ContributeTracks from "@/components/ContributeTracks";
import RepoDoc from "@/components/RepoDoc";

// The guide below is CONTRIBUTING.md, rendered at build time (with its
// Mermaid diagrams drawn as static SVG, src/lib/diagrams.ts); edit that
// file, not this page.

export default function ContributePage() {
  return (
    <>
    <RepoDoc
      file="CONTRIBUTING.md"
      childrenTone="green"
      lumi="You don't need a badge to start: most of FaleraOS is tested on an ordinary computer."
      chip="made by humans, with humans"
      title={
        <>
          Contribute to Falera. <em>Bring snacks.</em>
        </>
      }
      lead="FaleraOS is open: the OS, its apps, the falera CLI, the hardware and the docs. Most of it is tested on an ordinary computer, so you can start without a badge. Pick one of four paths; each opens its own issue form."
      quickLinks={[
        { label: "How it goes", href: "#how-a-contribution-goes" },
        { label: "Without a badge", href: "#start-without-a-badge" },
        { label: "With a badge", href: "#with-a-badge" },
        { label: "Checks", href: "#checks-before-a-pull-request" },
        { label: "GSoC 2027", href: "#google-summer-of-code-2027" },
      ]}
      bodyTitle="The contributing guide"
      related={[
        { href: "/docs/apps/", title: "Writing FaleraOS apps", description: "The app layout, lifecycle, input, drawing and how to check an app." },
        { href: "/hacks/", title: "Badge hacks", description: "Step-by-step recipes, each one a Markdown file you can improve." },
      ]}
    >
      <ContributeTracks />
    </RepoDoc>
    <NextStep
      title={<>Can&apos;t write code this week? <em>Back the boards.</em></>}
      body="The first Falera PCBs are funded by the community. Every supporter is thanked by name."
      href="/supporters/"
      cta="Support Falera"
    />
    </>
  );
}
