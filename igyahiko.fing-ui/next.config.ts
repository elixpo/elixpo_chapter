import { createMDX } from 'fumadocs-mdx/next'
import { NextConfig } from 'next'

const withMDX = createMDX({
  // If your source.config.ts is in root
  configPath: "source.config.ts",
})

/** @type {import('next').NextConfig} */
const nextConfig:NextConfig = {

  reactStrictMode: true,
  pageExtensions: ["ts","tsx","js","jsx","md","mdx"],
  outputFileTracingIncludes: {
      "/**": ["components/FingUIComponents/**/*"]
  },
  async headers() {
     return [
         {
           source: "/r/:path*",
           headers: [
             {
               key: "Cache-Control",
               value: "public, max-age-31536000, immutable"
             }
           ]
         }
     ]
  },
  images: {
      remotePatterns: [
        {
           hostname: "*"
        }
      ]
  },
  experimental: {
    turbo: {
      root: "/Users/yahikonamikaze/Documents/My_project/FingUI/fingui",
    },
  },
  eslint: {
     ignoreDuringBuilds: true
  }
}

export default withMDX(nextConfig)
