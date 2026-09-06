"use client";

import { AccountRecoveryDialog } from "@/components/auth/account-recovery-dialog";

type PasswordRecoveryDialogProps = {
  onClose: () => void;
};

export function PasswordRecoveryDialog({ onClose }: PasswordRecoveryDialogProps) {
  return <AccountRecoveryDialog mode="password" onClose={onClose} />;
}
