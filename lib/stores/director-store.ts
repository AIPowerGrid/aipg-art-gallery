/**
 * Director v2 store — the persisted state of the merged Storyboard+Director
 * console: contiguous segments, one optional audio track, shared render
 * settings, panel geometry, and the render-queue flag.
 *
 * Quota discipline (same as the old stores): base64 payloads (start images,
 * extracted last frames, audio) are stripped before persisting. Chained
 * segments rehydrate automatically — their start frame re-extracts from the
 * previous segment's persisted outputUrl; own-image segments get flagged for
 * re-upload.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveAudioTrack, loadAudioTrack, deleteAudioTrack } from '@/lib/utils/audio-db';
import {
  DirectorSegment,
  DirectorAudio,
  DirectorSettings,
  DirectorPanelSizes,
  DEFAULT_DIRECTOR_SETTINGS,
  DEFAULT_PANEL_SIZES,
  clampSegmentFrames,
  DIRECTOR_FPS,
} from '@/lib/types/director';

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function newSegment(partial?: Partial<DirectorSegment>): DirectorSegment {
  return {
    id: genId(),
    prompt: '',
    lengthFrames: 3 * DIRECTOR_FPS,
    chained: false,
    startImage: null,
    strength: 1.0,
    status: 'idle',
    ...partial,
  };
}

/** A saved Director project: a named snapshot of the working state. The active
 *  project is continuously re-snapshotted on switch/new, so nothing is lost. */
export interface DirectorProject {
  id: string;
  name: string;
  updatedAt: number;
  globalPrompt: string;
  segments: DirectorSegment[];
  audios: DirectorAudio[];
  settings: DirectorSettings;
}

interface DirectorStore {
  globalPrompt: string;
  segments: DirectorSegment[];
  /** Audio tracks — each gets its own timeline lane and its own slices. */
  audios: DirectorAudio[];
  settings: DirectorSettings;
  panels: DirectorPanelSizes;
  /** Selected segment id (UI). */
  selectedId: string | null;
  /** "Render pending" auto-queue is active. */
  queueActive: boolean;
  /** Saved projects (the active one included, refreshed on switch). */
  projects: DirectorProject[];
  activeProjectId: string | null;
  activeProjectName: string;

  setGlobalPrompt: (p: string) => void;
  addAudio: (a: DirectorAudio) => void;
  updateAudio: (id: string, patch: Partial<DirectorAudio>) => void;
  removeAudio: (id: string) => void;
  /** Re-attach every track's base64 from IndexedDB (after rehydrate or a
   *  project switch — localStorage never holds the audio bytes). */
  hydrateAudio: () => Promise<void>;
  setSettings: (patch: Partial<DirectorSettings>) => void;
  setPanels: (patch: Partial<DirectorPanelSizes>) => void;
  setSelectedId: (id: string | null) => void;
  setQueueActive: (on: boolean) => void;

  /** Append a segment; chained by default when a predecessor exists. */
  addSegment: () => string;
  /** Append a segment anchored on an external clip's extracted last frame
   *  (the "Extend in Director" entry point from the gallery). */
  appendClipSegment: (args: { image: string; name: string; prompt?: string }) => string;
  updateSegment: (id: string, patch: Partial<DirectorSegment>) => void;
  removeSegment: (id: string) => void;
  /** Move a segment one position left/right; fixes chain state at the edges. */
  moveSegment: (id: string, delta: -1 | 1) => void;
  duplicateSegment: (id: string) => string | null;
  reset: () => void;

  /** Save the working state under the active project id (creates it if new). */
  saveActiveProject: () => void;
  /** Save the current project, then start a fresh empty one. */
  newProject: (name?: string) => void;
  /** Save the current project, then load another one. */
  openProject: (id: string) => void;
  deleteProject: (id: string) => void;
  renameActiveProject: (name: string) => void;
  /** Save the current project, start a fresh one seeded with an external
   *  clip's last frame ("Extend in Director" from the gallery). */
  startProjectFromClip: (args: { image: string; name: string; prompt?: string }) => void;
}

/** After any structural change: segment 0 can never be chained, and chained
 *  segments whose predecessor changed must drop their stale backfill. */
function normalize(segments: DirectorSegment[]): DirectorSegment[] {
  return segments.map((s, i) => {
    if (i === 0 && s.chained) {
      return { ...s, chained: false, startImage: null, sourceJobId: undefined, anchorStale: false };
    }
    return s;
  });
}

