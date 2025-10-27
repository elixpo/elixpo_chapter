import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";
import { BypassRoutes, isProtectedRoute, isPublicRoutes } from "./lib/permission";
const BypassMatcher = createRouteMatcher(BypassRoutes)
const PublicRouter = createRouteMatcher(isPublicRoutes)
const ProtectedRoute = createRouteMatcher(isProtectedRoute)
export default convexAuthNextjsMiddleware(async(request,{convexAuth}) => {
     if(BypassMatcher(request)) return 
     const auth = await convexAuth.isAuthenticated()
     if(PublicRouter(request) && auth) {
         return nextjsMiddlewareRedirect(request, "/dashboard");
     }

     if(BypassMatcher(request) && !auth) {
         return nextjsMiddlewareRedirect(request, `/auth/sign-in`)
     }
     return 
    },
    {
        cookieConfig : {maxAge: 60 * 60 * 24 * 30}
    }

);
 
export const config = {
  // The following matcher runs middleware on all routes
  // except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
