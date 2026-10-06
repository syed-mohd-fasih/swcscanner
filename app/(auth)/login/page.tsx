import { redirect } from "next/navigation"
import { Suspense } from "react"

import { LoginForm } from "@/components/auth/login-form"
import { getCurrentUser } from "@/lib/auth/dal"

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/")
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
