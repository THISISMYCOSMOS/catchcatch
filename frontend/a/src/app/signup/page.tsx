import { AuthShell } from "@/components/auth/auth-shell";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

export default function SignupPage() {
  return (
    <AuthShell title="회원가입" description="정보 입력 후 휴대폰 번호를 인증해주세요." backHref="/login" className="signup-card">
      <PhoneAuthForm />
    </AuthShell>
  );
}
