import { ContributorOrbitAvatar, ContributorOrbitRing } from "@/components/ContributorOrbit";
import contributorsData from "@/data/contributors.json";

export const metadata = {
  title: "Community",
  description:
    "Meet the contributors powering the Elixpo ecosystem. Join discussions, contribute code, and help shape the future of open-source AI tools.",
  alternates: { canonical: "/community" },
  openGraph: {
    title: "Community | Elixpo",
    description:
      "Meet the contributors powering the Elixpo ecosystem.",
    images: ["/og-image.webp"],
  },
};

const GITHUB_ORG = "elixpo";
const GITHUB_REPO = "elixpo_chapter";

type Contributor = {
  login: string;
  avatar_url: string;
  contributions: number;
  html_url: string;
};

async function getContributors(): Promise<Contributor[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/contributors?per_page=100`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function CommunityPage() {
  const contributors = await getContributors();

  // Fallback to static data if API fails
  const displayContributors =
    contributors.length > 0
      ? contributors
      : contributorsData.contributors.map((username) => ({
          login: username,
          avatar_url: `https://github.com/${username}.png`,
          contributions: 0,
          html_url: `https://github.com/${username}`,
        }));

  const totalContributions = displayContributors.reduce(
    (sum, c) => sum + c.contributions,
    0
  );

  // Rank by contributions (desc) for the solar system + top-3 badges.
  const ranked = [...displayContributors].sort(
    (a, b) => b.contributions - a.contributions
  );
  const center = ranked[0];
  const orbit1 = ranked.slice(1, 7);
  const orbit2 = ranked.slice(7, 16);
  const orbit3 = ranked.slice(16);

  return (
    <section className="py-24 md:py-32 overflow-hidden">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 mb-20">
        <div className="relative text-center">
          {/* Animated gradient blob */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-accent/20 via-purple-300/10 to-pink-300/10 blur-3xl animate-pulse-slow pointer-events-none" />

          <div className="relative">
            <p className="text-sm font-mono text-accent tracking-widest uppercase mb-4 animate-fade-in">
              Open Source Community
            </p>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 animate-fade-in-up">
              Built by{" "}
              <span className="bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-transparent">
                contributors
              </span>
            </h1>
            <p className="text-lg text-muted max-w-2xl mx-auto leading-relaxed animate-fade-in-up-delay">
              Every line of code in the Elixpo ecosystem is shaped by our
              community. Meet the people behind the projects.
            </p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-4xl mx-auto px-6 mb-20">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-card border border-border p-6 text-center animate-fade-in-up community-stagger-1">
            <p className="text-3xl md:text-4xl font-bold text-accent">
              {displayContributors.length}
            </p>
            <p className="text-sm text-muted mt-1">Contributors</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-6 text-center animate-fade-in-up community-stagger-2">
            <p className="text-3xl md:text-4xl font-bold text-accent">
              {totalContributions > 0 ? `${totalContributions}+` : "500+"}
            </p>
            <p className="text-sm text-muted mt-1">Contributions</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-6 text-center animate-fade-in-up community-stagger-3">
            <p className="text-3xl md:text-4xl font-bold text-accent">13+</p>
            <p className="text-sm text-muted mt-1">Projects</p>
          </div>
        </div>
      </div>

      {/* Contributors grid */}
      <div className="max-w-7xl mx-auto px-6 mb-24">
        <h2 className="text-3xl font-bold tracking-tight mb-2">
          Contributors
        </h2>
        <p className="text-muted mb-10">
          to{" "}
          <a
            href={`https://github.com/${GITHUB_ORG}/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline font-mono"
          >
            {GITHUB_ORG}/{GITHUB_REPO}
          </a>
        </p>

        {/* Solar system - ranked by contributions, top 3 badged */}
        <div className="relative w-full aspect-square max-w-[760px] mx-auto">
          {/* Ambient glow */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] h-[55%] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none" />

          {/* Center - #1 contributor */}
          {center && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <ContributorOrbitAvatar contributor={center} rank={0} size={96} />
            </div>
          )}

          <ContributorOrbitRing items={orbit1} inset="inset-[28%]" spin="animate-orbit-slow" counter="animate-counter-orbit-slow" size={48} startRank={1} />
          <ContributorOrbitRing items={orbit2} inset="inset-[14%]" spin="animate-orbit-medium" counter="animate-counter-orbit-medium" size={40} startRank={7} />
          <ContributorOrbitRing items={orbit3} inset="inset-0" spin="animate-orbit-outer" counter="animate-counter-orbit-outer" size={34} startRank={16} />
        </div>

        <p className="text-center text-sm text-muted mt-10 font-mono">
          {displayContributors.length}+ contributors · ranked by contributions
        </p>
      </div>

      {/* Join the conversation CTA */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="relative rounded-3xl bg-gradient-to-br from-[#161616] via-[#101010] to-black border border-white/10 p-10 md:p-16 overflow-hidden noise-overlay">
          {/* Decorative circles */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/10 blur-2xl" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-[#44386e]/20 blur-2xl" />

          <div className="relative text-center">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Join the conversation
            </h2>
            <p className="text-muted text-lg max-w-xl mx-auto mb-8">
              Ask questions, share ideas, propose features, or just say hello.
              Our GitHub Discussions is where the community comes together.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={`https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/discussions`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-black font-medium text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v9.5A1.75 1.75 0 0 1 14.25 14H8.061l-2.574 2.573A1.458 1.458 0 0 1 3 15.543V14H1.75A1.75 1.75 0 0 1 0 12.25v-9.5C0 1.784.784 1 1.75 1ZM1.5 2.75v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Z" />
                  <path d="M22.5 8.75a.25.25 0 0 0-.25-.25h-3.5a.75.75 0 0 1 0-1.5h3.5c.966 0 1.75.784 1.75 1.75v9.5A1.75 1.75 0 0 1 22.25 20H21v1.543a1.457 1.457 0 0 1-2.487 1.03L15.939 20H10.75A1.75 1.75 0 0 1 9 18.25v-1.465a.75.75 0 0 1 1.5 0v1.465c0 .138.112.25.25.25h5.5a.749.749 0 0 1 .53.22l2.72 2.72v-2.19a.75.75 0 0 1 .75-.75h2a.25.25 0 0 0 .25-.25v-9.5Z" />
                </svg>
                GitHub Discussions
              </a>
              <a
                href={`https://github.com/${GITHUB_ORG}/${GITHUB_REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-border text-foreground font-medium text-sm hover:bg-card transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                View Repository
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
