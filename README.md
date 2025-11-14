# AIPG Art Gallery

Modern control room for the Comfy Bridge worker stack. The site now mirrors the look/feel of the management UI and gives artists a single surface for text-to-image and text-to-video jobs.

## Architecture

| Layer | Description |
| --- | --- |
| `app/` | Next.js 14 App Router UI with Tailwind styling, prompt/parameter controls, job log |
| `server/` | Go microservice that proxies the AI Power Grid `/v2` API, enriches responses with model presets, and exposes `/api/models`, `/api/jobs`, `/api/jobs/:id` |
| `comfy-bridge` | Worker container (separate repo) that advertises WAN + Flux workflows and executes jobs |

```
Next.js (port 3000)  →  Go API (port 4000)  →  https://api.aipowergrid.io/api/v2  →  comfy-bridge
```

## Quick start

### 1. Install dependencies

```bash
cd aipg-art-gallery
npm install
```

### 2. Run the Go API

```bash
cd server
go run ./cmd/api
# or
GALLERY_SERVER_ADDR=:4000 go run ./cmd/api
```

Environment variables (optional):

| Name | Default | Purpose |
| --- | --- | --- |
| `AIPG_API_URL` | `https://api.aipowergrid.io/api/v2` | Upstream Horde API |
| `AIPG_API_KEY` | empty | Override API key when the UI does not provide one |
| `AIPG_CLIENT_AGENT` | `AIPG-Art-Gallery:v2` | Identifies requests to Horde |
| `MODEL_PRESETS_PATH` | `./server/config/model_presets.json` | Maps model -> default params/limits |

### 3. Run the Next.js UI

```bash
npm run dev
# UI will call http://localhost:4000/api by default
```

`NEXT_PUBLIC_GALLERY_API` can point to a remote Go deployment if needed.

## Features

- Case-sensitive model cards that show worker count + queue ETA in real time
- Parameter sliders derived from each workflow’s safe limits (width, height, steps, cfg, frames, fps, denoise, sampler, scheduler, tiling, hires-fix)
- Prompt + negative prompt editor, seed override, API key override, NSFW/gallery toggles
- Img2img & inpainting modes with inline file upload
- Job stream with polling + inline previews for both image (base64) and video outputs

## Project structure

- `app/`: App Router pages and components
- `lib/api.ts`: Fetch helpers for the Go API
- `types/models.ts`: Shared contracts between UI and Go service
- `server/internal/*`: Go packages (config, presets, AIPG client, HTTP handlers)

## License

MIT