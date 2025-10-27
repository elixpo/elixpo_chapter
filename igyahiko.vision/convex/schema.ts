import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
 
const schema = defineSchema({
  ...authTables,
  // Your other tables...
  subscriptions: defineTable({
    userId: v.id('users'),
    polarCustomerId: v.string(),
    polarSubscriptionId: v.string(),
    productId: v.optional(v.string()),
    priceId: v.optional(v.string()),
    planCode: v.optional(v.string()),
    status: v.string(),
    currentPeriodEnd: v.optional(v.number()),
    trialsEndsAt: v.optional(v.number()),
    cancelAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    seats: v.optional(v.number()),
    metaData: v.optional(v.any()),
    creditsBalance: v.number(),
    creditsGrantPerPeriod: v.number(),
    creditsRollOverLimit: v.number(),
    lastGrantCursor: v.optional(v.string())
  })
  .index('by_userId',['userId'])
  .index("by_polarSubscriptionId",['polarSubscriptionId'])
  .index("by_status",['status']),

  credit_ledger: defineTable({
      userId: v.id('users'),
      subscriptionId: v.id('subscriptions'),
      amount: v.number(),
      type: v.string(),
      reason: v.optional(v.string()),
      idempotencyKey: v.optional(v.string()),
      meta: v.optional(v.any())
  })
  .index('by_subscriptionId',['subscriptionId'])
  .index('by_userId',['userId'])
  .index('by_idempotencyKey',['idempotencyKey'])
  ,

  projects: defineTable({
     userId: v.id('users'),
     name: v.string(),
     description: v.optional(v.string()),
     styleGuide: v.optional(v.string()),
     sketchesData: v.any(),
     viewPortData: v.optional(v.any()),
     generatedDesignData: v.optional(v.any()),
     thumbnail: v.optional(v.string()),
     moodBoardImages: v.optional(v.array(v.string())),
     inspirationImage: v.optional(v.array(v.string())),
     lastModified: v.number(),
     createdAt: v.number(),
     isPublic: v.optional(v.boolean()),
     tags: v.optional(v.array(v.string())),
     projectNumber: v.number(),

  }).index('by_userId', ['userId']) ,
  project_counter: defineTable({
     userId: v.id('users'),
     nextProject_numner: v.number(),

  }).index('by_userId',['userId'])
});
 
export default schema;