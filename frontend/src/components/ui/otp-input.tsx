"use client";

import {
  useState,
  useRef,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { cn } from "@/lib/utils";

interface OTPInputProps {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  error?: boolean;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  disabled = false,
  className,
  inputClassName,
  error = false,
}: OTPInputProps) {
  const isControlled = value !== undefined;
  const [internalOtp, setInternalOtp] = useState<string[]>(
    Array(length).fill(""),
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const otp = (isControlled ? value : internalOtp?.join(""))
    ?.slice(0, length)
    .split("") ?? [];
  const normalizedOtp = Array.from({ length }, (_, index) => otp[index] || "");

  const handleChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;

    const newOtp = [...normalizedOtp];
    newOtp[index] = val.substring(val.length - 1);
    if (!isControlled) {
      setInternalOtp(newOtp);
    }

    const newValue = newOtp.join("");
    onChange?.(newValue);

    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !normalizedOtp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    const newOtp = Array(length)
      .fill("")
      .map((_, i) => pastedData[i] || "");
    if (!isControlled) {
      setInternalOtp(newOtp);
    }
    onChange?.(newOtp.join(""));
  };

  return (
    <div className={cn("flex gap-2", className)}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={normalizedOtp[index] || ""}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          className={cn(
            "h-12 w-12 rounded-lg border text-center text-xl font-semibold transition-all",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive"
              : "border-input bg-background",
            inputClassName,
          )}
        />
      ))}
    </div>
  );
}
