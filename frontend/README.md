# eSignature Frontend

Vite + React + Redux Toolkit + AntD UI for the eSignature module.

## Run

```bash
cp .env.example .env       # VITE_API_URL=http://localhost:5001/api
npm install
npm run dev                # http://localhost:5175
```

Log in with the backend seed user (`admin@example.com` / `password123`).

## Layout

```
src/
├── App.jsx                Routes (Login, AppShell, signing routes)
├── main.jsx               Provider + Router bootstrap
├── api/
│   ├── client.js          Axios instance with JWT interceptor
│   └── upload.js          File / signature upload helpers
├── store/store.js         Redux slices: auth, accountData (users), docusign
├── components/
│   ├── Login.jsx          Sign-in screen
│   └── AppShell.jsx       Top bar + DocuSignPanel
├── DocuSign/              Self-contained DocuSign module
│   ├── DocuSignPanel.jsx          Dashboard (Draft/Sent/Received/Complete/Rejected tabs)
│   ├── SigningView.jsx            Split-screen signing UI
│   ├── DocumentFieldPlacer.jsx    Drag-and-drop field placement
│   ├── EnvelopeStatusTracker.jsx  Envelope detail view
│   ├── RecipientManager.jsx       Recipient add/edit UI
│   ├── SavedSignaturePicker.jsx   Pick from saved signatures / initials
│   ├── ThemeProvider.jsx          Light/dark theme via CSS variables
│   ├── api.js                     Thin axios wrapper for DocuSign endpoints
│   ├── animations.js              Framer Motion variants
│   ├── constants.js               Colors, sizing, recipient helpers
│   └── dummyData.js               PDF rendering + demo data
├── SignaturePad.jsx       Canvas signature pad component
└── _shims/uploadedFilesOnAWS.js   getFileData helper (URL / data: / localStorage)
```

## Routes

| Path                                            | Component  | Notes                                |
|-------------------------------------------------|------------|--------------------------------------|
| `/login`                                        | Login      |                                      |
| `/`                                             | AppShell   | DocuSign dashboard                   |
| `/docusign/sign/:id`                            | SigningView | Standalone signing screen           |
| `/docusign/signing-complete`                    | SigningView | DocuSign return URL                  |
| `/settings/dealmemo/docusign/sign/:id`          | SigningView | Legacy path (kept for compatibility) |

## State (Redux)

```js
{
  auth:        { user, token, isAuthenticated },
  accountData: { usersList },                 // for recipient picker
  docusign:    { envelopes, currentEnvelope, isLoading, error },
}
```
