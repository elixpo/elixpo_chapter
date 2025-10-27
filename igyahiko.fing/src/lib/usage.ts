import { auth } from '@clerk/nextjs/server'
import { RateLimiterPrisma } from 'rate-limiter-flexible'
import prisma from './db';

const FREE_CREDITS = 5;         // Users can use only 1 token
const PRO_CREDITS  = 100 + FREE_CREDITS;
const DURATION = 60 * 60 * 24;  // 1 day in seconds

export const getUsageTracker = async () => {
 const {has} = await auth();
 const isPro = has({plan: 'pro'})
  const usageTracker = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: 'Usage',
    points: isPro ? PRO_CREDITS : FREE_CREDITS,   // Allow 1 point
    duration: DURATION      // Reset that point every 24 hours
  });

  return usageTracker;
};

export const consumeCredits = async () => {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("USER IS NOT AUTHENTICATED");
  }

  const usage = await getUsageTracker();

  try {
    const res = await usage.consume(userId);  // consume 1 token
    return res;
  } catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('An unknown error occurred');
  }

  throw new Error("No free credits available. Try again after 24 hours.");
}

};

export const getUsageStatus = async () => {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("USER IS NOT AUTHENTICATED");
  }

  const usage = await getUsageTracker();
  const res = await usage.get(userId);
  return res;
};
