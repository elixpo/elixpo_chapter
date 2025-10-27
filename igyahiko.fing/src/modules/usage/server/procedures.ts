
import { getUsageStatus } from "@/lib/usage"
import { createTRPCRouter, protechedRoute } from "@/trpc/init"


export const  usageRoute = createTRPCRouter({
     status: protechedRoute.query(
        async () => {
             try {
               const res = await getUsageStatus();
               return res
             } catch (error) {
                console.log(error)
                return null
             }
        }
     )
})