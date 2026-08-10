export type SignupValues = {
  email: string;
  password: string;
  passwordConfirmation: string;
  agreedToTerms: boolean;
};

export type SignupField = keyof SignupValues;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_LETTER_PATTERN = /[A-Za-z]/;
const PASSWORD_NUMBER_PATTERN = /[0-9]/;
const PASSWORD_SPECIAL_PATTERN = /[^A-Za-z0-9\s]/;
const DUPLICATE_EMAILS = new Set(["used@example.com"]);

export function getPasswordError(password: string): string | undefined {
  if (!password) return "비밀번호를 입력해주세요.";
  if (password.length < 8 || password.length > 16) return "비밀번호가 너무 짧거나 안전하지 않습니다.";
  if (/\s/.test(password) || !PASSWORD_LETTER_PATTERN.test(password) || !PASSWORD_NUMBER_PATTERN.test(password) || !PASSWORD_SPECIAL_PATTERN.test(password)) {
    return "영문, 숫자, 특수문자를 혼합하여 8자 이상 입력해주세요.";
  }
  return undefined;
}

export function getEmailError(email: string): string | undefined {
  if (!email.trim()) return "이메일을 입력해주세요.";
  if (!EMAIL_PATTERN.test(email.trim())) return "올바른 이메일 형식이 아닙니다.";
  return undefined;
}

export function getSignupError(field: SignupField, values: SignupValues): string | undefined {
  switch (field) {
    case "email":
      if (getEmailError(values.email)) return getEmailError(values.email);
      if (DUPLICATE_EMAILS.has(values.email.trim().toLowerCase())) return "이미 사용 중인 이메일입니다.";
      return undefined;
    case "password":
      return getPasswordError(values.password);
    case "passwordConfirmation":
      if (!values.passwordConfirmation) return "비밀번호를 다시 입력해주세요.";
      if (values.passwordConfirmation !== values.password) return "비밀번호가 일치하지 않습니다.";
      return undefined;
    case "agreedToTerms":
      return values.agreedToTerms ? undefined : "필수 약관에 동의해주세요.";
  }
}

export function isSignupValid(values: SignupValues) {
  const fields: SignupField[] = ["email", "password", "passwordConfirmation", "agreedToTerms"];
  return fields.every((field) => !getSignupError(field, values));
}
