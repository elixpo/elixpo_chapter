import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { fing_AI_Agent } from "@/inngest/functions";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    fing_AI_Agent
  ],
});