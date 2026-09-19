import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to MediKey</CardTitle>
          <CardDescription>Your records. Your keys. Your control.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="sign-in" />
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/auth/sign-up" className="text-primary underline underline-offset-4">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
