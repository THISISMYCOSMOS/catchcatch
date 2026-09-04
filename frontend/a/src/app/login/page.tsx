import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell title="로그인" className="login-card">
      <LoginForm />
    </AuthShell>
  );
}
