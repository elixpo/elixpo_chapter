import "./landing.css";
import LandingPage from "@/components/landing/landing-page";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function Home() {
    const store = await cookies();
    const session = await verifySession(store.get(SESSION_COOKIE)?.value);
    const authed = !!session?.isAdmin;

    return <LandingPage authed={authed} />;
}
