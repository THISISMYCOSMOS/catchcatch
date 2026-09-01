import { AuthShell } from "@/components/auth/auth-shell";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

export default function LoginPage() {
  return (
    <AuthShell title="로그인" description="휴대폰 인증으로 안전하게 로그인하세요." className="login-card">
      <PhoneAuthForm purpose="login" />
    </AuthShell>
  );
}
