import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Build a FaleraOS App",
  description: "Learn the FaleraOS app structure, lifecycle hooks, manifest format, drawing API, input model, assets, persistence, and badge deployment workflow.",
  path: "/docs/apps/",
  keywords: ["FaleraOS app development", "MicroPython app tutorial", "ESP32 UI development"],
  type: "article",
});

export default function AppDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
