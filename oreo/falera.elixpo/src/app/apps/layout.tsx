import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "FaleraOS App Library: games and tools for the Falera Badge",
  description: "Explore the open-source apps, games, hardware tools, Gallery, file transfer, OTA updates, and on-device app store included with FaleraOS.",
  path: "/apps/",
  keywords: ["FaleraOS apps", "ESP32-S3 apps", "MicroPython games", "embedded app store"],
});

export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
