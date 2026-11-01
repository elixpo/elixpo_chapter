import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import Rv565Converter from "@/components/Rv565Converter";
import { SITE_URL, pageMetadata } from "@/lib/seo";

const PATH = "/rv565/convert/";

export const metadata = pageMetadata({
  title: "Video to RGB565 Converter for ESP32 and Arduino Displays",
  description:
    "Free online converter: turn an MP4 or WebM into an RV565 RGB565 video or an Arduino clip.h for ST7789 SPI displays on ESP32, ESP32-S3 and Raspberry Pi Pico. Runs in your browser — no upload, no account.",
  path: PATH,
  keywords: [
    "MP4 to RGB565", "video to RGB565 converter", "RGB565 converter", "ESP32 video player",
    "ST7789 video", "Arduino video display", "play video on ESP32", "RV565",
    "TFT_eSPI video", "convert video to C array", "ESP32-S3 SPI display video",
  ],
});

const STEPS = [
  ["Convert", "Drop a video here. Pick the frame size and frame rate; the page writes an .rv565 file and a clip.h for Arduino."],
  ["Install RV565", "Arduino IDE → Library Manager → search “RV565”, or arduino-cli lib install RV565. ESP-IDF and the Pico SDK are supported too."],
  ["Play", "Open the ESP32S3_Player example, replace clip.h with yours, and upload. Large clips can live in a flash partition instead."],
];

const FAQ = [
  {
    q: "Is my video uploaded anywhere?",
    a: "No. The video is decoded by your browser, converted to RGB565 on a canvas and compressed with the browser's built-in zlib. Nothing leaves your device, and there is no account or sign-up.",
  },
  {
    q: "What is the RV565 format?",
    a: "A small video container for microcontrollers: a 12-byte header, then every frame as an independent zlib stream that inflates to the display's native RGB565 pixels. Frames can be decoded in any order, so seeking is instant and a damaged frame never affects the next one. The format is specified in the RV565 repository and described in the paper arXiv:2610.35935.",
  },
  {
    q: "Which boards and displays work?",
    a: "The RV565 library plays these files on ESP32-S3 (measured at 24 FPS with zero missed frames), on other ESP32 chips, and experimentally on the Raspberry Pi Pico 2, with ST7789 SPI panels such as 320×240, 240×240 and 135×240 modules. It also works with TFT_eSPI and LovyanGFX.",
  },
  {
    q: "What frame size and frame rate should I choose?",
    a: "180×135 at 24 FPS is the setting measured in the paper: the board scales it to a 320×240 panel and holds 24 FPS without missed frames on an ESP32-S3. Larger frames look sharper but need more memory and time per frame; the page predicts missed frames for the 180×135 setting.",
  },
  {
    q: "How long can a clip be?",
    a: "Up to 30 seconds and 200 MB of input per conversion, to keep the browser responsive. For longer clips use the rv565 command-line tool (pip install rv565), which streams through FFmpeg.",
  },
  {
    q: "Can I convert without a browser?",
    a: "Yes: pip install rv565, then rv565 encode input.mp4 clip.rv565 --size 180x135 --fps 24, and rv565 c-array clip.rv565 clip.h for Arduino.",
  },
];

export default function ConvertPage() {
  return (
    <article>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "SoftwareApplication",
              name: "RV565 Video Converter",
              url: `${SITE_URL}${PATH}`,
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Any (web browser)",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              description:
                "Converts MP4 and WebM video to RV565 RGB565 video and Arduino C headers for ST7789 displays on ESP32 and Raspberry Pi Pico, entirely in the browser.",
              isAccessibleForFree: true,
              author: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com" },
              sameAs: ["https://github.com/elixpo/rv565"],
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map(({ q, a }) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: { "@type": "Answer", text: a },
              })),
            },
          ],
        }}
      />

      <header className="container-page border-b border-border pb-14 pt-20 sm:pt-28">
        <p className="eyebrow">RV565 · free tool · runs in your browser</p>
        <h1 className="max-w-6xl font-display text-[clamp(2.4rem,5.2vw,5.4rem)] leading-[0.98]">
          Video to <em>RGB565</em>, ready for your ESP32 display.
        </h1>
        <p className="mt-6 max-w-3xl text-[1.05rem] leading-relaxed text-text-dim">
          Turn an MP4 or WebM into an RV565 clip or an Arduino <code className="font-mono">clip.h</code> for ST7789
          SPI panels. Play it with the open-source RV565 library on ESP32-S3, other ESP32 chips or the Raspberry Pi
          Pico 2. No upload, no account.
        </p>
      </header>

      <section className="container-page border-b border-border py-14">
        <Rv565Converter />
      </section>

      <section className="container-page border-b border-border py-20">
        <p className="eyebrow">From video to screen</p>
        <h2 className="mb-10 max-w-4xl font-display text-[clamp(2rem,3.6vw,3.6rem)] leading-[1]">
          Three steps to video on a microcontroller.
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="card-surface flex flex-col p-6">
              <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 font-display text-2xl leading-tight">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <a href="https://github.com/elixpo/rv565" target="_blank" rel="noreferrer" className="btn-primary">
            RV565 library on GitHub <ArrowUpRight className="h-4 w-4" />
          </a>
          <Link href="/paper/" className="btn-ghost">
            Read the paper <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="container-page py-20">
        <p className="eyebrow">Questions</p>
        <h2 className="mb-10 font-display text-[clamp(2rem,3.6vw,3.6rem)] leading-[1]">Frequently asked.</h2>
        <div className="divide-y divide-border rounded-[1.4rem] border border-border bg-card">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group p-6">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                {q}
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </article>
  );
}
