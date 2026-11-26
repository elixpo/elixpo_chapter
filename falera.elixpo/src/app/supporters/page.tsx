import PressStrip from "@/components/PressStrip";
import SupportersLive from "@/components/SupportersLive";
import { Card, PageHeader, Section, SectionHeader } from "@/components/ui";
import { FUND_URL } from "@/lib/links";

const TEAM = [
  { name: "Ayushman Bhattacharya", role: "Founder, hardware and FaleraOS", href: "https://github.com/Circuit-Overtime" },
  { name: "Anwesha Chakraborty", role: "Core maintainer, RV565 co-author", href: "https://github.com/anwe-ch" },
  { name: "Vivek Yadav", role: "Lead co-developer", href: "https://github.com/ez-vivek" },
];
const THANKS = ["Divyanshu Jha", "Karan Ray", "Bhumika Sudarshani"];

export default function SupportersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Community · first boards in fabrication"
        title={<>The people building <em>Falera with us.</em></>}
        lede="Falera has no investor behind it. The first five boards were paid for out of pocket, and the community is funding the rest. Everyone who chips in is thanked here, by name."
      />

      <Section id="fundraiser" tone="ink">
        <SupportersLive />
      </Section>

      <Section id="team">
        <SectionHeader eyebrow="The team" title={<>Built <em>by.</em></>} />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {TEAM.map((m) => (
            <Card key={m.name} href={m.href} className="p-6">
              <p className="h-card group-hover:text-primary">{m.name}</p>
              <p className="mt-1 text-sm text-text-dim">{m.role}</p>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm text-text-dim">
          With thanks to {THANKS.slice(0, -1).join(", ")} and {THANKS[THANKS.length - 1]}, who were
          there from the start.
        </p>
      </Section>

      <Section id="press">
        <PressStrip />
      </Section>

      <Section id="sponsors" tone="red">
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <SectionHeader
            eyebrow="Sponsors"
            title={<>Become a <em>founding sponsor.</em></>}
            lede={<>Hardware makers, chip companies and developer-tool teams: help us take Falera from five hand-built boards to a factory batch. Write to <span className="select-all font-mono text-text">hello@elixpo.com</span>.</>}
          />
          <a href={FUND_URL} target="_blank" rel="noreferrer" className="btn-accent justify-self-start">
            Fund the badge
          </a>
        </div>
      </Section>
    </>
  );
}
