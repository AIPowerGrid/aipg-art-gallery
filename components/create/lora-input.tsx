"use client";

import { useState } from "react";

export interface LoraSpec {
  name: string;        // CivitAI version id or model id
  model: number;       // strength
  is_version: boolean; // true if `name` is a version id
}

interface LoraInputProps {
  value: LoraSpec | null;
  onChange: (lora: LoraSpec | null) => void;
  /** Hint shown about which models LoRAs work best on. */
  hint?: string;
  /** Render without the outer card/header — for nesting inside a group. */
  bare?: boolean;
}

// Pull the most precise id out of a CivitAI link or a bare id.
function parseCivitai(input: string): { name: string; is_version: boolean } | null {
  const ver = input.match(/modelVersionId=(\d+)/);
  if (ver) return { name: ver[1], is_version: true };
  const mod = input.match(/\/models\/(\d+)/);
  if (mod) return { name: mod[1], is_version: false };
  const bare = input.match(/^\s*(\d+)\s*$/);
  if (bare) return { name: bare[1], is_version: false };
  return null;
}

export function LoraInput({ value, onChange, hint, bare = false }: LoraInputProps) {
  const [text, setText] = useState("");
  const [strength, setStrength] = useState(0.8);

  const apply = () => {
    const parsed = parseCivitai(text);
    if (!parsed) return;
    onChange({ name: parsed.name, model: strength, is_version: parsed.is_version });
  };

  const body = (
    <>
      {value ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 font-mono text-sm text-foreground truncate">
            #{value.name}{value.is_version ? " (version)" : " (model)"} · strength {value.model}
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setText(""); }}
            className="px-3 py-1.5 rounded-lg text-sm border border-border text-foreground hover:border-edge"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="civitai.com/models/… or a version id"
            className="w-full bg-popover/60 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-edge"
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Strength</span>
            <input
              type="range" min={0} max={1.5} step={0.05}
              value={strength}
              onChange={(e) => setStrength(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs text-foreground w-8 text-right">{strength.toFixed(2)}</span>
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={!parseCivitai(text)}
            className="px-4 py-2 rounded-lg text-sm border border-primary bg-primary/80 text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add LoRA
          </button>
        </div>
      )}
    </>
  );

  if (bare) return body;

  return (
    <div className="border border-border rounded-2xl p-5 bg-secondary/30">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <span>LoRA</span>
        <span className="text-tertiary">— {hint || "CivitAI link or version id (optional)"}</span>
      </div>
      {body}
    </div>
  );
}