export const useDirectorStore = create<DirectorStore>()(
  persist(
    (set, get) => ({
      globalPrompt: '',
      segments: [],
      audios: [],
      settings: { ...DEFAULT_DIRECTOR_SETTINGS },
      panels: { ...DEFAULT_PANEL_SIZES },
      selectedId: null,
      queueActive: false,
      projects: [],
      activeProjectId: null,
      activeProjectName: 'Project 1',

      setGlobalPrompt: (globalPrompt) => set({ globalPrompt }),

      addAudio: (a) => {
        set((s) => ({ audios: [...s.audios, a] }));
        if (a.id && a.audioB64) void saveAudioTrack(a.id, a.audioB64);
      },

      updateAudio: (id, patch) => {
        set((s) => ({
          audios: s.audios.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }));
      },

      removeAudio: (id) => {
        set((s) => ({ audios: s.audios.filter((a) => a.id !== id) }));
        // Drop the bytes unless a saved project still references this track.
        const referenced =
          get().audios.some((a) => a.id === id) ||
          get().projects.some((p) => p.audios.some((a) => a.id === id));
        if (!referenced) void deleteAudioTrack(id);
      },

      hydrateAudio: async () => {
        for (const a of get().audios) {
          if (!a.id || a.audioB64) continue;
          const audioB64 = await loadAudioTrack(a.id);
          if (!audioB64) continue;
          const current = get().audios.find((x) => x.id === a.id);
          if (current && !current.audioB64) {
            set((s) => ({
              audios: s.audios.map((x) => (x.id === a.id ? { ...x, audioB64 } : x)),
            }));
          }
        }
      },
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setPanels: (patch) => set((s) => ({ panels: { ...s.panels, ...patch } })),
      setSelectedId: (selectedId) => set({ selectedId }),
      setQueueActive: (queueActive) => set({ queueActive }),

      addSegment: () => {
        const seg = newSegment({ chained: get().segments.length > 0 });
        set((s) => ({ segments: [...s.segments, seg], selectedId: seg.id }));
        return seg.id;
      },

      appendClipSegment: ({ image, name, prompt }) => {
        const seg = newSegment({
          chained: false,
          startImage: image,
          startImageName: name,
          prompt: prompt ?? '',
        });
        set((s) => ({ segments: [...s.segments, seg], selectedId: seg.id }));
        return seg.id;
      },

      updateSegment: (id, patch) => {
        set((s) => ({
          segments: s.segments.map((seg) => {
            if (seg.id !== id) return seg;
            const next = { ...seg, ...patch };
            if (patch.lengthFrames !== undefined) {
              next.lengthFrames = clampSegmentFrames(patch.lengthFrames);
            }
            return next;
          }),
        }));
      },

      removeSegment: (id) => {
        set((s) => {
          const idx = s.segments.findIndex((seg) => seg.id === id);
          const segments = normalize(s.segments.filter((seg) => seg.id !== id));
          const fallback = segments[idx]?.id ?? segments[idx - 1]?.id ?? null;
          return {
            segments,
            selectedId: s.selectedId === id ? fallback : s.selectedId,
          };
        });
      },

      moveSegment: (id, delta) => {
        set((s) => {
          const idx = s.segments.findIndex((seg) => seg.id === id);
          const to = idx + delta;
          if (idx < 0 || to < 0 || to >= s.segments.length) return s;
          const segments = [...s.segments];
          const [seg] = segments.splice(idx, 1);
          segments.splice(to, 0, seg);
          // Both moved segments' joins changed — chained ones must re-backfill.
          const invalidate = (x: DirectorSegment): DirectorSegment =>
            x.chained
              ? { ...x, startImage: null, sourceJobId: undefined, anchorStale: false }
              : x;
          return {
            segments: normalize(
              segments.map((x) => (x.id === seg.id || x.id === s.segments[to]?.id ? invalidate(x) : x))
            ),
          };
        });
      },

      duplicateSegment: (id) => {
        const src = get().segments.find((s) => s.id === id);
        if (!src) return null;
        const copy = newSegment({
          prompt: src.prompt,
          lengthFrames: src.lengthFrames,
          chained: src.chained,
          startImage: src.chained ? null : src.startImage,
          startImageName: src.startImageName,
          strength: src.strength,
          seed: src.seed,
        });
        set((s) => {
          const idx = s.segments.findIndex((seg) => seg.id === id);
          const segments = [...s.segments];
          segments.splice(idx + 1, 0, copy);
          return { segments: normalize(segments), selectedId: copy.id };
        });
        return copy.id;
      },

      reset: () =>
        set({
          globalPrompt: '',
          segments: [],
          audios: [],
          settings: { ...DEFAULT_DIRECTOR_SETTINGS },
          selectedId: null,
          queueActive: false,
        }),

      saveActiveProject: () => {
        const s = get();
        // Nothing worth saving in a fully-empty untouched workspace.
        if (!s.activeProjectId && s.segments.length === 0 && !s.globalPrompt.trim()) return;
        const id = s.activeProjectId ?? genId();
        const entry: DirectorProject = {
          id,
          name: s.activeProjectName,
          updatedAt: Date.now(),
          globalPrompt: s.globalPrompt,
          segments: s.segments,
          audios: s.audios,
          settings: s.settings,
        };
        set({
          activeProjectId: id,
          projects: [entry, ...s.projects.filter((p) => p.id !== id)],
        });
      },

      newProject: (name) => {
        get().saveActiveProject();
        const count = get().projects.length;
        set({
          globalPrompt: '',
          segments: [],
          audios: [],
          settings: { ...DEFAULT_DIRECTOR_SETTINGS },
          selectedId: null,
          queueActive: false,
          activeProjectId: genId(),
          activeProjectName: name ?? `Project ${count + 1}`,
        });
      },

      openProject: (id) => {
        const target = get().projects.find((p) => p.id === id);
        if (!target || id === get().activeProjectId) return;
        get().saveActiveProject();
        set({
          globalPrompt: target.globalPrompt,
          segments: target.segments,
          audios: target.audios ?? [],
          settings: target.settings,
          selectedId: target.segments[0]?.id ?? null,
          queueActive: false,
          activeProjectId: target.id,
          activeProjectName: target.name,
        });
        void get().hydrateAudio();
      },

      deleteProject: (id) => {
        const doomed = get().projects.find((p) => p.id === id);
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
        // Drop the project's audio bytes if nothing else references them.
        for (const track of doomed?.audios ?? []) {
          if (!track.id) continue;
          const s = get();
          const referenced =
            s.audios.some((a) => a.id === track.id) ||
            s.projects.some((p) => p.audios.some((a) => a.id === track.id));
          if (!referenced) void deleteAudioTrack(track.id);
        }
        if (get().activeProjectId === id) {
          set({
            globalPrompt: '',
            segments: [],
            audios: [],
            settings: { ...DEFAULT_DIRECTOR_SETTINGS },
            selectedId: null,
            queueActive: false,
            activeProjectId: genId(),
            activeProjectName: `Project ${get().projects.length + 1}`,
          });
        }
      },

      renameActiveProject: (name) => {
        const clean = name.trim() || 'Untitled';
        set((s) => ({
          activeProjectName: clean,
          projects: s.projects.map((p) =>
            p.id === s.activeProjectId ? { ...p, name: clean } : p
          ),
        }));
      },

      startProjectFromClip: ({ image, name, prompt }) => {
        get().newProject(name);
        const seg = newSegment({
          chained: false,
          startImage: image,
          startImageName: name,
          prompt: prompt ?? '',
        });
        set((s) => ({ segments: [...s.segments, seg], selectedId: seg.id }));
      },
    }),
    {
      name: 'aipg-director-store',
      partialize: (state) => {
        // Strip base64 payloads (localStorage quota). outputUrl/jobId survive,
        // so chained frames re-extract and statuses recover after reload.
        const stripSegments = (segs: DirectorSegment[]) =>
          segs.map((s) => ({ ...s, startImage: null, lastFrame: null, progress: undefined }));
        const stripAudios = (list: DirectorAudio[]) => list.map((a) => ({ ...a, audioB64: '' }));
        return {
          globalPrompt: state.globalPrompt,
          settings: state.settings,
          panels: state.panels,
          segments: stripSegments(state.segments),
          audios: stripAudios(state.audios),
          activeProjectId: state.activeProjectId,
          activeProjectName: state.activeProjectName,
          projects: state.projects.map((p) => ({
            ...p,
            segments: stripSegments(p.segments),
            audios: stripAudios(p.audios ?? []),
          })),
        };
      },
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') return undefined as unknown as Storage;
        return {
          getItem: (name) => window.localStorage.getItem(name),
          setItem: (name, value) => {
            try {
              window.localStorage.setItem(name, value);
            } catch (err) {
              console.warn('[Director] persist skipped (quota?)', err);
            }
          },
          removeItem: (name) => window.localStorage.removeItem(name),
        } as Storage;
      }),
      version: 1,
      migrate: (persisted: unknown) => {
        // v0 → v1: single `audio` became the `audios` list (root + projects).
        const p = persisted as Record<string, unknown> & {
          audio?: DirectorAudio | null;
          audios?: DirectorAudio[];
          projects?: Array<DirectorProject & { audio?: DirectorAudio | null }>;
        };
        const lift = (a?: DirectorAudio | null): DirectorAudio[] =>
          a ? [{ ...a, id: a.id ?? genId() }] : [];
        if (!p.audios) {
          p.audios = lift(p.audio);
          delete p.audio;
        }
        p.projects = (p.projects ?? []).map((proj) =>
          proj.audios ? proj : { ...proj, audios: lift(proj.audio), audio: undefined }
        );
        return p;
      },
      onRehydrateStorage: () => (state) => {
        // localStorage restores audio metadata only; pull the bytes from idb.
        void state?.hydrateAudio();
      },
    }
  )
);
