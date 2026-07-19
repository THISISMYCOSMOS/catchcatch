import type { InputHTMLAttributes, ReactNode } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  trailingControl?: ReactNode;
};

export function PasswordVisibilityButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      className="password-visibility"
      type="button"
      aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
      aria-pressed={visible}
      onClick={onToggle}
    >
      <span className="password-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 12s3.5-5.3 9-5.3 9 5.3 9 5.3-3.5 5.3-9 5.3S3 12 3 12z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        {visible ? (
          <>
            <span className="password-icon-slash password-icon-slash-outline" />
            <span className="password-icon-slash password-icon-slash-line" />
          </>
        ) : null}
      </span>
    </button>
  );
}

export function FormField({ label, error, id, className, trailingControl, ...props }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          {...props}
          id={id}
          className={["text-input", trailingControl ? "text-input-with-control" : "", error ? "input-error" : "", className ?? ""].filter(Boolean).join(" ")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {trailingControl}
      </div>
      {error ? <p className="error-text" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}