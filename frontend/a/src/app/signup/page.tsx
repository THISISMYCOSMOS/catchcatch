import { AuthShell } from "@/components/auth/auth-shell";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

export default function SignupPage() {
  return (
    <AuthShell title="회원가입" description="휴대폰 번호 인증 후 바로 시작할 수 있어요." backHref="/login" className="signup-card">
      <PhoneAuthForm purpose="signup" />
    </AuthShell>
  );
}
