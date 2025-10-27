"use client"

import React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import { LOGO } from "../../../../public/images/images"
import AuthLayout from "@/components/layouts/auth-layout"
import LoginPage from "@/components/login"



 const Page = () => {
  return (
    <AuthLayout>
        <LoginPage/>
    </AuthLayout>
  )
}

export default Page



