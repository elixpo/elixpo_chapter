export const BypassRoutes = [
    "/api/polar/webhook",
    "api/inngest(.*)",
    "/api/auth(.*)",
    "/convex(.*)"
]

export const isPublicRoutes = [
     "/auth(.*)",
     "/"
]

export const isProtectedRoute = [
     "/dashboard(.*)"
]