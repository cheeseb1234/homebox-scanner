import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

interface ScannerInputProps {
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  autoSubmitOnEnter?: boolean;
  onSubmit: (value: string) => void | Promise<void>;
  helperText?: string;
  defaultValue?: string;
  disabled?: boolean;
  cameraButton?: ReactNode;
}

export function ScannerInput({
  label = 'Scan',
  placeholder = 'Scan barcode or QR',
  submitLabel = 'Go',
  autoFocus = true,
  autoSubmitOnEnter = true,
  onSubmit,
  helperText,
  defaultValue = '',
  disabled,
  cameraButton
}: ScannerInputProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [autoFocus, disabled]);

  function submit(): void {
    const trimmed = value.trim();
    if (!trimmed) return;
    void onSubmit(trimmed);
    setValue('');
    window.setTimeout(() => inputRef.current?.focus(), 10);
  }

  return (
    <div className="card scan-card">
      <label className="field-label">{label}</label>
      <div className="scanner-row">
        <input
          ref={inputRef}
          className="scan-input"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          inputMode="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (autoSubmitOnEnter && event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <div className="action-row">
        <button className="primary-button" type="button" onClick={submit} disabled={disabled}>
          {submitLabel}
        </button>
        {cameraButton}
      </div>

      {helperText ? <div className="helper-text">{helperText}</div> : null}
    </div>
  );
}
