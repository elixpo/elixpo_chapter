"use client"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import Link from 'next/link'
import { LOGO } from '../../public/images/images'
import { UseAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'
import GoogleProvider from './button/oAuth/google'

export default function LoginPage() {
    const {handleSignIn,signInForm,isLoading} = UseAuth();
    const {register,handleSubmit,formState: {errors}} = signInForm
    return (
         <form
                onSubmit={handleSubmit(handleSignIn)}
                action=""
                className="bg-card m-auto h-fit w-full max-w-sm rounded-[calc(var(--radius)+.125rem)] border p-0.5 shadow-md dark:[--color-muted:var(--color-zinc-900)]">
                <div className="p-8 pb-6">
                    <div>
                        <Link
                            href="/"
                            aria-label="go home">
                             <Image
                                alt=''
                                src={LOGO.logo}
                                className='w-12 h-12 object-contain'
                            
                                                        />
                        </Link>
                        <h1 className="mb-1 mt-4 text-xl font-[poppins] font-black ">Sign In to Vision</h1>
                        <p className="text-sm font-mono">Welcome back! Sign in to continue</p>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <GoogleProvider/>
                        <Button
                            type="button"
                            variant="outline">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-github" viewBox="0 0 16 16">
  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/>
</svg> 
                        <span className="font-mono">Github</span>
                        </Button>
                    </div>

                    <hr className="my-4 border-dashed" />

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label
                                htmlFor="email"
                                className="block text-sm font-mono">
                                Email
                            </Label>
                            <Input
                        
                                type="email"
                                required
                                {...register('email')}
                                className={errors.email ? 'border-destructive':''}
                                name="email"
                                id="email"
                            />

                            {
                                errors.email && (
                                    <span className='text-xs font-mono text-destructive'>{errors.email.message}</span>
                                )
                            }
                        </div>

                        <div className="space-y-0.5">
                            <div className="flex items-center justify-between">
                                <Label
                                    htmlFor="pwd"
                                    className="text-sm font-mono">
                                    Password
                                </Label>
                                <Button
                                    asChild
                                    variant="link"
                                    size="sm">
                                    <Link
                                        href="#"
                                        className="link intent-info variant-ghost font-mono text-xs">
                                        Forgot your Password ?
                                    </Link>
                                </Button>
                            </div>
                            <Input
                                type="password"
                                required
                                {...register("password")}
                                name="password"
                                id="password"
                                className={errors.password ? "text-destructive": ''}
                            />

                            {
                                errors.password && (
                                     <span className='font-mono text-destructive text-xs'>{errors.password.message}</span>
                                )
                            }
                        </div>
                        {
                            errors.root && (
                                <span className='text-destructive text-xs font-mono text-center'>{errors.root.message}</span>
                            )
                        }
                        <Button 
                        disabled={isLoading}
                        type='submit'
                        className="w-full font-mono">
                           {
                            isLoading ? (<>
                            <Loader2 className='animate-spin size-4' />
                            Signing In...
                            </>) : (<>Sign In</>)
                           }
                        </Button>
                    </div>
                </div>

                <div className="bg-muted rounded-(--radius) border p-3">
                    <p className="text-accent-foreground font-mono text-center text-xs">
                        Don't have an account ?
                        <Button
                            asChild
                            variant="link"
                            className="px-2 text-xs">
                            <Link href="sign-up" >Create account</Link>
                        </Button>
                    </p>
                </div>
            </form>
    )
}
