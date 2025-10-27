import { v } from "convex/values"
import { query } from "./_generated/server"

export const hasEntitlement = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const now = Date.now()

    for await (const subs of ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))) {
      const status = String(subs.status || "").toLowerCase()
      const periodOk =
        subs.currentPeriodEnd == null || subs.currentPeriodEnd > now

      if (status === "active" && periodOk) return true
    }

    return false
  },
})
