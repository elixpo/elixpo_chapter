import type { Metadata } from "next";
import { Geist_Mono, Poppins, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/theme/provider";
import { Toaster } from "sonner";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/convex/provider";
import ReduxProvider from "@/redux/provider";
import { ProfileQuery } from "@/convex/query.config";
import { ConvexUserRaw, normalizeProfile } from "@/types/user";

const montserratAlternates = Montserrat_Alternates({
  variable: "--font-montserrat-alternates",
  subsets: ["latin"],
  weight: "400"
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"], // choose what you need
  variable: "--font-poppins",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vision",
  description: "AI-powered wireframing SaaS",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const rawProfile = await ProfileQuery();;
  const profile = normalizeProfile(
     rawProfile._valueJSON as unknown as ConvexUserRaw | null
  )
  return (
    <ConvexAuthNextjsServerProvider>
       <html lang="en" className="dark bg-background" suppressHydrationWarning>
      <body
      
        className={`${poppins.variable} ${montserratAlternates.variable} ${geistMono.variable} antialiased`}
      >
       <ConvexClientProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        > 
         <ReduxProvider preloadedState={{ profile}}>
          <Toaster />
          {children}
          </ReduxProvider>
        </ThemeProvider>
       </ConvexClientProvider>
        
      </body>
    </html>
    </ConvexAuthNextjsServerProvider>
   
  );
}
