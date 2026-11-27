import RepoDoc from "@/components/RepoDoc";
import { pageMetadata } from "@/lib/seo";

// Rendered from docs/USB.md at build time; edit that file, not this page.

export const metadata = pageMetadata({
  title: "Connect the Falera Badge over USB",
  description: "Using the Falera Badge from a computer: which USB-C port, port names on Linux, macOS and Windows, serial permissions, the falera CLI first, and raw mpremote for advanced use.",
  path: "/docs/usb/",
  keywords: ["Falera Badge USB", "ESP32-S3 USB serial", "303a:83ec", "dialout permission", "mpremote", "ttyACM0"],
  type: "article",
});

export default function UsbDocsPage() {
  return (
    <RepoDoc
      file="docs/USB.md"
      chip="docs · USB"
      title="Using the badge from a computer."
      lead="Everything you do with the badge from a computer goes over its USB-C cable, with the falera CLI. Wi-Fi on the badge is for the internet only."
      quickLinks={[
        { label: "Quick start", href: "#quick-start" },
        { label: "Which port", href: "#which-usb-c-port" },
        { label: "Ports and names", href: "#ports-and-names" },
        { label: "Linux permissions", href: "#permissions-on-linux" },
        { label: "Raw mpremote", href: "#advanced-raw-mpremote" },
        { label: "Troubleshooting", href: "#troubleshooting" },
      ]}
      related={[
        { href: "/docs/cli/", title: "The falera CLI", description: "Install it, then every command with examples, exit codes and troubleshooting." },
        { href: "/docs/transfer/", title: "The Transfer app", description: "Send photos, videos and documents with the code the badge shows." },
      ]}
    />
  );
}
