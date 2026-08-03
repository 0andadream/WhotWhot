"use client";

import { useEffect, useState } from "react";
import { getSavedDisplayName, saveDisplayName, sanitizeName } from "@/lib/displayName";

interface Props {
  value?: string;
  onChange?: (name: string) => void;
  label?: string;
}

/**
 * Simple display-name field: no wallet address noise for non-crypto users.
 */
export function NameField({
  value: controlled,
  onChange,
  label = "Your name",
}: Props) {
  const [local, setLocal] = useState("");

  useEffect(() => {
    if (controlled !== undefined) {
      setLocal(controlled);
      return;
    }
    setLocal(getSavedDisplayName());
  }, [controlled]);

  const value = controlled !== undefined ? controlled : local;

  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="muted">{label}</label>
      <input
        className="input"
        placeholder="e.g. Chioma"
        value={value}
        maxLength={24}
        onChange={(e) => {
          const v = e.target.value;
          if (controlled === undefined) setLocal(v);
          onChange?.(v);
        }}
        onBlur={() => {
          const clean = sanitizeName(value);
          if (clean) saveDisplayName(clean);
          if (controlled === undefined) setLocal(clean);
          onChange?.(clean);
        }}
      />
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Shown to your opponent instead of wallet addresses.
      </p>
    </div>
  );
}
