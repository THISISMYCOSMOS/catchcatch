export function formatKoreanPhoneInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "").slice(0, 15)}`;
  }

  const digits = input.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function toE164KoreanPhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && !/^010\d{8}$/.test(digits)) return null;
  const candidate = trimmed.startsWith("+")
    ? `+${digits}`
    : `+82${digits.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

export function formatE164Phone(phone: string): string {
  return /^\+8210\d{8}$/.test(phone)
    ? `010-${phone.slice(5, 9)}-${phone.slice(9)}`
    : phone;
}
