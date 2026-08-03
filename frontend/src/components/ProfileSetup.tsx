"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  AVATAR_PRESETS,
  COLOR_PRESETS,
  getProfile,
  hasCompleteProfile,
  saveProfile,
  sanitizeUsername,
  shortWallet,
} from "@/lib/profile";
import { ProfileAvatar } from "@/components/ProfileAvatar";

/**
 * Profile setup / edit: username + avatar.
 * Opens on first connect, or when user clicks profile in nav.
 */
export function ProfileSetup() {
  const { address, isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState(AVATAR_PRESETS[0]);
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [error, setError] = useState<string | null>(null);

  const loadIntoForm = (addr: string) => {
    const existing = getProfile(addr);
    if (existing) {
      setUsername(existing.username);
      setAvatar(existing.avatar);
      setColor(existing.color);
    } else {
      setUsername("");
      setAvatar(AVATAR_PRESETS[0]);
      setColor(COLOR_PRESETS[0]);
    }
  };

  useEffect(() => {
    if (!isConnected || !address) {
      setOpen(false);
      setEditing(false);
      return;
    }
    loadIntoForm(address);
    setOpen(!hasCompleteProfile(address));
    setEditing(false);
  }, [isConnected, address]);

  useEffect(() => {
    const onEdit = () => {
      if (!address || !isConnected) return;
      loadIntoForm(address);
      setEditing(true);
      setOpen(true);
      setError(null);
    };
    window.addEventListener("whotwhot:editProfile", onEdit);
    return () => window.removeEventListener("whotwhot:editProfile", onEdit);
  }, [address, isConnected]);

  if (!open || !address) return null;

  const canClose = editing || hasCompleteProfile(address);

  const onSave = () => {
    setError(null);
    try {
      saveProfile(address, {
        username: sanitizeUsername(username),
        avatar,
        color,
      });
      setOpen(false);
      setEditing(false);
      window.dispatchEvent(new Event("whotwhot:profileSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    }
  };

  const onCancel = () => {
    if (!canClose) return;
    setOpen(false);
    setEditing(false);
    setError(null);
  };

  const preview = {
    username: sanitizeUsername(username) || "You",
    avatar,
    color,
  };

  return (
    <div className="profile-modal-backdrop" role="dialog" aria-modal="true">
      <div className="profile-modal card-panel">
        <p className="prem-how-eyebrow" style={{ marginBottom: 8 }}>
          {editing ? "Edit profile" : "Create your profile"}
        </p>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.35rem", fontWeight: 800 }}>
          How friends see you
        </h2>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: "0.9rem" }}>
          Username and avatar are your ID at the table and in chat — not your
          wallet address.
        </p>

        <div className="profile-preview">
          <ProfileAvatar profile={preview} size={64} />
          <div>
            <div className="profile-preview-name">
              {preview.username}
            </div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              {shortWallet(address)}
            </div>
          </div>
        </div>

        <label className="muted" style={{ fontSize: "0.8rem" }}>
          Username
        </label>
        <input
          className="input"
          value={username}
          maxLength={20}
          placeholder="e.g. Chioma"
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
          }}
        />

        <label className="muted" style={{ fontSize: "0.8rem", marginTop: 14 }}>
          Avatar
        </label>
        <div className="profile-avatar-grid">
          {AVATAR_PRESETS.map((a) => (
            <button
              key={a}
              type="button"
              className={`profile-avatar-pick${avatar === a ? " selected" : ""}`}
              onClick={() => setAvatar(a)}
            >
              {a}
            </button>
          ))}
        </div>

        <label className="muted" style={{ fontSize: "0.8rem", marginTop: 14 }}>
          Accent color
        </label>
        <div className="profile-color-grid">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`profile-color-pick${color === c ? " selected" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>

        {error && (
          <div className="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 18,
            flexWrap: "wrap",
          }}
        >
          {canClose && (
            <button
              type="button"
              className="prem-btn-ghost"
              style={{ flex: 1, minWidth: 100 }}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="prem-btn-white"
            style={{ flex: 1, minWidth: 120 }}
            onClick={onSave}
          >
            Save profile
          </button>
        </div>
      </div>
    </div>
  );
}
