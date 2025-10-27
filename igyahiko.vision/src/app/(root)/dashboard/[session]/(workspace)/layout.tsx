
import Navbar from '@/components/navbar'
import { SubscriptionEntitlementQuery } from '@/convex/query.config'
import { combineSlug } from '@/lib/utils'
import { redirect } from 'next/navigation'
import React from 'react'
type Props = {
     children: React.ReactNode
}
const Layout = async ({children}: Props) => {
  /* const { entitlement,profileName } = await SubscriptionEntitlementQuery() */
   /* if(!entitlement._valueJSON){
     redirect(`/dashboard/${combineSlug(profileName!)}`)
  }  */
  return (
    <div>
    <Navbar/>
      {children}
    
    </div>
  )
}

export default Layout