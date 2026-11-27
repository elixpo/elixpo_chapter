/**
 * /status (and /status/*) → https://status.elixpo.com
 *
 * The public status page lives on its own site. Old links and people typing
 * admin.elixpo.com/status land there instead of a 404. Public, no session
 * needed. Any sub-path and query string are carried over.
 */

export const runtime = "edge";

const STATUS_ORIGIN = "https://status.elixpo.com";

function redirect(request: Request, path: string[] = []): Response {
    const target = new URL(
        path.map(encodeURIComponent).join("/"),
        `${STATUS_ORIGIN}/`,
    );
    target.search = new URL(request.url).search;
    return new Response(null, {
        status: 308,
        headers: {
            Location: target.toString(),
            "Cache-Control": "public, max-age=3600",
        },
    });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
    return redirect(request, (await ctx.params).path);
}

export async function HEAD(request: Request, ctx: Ctx) {
    return redirect(request, (await ctx.params).path);
}
