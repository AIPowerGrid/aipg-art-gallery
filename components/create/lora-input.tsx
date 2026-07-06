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

export function LoraInput({ value, onChange, hint }: LoraInputProps) {
  const [text, setText] = useState("");
  const [strength, setStrength] = useState(0.8);

  const apply = () => {
    const parsed = parseCivitai(text);
    if (!parsed) return;
    onChange({ name: parsed.name, model: strength, is_version: parsed.is_version });
  };

  return (
    <div className="border border-zinc-700 rounded-2xl p-5 bg-zinc-800/30">
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
        <span>LoRA</span>
        <span className="text-zinc-600">— {hint || "CivitAI link or version id (optional)"}</span>
      </div>

      {value ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 font-mono text-sm text-zinc-200 truncate">
            #{value.name}{value.is_version ? " (version)" : " (model)"} · strength {value.model}
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setText(""); }}
            className="px-3 py-1.5 rounded-lg text-sm border border-zinc-700 text-zinc-300 hover:border-zinc-500"
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
            className="w-full bg-zinc-900/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 w-16">Strength</span>
            <input
              type="range" min={0} max={1.5} step={0.05}
              value={strength}
              onChange={(e) => setStrength(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs text-zinc-300 w-8 text-right">{strength.toFixed(2)}</span>
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={!parseCivitai(text)}
            className="px-4 py-2 rounded-lg text-sm border border-indigo-500 bg-indigo-600/80 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add LoRA
          </button>
        </div>
      )}
    </div>
  );
}
