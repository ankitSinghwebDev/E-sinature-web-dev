# eSignature Backend

Express + MongoDB API powering the standalone eSignature module.

## Run

```bash
cp .env.example .env
npm install
npm run seed     # seed admin@example.com / password123
npm run dev      # http://localhost:5001
```

## API

| Method | Path                                            | Description                          |
|--------|-------------------------------------------------|--------------------------------------|
| POST   | `/api/auth/register`                            | Create user                          |
| POST   | `/api/auth/login`                               | Login (returns JWT)                  |
| GET    | `/api/auth/me`                                  | Current user                         |
| GET    | `/api/users`                                    | List users (for recipient picker)    |
| POST   | `/api/upload`                                   | Upload PDF / image                   |
| POST   | `/api/upload/signature`                         | Save base64 signature image          |
| POST   | `/api/docusign/envelopes`                       | Create envelope (draft or send)      |
| GET    | `/api/docusign/envelopes`                       | List envelopes                       |
| GET    | `/api/docusign/envelopes/:id`                   | Get envelope                         |
| PUT    | `/api/docusign/envelopes/:id`                   | Update draft                         |
| DELETE | `/api/docusign/envelopes/:id`                   | Delete draft                         |
| POST   | `/api/docusign/envelopes/:id/send`              | Send envelope                        |
| POST   | `/api/docusign/envelopes/:id/resend`            | Resend notifications                 |
| POST   | `/api/docusign/envelopes/:id/void`              | Void envelope                        |
| POST   | `/api/docusign/envelopes/:id/signing-url`       | Get embedded signing URL             |
| PATCH  | `/api/docusign/envelopes/:id/recipient-status`  | Update recipient status / save signed fields |
| POST   | `/api/docusign/envelopes/:id/download`          | Download signed PDF                  |
| GET    | `/api/docusign/envelopes/:id/audit-trail`       | Get audit trail                      |
| POST   | `/api/docusign/sync-status`                     | Pull statuses from DocuSign          |
| GET    | `/api/docusign/saved-signatures`                | List saved signatures / initials     |
| POST   | `/api/docusign/saved-signatures`                | Save signature / initial             |
| DELETE | `/api/docusign/saved-signatures/:id`            | Delete saved signature / initial     |

All routes except `register`, `login` and `health` require
`Authorization: Bearer <token>`.

## Layout

```
src/
├── config/db.js               Mongo connection
├── middleware/
│   ├── auth.js                JWT bearer middleware
│   ├── errorHandler.js        Centralized error responses
│   └── upload.js              multer disk storage (10MB limit)
├── models/
│   ├── User.js
│   ├── DocuSignEnvelope.js    recipients + tabs + audit trail + settings
│   └── UserSignature.js       saved signatures / initials (max 3 per type)
├── controllers/               Route handlers
├── routes/                    Route definitions
├── services/docusignService.js  DocuSign REST API client (JWT auth)
└── seeds/seed.js              Create initial admin + sample users
```
