import AuthLayout from '@/components/layouts/auth-layout'
import LoginPage from '@/components/sign-up'
import React from 'react'

const page = () => {
  return (
    <AuthLayout>
        <LoginPage/>
    </AuthLayout>
  )
}

export default page