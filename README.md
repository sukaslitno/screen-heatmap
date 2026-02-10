# UI Heatmap Scanner (MVP)

## Run locally

```bash
npm install
npm run dev
```

## API

`POST /api/analyze` accepts multipart form-data with:
- `file`: image/png, image/jpeg, image/webp
- `platform`: web | mobile
- `screenType`: form | checkout | catalog | promo | other

Returns analysis result JSON (see `lib/contracts.ts`).
