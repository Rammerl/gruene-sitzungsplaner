"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const TOKEN_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";

function generateToken(length = 10) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

export default function Home() {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    const token = generateToken();
    const { error: insertError } = await supabase.from("surveys").insert({ name: trimmed, token });
    setCreating(false);
    if (insertError) {
      setError("Konnte Umfrage nicht anlegen. Bitte erneut versuchen.");
      return;
    }
    setCreatedToken(token);
  }

  const link = createdToken && typeof window !== "undefined" ? `${window.location.origin}/u/${createdToken}` : "";

  async function copyLink() {
    if (link) await navigator.clipboard.writeText(link);
  }

  return (
    <div className="container">
      <h1>Sitzungsplaner</h1>
      <p className="subtitle">
        Leg eine neue Umfrage an, um mit einer Gruppe die wöchentliche Verfügbarkeit für Termine zu sammeln.
      </p>

      {!createdToken && (
        <div className="panel">
          <div className="row">
            <input
              type="text"
              placeholder='Name der Umfrage, z.B. "OV-2026"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button onClick={handleCreate} disabled={creating || !name.trim()}>
              Umfrage erstellen
            </button>
          </div>
          {error && (
            <p className="hint" style={{ color: "#b3261e" }}>
              {error}
            </p>
          )}
        </div>
      )}

      {createdToken && (
        <div className="panel">
          <p>
            Umfrage <strong>{name}</strong> wurde erstellt. Teile diesen Link mit der Gruppe:
          </p>
          <div className="row">
            <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
            <button onClick={copyLink}>Kopieren</button>
          </div>
          <p className="hint">
            <Link href={`/u/${createdToken}`}>Direkt zur Umfrage →</Link>
          </p>
          <p className="hint">
            Achtung: Dieser Link ist der einzige Zugang zu dieser Umfrage – bitte sicher aufbewahren.
          </p>
        </div>
      )}
    </div>
  );
}
