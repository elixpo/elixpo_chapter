import { buildMetadata, jsonLd } from '@/lib/seo';
import Link from 'next/link';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';
import '../styles/tools.css';
import QrGenerator from './QrGenerator';

const pageTitle = 'Free QR Code Generator — URL to QR Code in Seconds';
const pageDescription =
  'Free QR code generator: turn any URL into a QR code and download it as SVG, PNG, or JPEG — no sign-up required. Upgrade for custom styles, logos, and QR scan tracking.';

export const metadata = buildMetadata({
  title: pageTitle,
  description: pageDescription,
  path: '/generate',
  keywords: [
    'free QR code generator',
    'QR code generator',
    'URL to QR code',
    'link QR code generator',
    'QR code generator no sign up',
    'SVG QR code generator',
    'custom QR code with logo',
    'tracked QR code',
    'dynamic QR code',
    'QR code scan analytics',
  ],
});

const faqs = [
  {
    question: 'Can I create a QR code for free?',
    answer:
      'Yes. Paste a complete web address, choose one of the three basic styles, and export the QR code as SVG, PNG, or JPEG. Basic generation does not require an account.',
  },
  {
    question: 'What is a tracked QR code?',
    answer:
      'A tracked QR code contains a Lixrl short link. When someone scans it, the redirect records activity that the link owner can review in the dashboard.',
  },
  {
    question: 'Which QR features require a paid plan?',
    answer:
      'Pro and Business unlock the complete style catalog, custom center logos, and the tracked QR workflow. Business keeps scan activity history for longer.',
  },
  {
    question: 'Which download format should I use?',
    answer:
      'SVG is best for print because it stays sharp at any size. PNG preserves crisp detail for digital use. JPEG produces a smaller shareable image and can be copied directly in supported browsers.',
  },
];

export default function QrCodeGeneratorPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'Lixrl Quick QR Code Generator',
        url: 'https://lixrl.com/generate',
        description: pageDescription,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern web browser',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Basic QR code generation with three styles',
        },
        featureList: [
          'Generate a QR code from a URL',
          'Download QR codes as SVG, PNG, or JPEG',
          'Copy a compressed JPEG QR code to the clipboard',
          'Choose QR code styles',
          'Add a custom logo on paid plans',
          'Track QR code scans on paid plans',
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://lixrl.com',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'QR Code Generator',
            item: 'https://lixrl.com/generate',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      <main id="main-content">
        <section className="shell pb-14 pt-10 md:pb-20 md:pt-16" aria-labelledby="qr-generator-heading">
          <header className="mb-8 grid gap-5 border-b border-line pb-8 md:mb-10 md:pb-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="eyebrow">Free tool · No account required</p>
              <h1 id="qr-generator-heading" className="display-2">
                Create a QR code, <em>ready to print.</em>
              </h1>
            </div>
            <div>
              <p className="lede max-w-md">Paste a link, pick a style, and download a sharp SVG, PNG, or JPG in seconds.</p>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Included for free">
                {['SVG · PNG · JPG', 'Three styles', 'Runs in your browser'].map((item) => (
                  <li key={item} className="badge border border-line bg-white text-[#5f6962]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </header>
          <QrGenerator />
        </section>

        <section className="border-y border-line bg-paper-soft" aria-labelledby="qr-how">
          <div className="shell py-14 md:py-20">
            <div className="mb-8 max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 id="qr-how" className="display-2 !text-[clamp(1.9rem,4vw,3rem)]">
                Three steps from link to print
              </h2>
            </div>
            <ol className="tool-steps">
              <li>
                <b aria-hidden="true">01</b>
                <h3>Paste a link</h3>
                <p>Any public web address works. Basic codes are generated locally and open the destination directly.</p>
              </li>
              <li>
                <b aria-hidden="true">02</b>
                <h3>Pick a style</h3>
                <p>Three styles are free. Pro and Business unlock the full catalog and a custom center logo.</p>
              </li>
              <li>
                <b aria-hidden="true">03</b>
                <h3>Download or copy</h3>
                <p>SVG stays sharp at any print size; PNG suits screens; a compressed JPG copies straight to the clipboard.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="shell grid gap-10 py-16 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:items-center" aria-labelledby="tracked-qr-codes">
          <div>
            <p className="eyebrow">Optional scan tracking</p>
            <h2 id="tracked-qr-codes" className="display-2 !text-[clamp(1.9rem,4vw,3rem)]">
              Make the QR code <em>measurable.</em>
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#5f6962]">
              A normal QR code opens the destination directly. A tracked QR code opens a Lixrl short link first, so paid members can review scan activity without changing the printed code.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/pricing" className="btn-primary">
                Compare QR features
              </Link>
              <Link href="/docs/cli#qr-codes" className="btn-secondary">
                QR codes from the CLI
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="glass-card p-6 md:p-7">
              <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5f6962]">Free</p>
              <h3 className="mt-3 text-xl font-bold tracking-[-0.04em]">Basic QR code</h3>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-[#5f6962]">
                {['Directly opens the destination URL', 'Three included visual styles', 'SVG, PNG, and JPEG exports', 'Compressed JPEG clipboard copy', 'No account required'].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c3c9c3]" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className="art-panel rounded-[1.4rem] border border-[rgba(49,95,202,0.18)] bg-[#dce7ff] p-6 md:p-7">
              <i className="art-ring" aria-hidden="true" />
              <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#2f56b0]">Pro &amp; Business</p>
              <h3 className="mt-3 text-xl font-bold tracking-[-0.04em]">Tracked QR code</h3>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-[#3d4842]">
                {['Uses a persistent Lixrl short link', 'Complete visual style catalog', 'Custom center logo', 'Scan activity in the dashboard'].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#3a65c7]" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="mx-auto w-[min(calc(100%-2rem),1000px)] pb-20 md:pb-28" aria-labelledby="qr-faq">
          <div className="text-center">
            <p className="eyebrow">QR code questions</p>
            <h2 id="qr-faq" className="display-2 !text-[clamp(1.9rem,4vw,3rem)]">Everything needed before downloading</h2>
          </div>
          <div className="mt-8 divide-y divide-[#d7dbd6] rounded-[1.4rem] border border-line bg-white px-5 md:px-7">
            {faqs.map((item) => (
              <details key={item.question} className="group py-2">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 rounded-xl font-bold [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d7dbd6] text-lg font-normal text-[#5f6962] transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="max-w-2xl pb-4 pr-10 pt-1 text-sm leading-6 text-[#5f6962]">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
        />
      </main>

      <Footer />
    </div>
  );
}
