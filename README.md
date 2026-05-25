# eSignature Module

Standalone project dedicated to the e-signature workflow — extracted from the
Dynamic Deal Memo app so the e-sign module can be developed, run, and shipped
on its own.

```
esignature-module/
├── backend/      Express + MongoDB API (auth, envelopes, signing, DocuSign service)
└── frontend/    Vite + React + Redux UI (envelope manager, field placer, signing view)
```

The module works in two modes:

| Mode             | When                                                     | Behavior                                                          |
|------------------|----------------------------------------------------------|-------------------------------------------------------------------|
| **Local/demo**   | `DOCUSIGN_INTEGRATION_KEY` is empty                       | Envelopes live only in your Mongo DB; signing happens in-app.     |
| **DocuSign API** | DocuSign credentials configured (JWT auth)                | Envelopes are created on DocuSign; status syncs back to local DB. |

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env          # fill in MONGODB_URI + JWT_SECRET
npm install
npm run seed                  # creates admin@example.com / password123
npm run dev                   # http://localhost:5001
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:5001/api
npm install
npm run dev                   # http://localhost:5175
```

Open <http://localhost:5175>, log in with the seeded admin, and the DocuSign
panel is the home screen.

## Features

- **Envelope dashboard** with Draft / Sent / Received / Complete / Rejected tabs
- **Drag-and-drop field placer** (sign here, initial here, date, text, checkbox…)
- **"Initials on all pages"** — sign once, apply across every page
- **Counter-sign flow** — admin signs first, then envelope auto-sends
- **Split-screen signing view** with sign-once initials, saved signatures
- **Audit trail** with timestamp, actor, IP per action
- **DocuSign REST integration** via JWT grant when credentials are configured
- **Saved signatures & initials** per user (max 3 each)

## Architecture

See [`backend/src/`](backend/src) and [`frontend/src/DocuSign/`](frontend/src/DocuSign)
for the full source. The DocuSign React folder is fully self-contained and can
be lifted back into another project by copying that folder plus
`SignaturePad.jsx`, the `_shims/` helper, and the matching Redux slice.

## DocuSign credentials

To enable real DocuSign envelopes, set the variables in
[`backend/.env.example`](backend/.env.example) and place your RSA private key
at the path indicated by `DOCUSIGN_PRIVATE_KEY_PATH`.

Without credentials the app remains fully functional in local/demo mode — the
signing UI saves field values to Mongo and marks envelopes as completed
locally.
