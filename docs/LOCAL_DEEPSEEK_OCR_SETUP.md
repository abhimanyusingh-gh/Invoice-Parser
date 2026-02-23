# Local DeepSeek OCR Setup (Docker)

This project runs OCR locally through the `deepseek-ocr` container and exposes a direct document OCR API for the backend.

## 1. Start OCR service

```bash
docker compose up -d deepseek-ocr
```

## 2. Verify OCR service

```bash
curl http://localhost:8000/health
curl http://localhost:8000/v1/models
```

Expected model id default:
- `deepseek-ai/DeepSeek-OCR`

## 3. Start full application stack

```bash
docker compose up -d
```

Backend OCR defaults in compose:
- `DEEPSEEK_BASE_URL=http://deepseek-ocr:8000/v1`
- `DEEPSEEK_OCR_MODEL=deepseek-ai/DeepSeek-OCR`
- `OCR_PROVIDER=auto` (from `backend/.env.example`)

No API key is required for local OCR.

## 4. Optional tuning

Compose environment for `deepseek-ocr`:
- `OCR_MODEL_ID` default `deepseek-ai/DeepSeek-OCR`
- `OCR_DEVICE` values `auto|cpu|mps|cuda` (default `cpu`)
- `OCR_TORCH_DTYPE` values `float16|float32|bfloat16` (default `bfloat16`)
- `OCR_MAX_NEW_TOKENS` max generation tokens per OCR inference (default `256`)
- `OCR_LAYOUT_PROMPT` prompt used for block-level OCR with bbox grounding
- `OCR_LOAD_ON_STARTUP` default `false`

Example:

```bash
OCR_DEVICE=auto OCR_TORCH_DTYPE=bfloat16 OCR_LOAD_ON_STARTUP=true docker compose up -d deepseek-ocr
```

## 5. Smoke test ingestion

```bash
curl -X POST http://localhost:4000/api/jobs/ingest
curl http://localhost:4000/api/jobs/ingest/status
```

## Notes

- First OCR request may take longer due model load/download.
- Allocate enough Docker memory (24 GB minimum, 48 GB recommended for DeepSeek-OCR).
- For CPU-only local runs, keep `OCR_MAX_NEW_TOKENS` low (for example `128` to `256`) to reduce latency.
- Backend validates `/v1/models` before selecting OCR provider.
- Backend uses `POST /v1/ocr/document` for OCR (includes text + block bounding boxes).
- `/v1/chat/completions` is intentionally not exposed.
- Backend and OCR both emit JSON logs with `correlationId`; tail both with:
  - `yarn logs:local`
- If model id mismatch occurs, set `DEEPSEEK_OCR_MODEL` to one returned by `GET /v1/models`.
