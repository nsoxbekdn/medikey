import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your MediKey account</CardTitle>
          <CardDescription>Account identity only — your vault keys come next.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="sign-up" />
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/sign-in" className="text-primary underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
