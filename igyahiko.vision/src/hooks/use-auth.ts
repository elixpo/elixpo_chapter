"use client"
import {useAuthActions} from "@convex-dev/auth/react"
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod"
import {zodResolver} from "@hookform/resolvers/zod"
import { toast } from "sonner";
import { useRouter } from "next/navigation";


const signInSchema = z.object({
     email: z.string().email("Invalid email"),
     password: z.string().min(8,"Password must be alteast 8 characters")
})

const signUpSchema = z.object({ 
     firstname: z.string().min(6,"first name should have 6 characters"),
     lastname: z.string().min(2, "should have alteast 2 characters"),
     email: z.string().email("Email is required"),
     password: z.string().min(8,"Password must be atleast 8 characters")
})

type SignInData = z.infer<typeof signInSchema>
type SignUpData = z.infer<typeof signUpSchema>
export const UseAuth = ()  => {
     const router = useRouter();
     const {signIn, signOut, } = useAuthActions();
     const [isLoading,setIsLoading] = useState(false);
     const signInForm = useForm<SignInData>({
         resolver: zodResolver(signInSchema),
         defaultValues: {
             email: "",
             password: ""
         }
     })
     const signUpform = useForm<SignUpData>({
         resolver: zodResolver(signUpSchema),
         defaultValues: {
             firstname: "",
             lastname: "",
             email: "",
             password: ""
         }
     })


     const handleSignIn = async (data: SignInData) => {
  setIsLoading(true);
  try {
    await signIn("password", {
      email: data.email,
      password: data.password,
      flow: "signIn",   // ✅ required
    });
    router.push("/dashboard");
    toast.success("welcome back");
  } catch (error) {
    console.log(error);
    signInForm.setError("password", {
      message: "Invalid credentials",
    });
  } finally {
    setIsLoading(false);
  }
};


     const handleSignOut = async () => {
         setIsLoading(true)
         try {
           await signOut();
           router.push("/auth/sign-in") 
         } catch (error) {
           console.log("Sign out error", error)

         } finally {
            setIsLoading(false)
         }
         
     }

     const handleSignUp = async (data: SignUpData) => {
  setIsLoading(true)
  try {
    await signIn("password", {
      flow: "signUp",  // ✅ tells Convex this is a sign-up request
      email: data.email,
      password: data.password,
      name: `${data.firstname} ${data.lastname}`,
    })

    toast.success("Account created successfully!")
    router.push("/dashboard")

  } catch (error) {
    console.error("Sign up error", error)
    signUpform.setError("root", {
      message: "Failed to create account. Email may already exist."
    })
    toast.error("Failed to create account")
  } finally {
    setIsLoading(false)
  }
}


     return {
        
         handleSignIn,
         handleSignUp,
         handleSignOut,
         signInForm,
         signUpform,
         isLoading
     }

}