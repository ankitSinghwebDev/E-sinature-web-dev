# DocuSign eSignature Module — Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Folder Structure](#folder-structure)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [API Reference](#api-reference)
6. [MongoDB Schema](#mongodb-schema)
7. [Redux Store](#redux-store)
8. [Frontend Components](#frontend-components)
9. [Envelope Lifecycle](#envelope-lifecycle)
10. [Initials on All Pages](#initials-on-all-pages)
11. [Environment Variables](#environment-variables)

---

## Overview

This module adds DocuSign-style electronic signature functionality to your application. It supports:

- **Admin side**: Create envelopes, add recipients, place signature/initial/email fields on documents, send for signing, track status
- **User side**: View received documents, guided step-by-step signing with live document preview
- **Dual mode**: Works with real DocuSign API when credentials are configured, falls back to local signing for prototype/demo

---

## Folder Structure

### Frontend
```
src/dynamicdealmemo/DocuSign/
├── index.js                    # Barrel exports
├── api.js                      # All API calls (axios)
├── DocuSignPanel.jsx           # Main admin panel + user received view
├── DocumentFieldPlacer.jsx     # Click-to-place fields on document
├── EnvelopeStatusTracker.jsx   # Envelope detail/tracking view
├── SigningView.jsx             # Receiver signing experience
└── dummyData.js                # Prototype dummy data + PDF loader
```

### Backend
```
backend/src/
├── models/DocuSignEnvelope.js      # MongoDB schema
├── services/docusignService.js     # DocuSign REST API wrapper
├── controllers/docusignController.js # Request handlers
└── routes/docusign.js              # Route definitions
```

---

## Backend Setup

### 1. Install dependency (if using real DocuSign)
```bash
cd backend
npm install axios
```
> `jsonwebtoken` and `axios` are the only dependencies. `jsonwebtoken` is already in the project.

### 2. Register routes in your Express app
```javascript
// In your main server file (index.js or app.js)
const docusignRoutes = require('./routes/docusign')
app.use('/api/docusign', docusignRoutes)
```

### 3. Auth middleware
All routes use the existing `auth` middleware. The authenticated user is available as `req.user`.

---

## Frontend Setup

### 1. Copy the DocuSign folder
Copy `src/dynamicdealmemo/DocuSign/` into your project.

### 2. Update the API client import
In `DocuSign/api.js`, update line 1 to point to your axios instance:
```javascript
import api from '../../api/client'  // ← adjust path to your axios client
```

### 3. Add Redux thunks and slice
Add the DocuSign thunks and slice to your Redux store. See [Redux Store](#redux-store) section below.

### 4. Add the route for signing
```jsx
<Route path="/settings/dealmemo/docusign/sign/:id" element={<SigningView />} />
```

### 5. Render the panel
```jsx
import { DocuSignPanel } from './DocuSign'

// Admin sees envelope manager, user sees received documents
<DocuSignPanel />
```

---

## API Reference

**Base URL**: `/api/docusign`
**Auth**: All endpoints require Bearer token in `Authorization` header.

---

### POST `/envelopes` — Create Envelope

Creates a new envelope (draft or send immediately).

**Request Body:**
```json
{
  "title": "Deal Memo - John Doe",          // required
  "description": "Camera department memo",   // optional
  "recipients": [                            // required, min 1
    {
      "name": "John Doe",
      "email": "john@example.com",
      "role": "signer",                      // "signer" | "cc" | "in_person_signer"
      "routingOrder": 1
    }
  ],
  "tabs": [                                  // optional
    {
      "type": "signHere",                    // see Tab Types below
      "recipientIndex": 0,
      "label": "Sign Here",
      "required": true,
      "placementMode": "coordinate",
      "pageNumber": 1,
      "xPosition": 100,
      "yPosition": 680,
      "width": 180,
      "height": 36
    }
  ],
  "document": {                              // optional
    "source": "upload",
    "fileName": "document.pdf",
    "fileUrl": "https://s3.amazonaws.com/...",
    "fileSize": 52400
  },
  "settings": {                              // optional
    "emailSubject": "Please sign this document",
    "emailBody": "Custom message",
    "expirationDays": 30,
    "enableReminders": true,
    "initialsOnAllPages": true               // sign-once initials for all pages
  },
  "sendNow": false,                          // true = create + send immediately
  "documentBase64": "JVBERi0xLjQ..."         // required if sendNow=true
}
```

**Response (201):**
```json
{
  "status": 1,
  "message": "Envelope saved as draft",
  "data": { /* full envelope object */ }
}
```

---

### GET `/envelopes` — List Envelopes

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Comma-separated: `draft,sent,delivered,completed,declined,voided` |

**Role-based filtering:**
- Admin: sees all envelopes
- Non-admin: sees only envelopes where their userId is in recipients

**Response (200):**
```json
{
  "status": 1,
  "data": [
    {
      "_id": "64abc...",
      "title": "Deal Memo - John Doe",
      "status": "sent",
      "recipients": [...],
      "tabs": [...],
      "document": {...},
      "createdBy": { "first_name": "Admin", "last_name": "User", "email": "admin@example.com" },
      "createdAt": 1742034600000,
      "sentAt": 1742036400000
    }
  ]
}
```

---

### GET `/envelopes/:id` — Get Envelope

**Response (200):**
```json
{
  "status": 1,
  "data": { /* full envelope with populated createdBy */ }
}
```

---

### PUT `/envelopes/:id` — Update Envelope

Only draft envelopes can be updated. Returns 400 if envelope is not in draft status.

**Request Body** (all fields optional):
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "recipients": [...],
  "tabs": [...],
  "document": {...},
  "settings": {...}
}
```

**Response (200):**
```json
{
  "status": 1,
  "message": "Envelope updated",
  "data": { /* updated envelope */ }
}
```

---

### DELETE `/envelopes/:id` — Delete Envelope

Only draft envelopes can be deleted. Returns 400 if not draft.

**Response (200):**
```json
{
  "status": 1,
  "message": "Envelope deleted"
}
```

---

### POST `/envelopes/:id/send` — Send Envelope

Sends a draft envelope to recipients. Changes status from `draft` → `sent`.

**Request Body:**
```json
{
  "documentBase64": "JVBERi0xLjQ..."   // required if DocuSign is configured
}
```

**Response (200):**
```json
{
  "status": 1,
  "message": "Envelope sent",
  "data": { /* updated envelope with status="sent", sentAt set */ }
}
```

---

### POST `/envelopes/:id/resend` — Resend Envelope

Resends notification emails to recipients. Cannot resend if status is draft, completed, or voided.

**Request Body:** None

**Response (200):**
```json
{
  "status": 1,
  "message": "Envelope resent"
}
```

---

### POST `/envelopes/:id/void` — Void Envelope

Cancels the envelope for all recipients. Cannot void if already completed or voided.

**Request Body:**
```json
{
  "reason": "Incorrect document"   // optional, default: "Voided by admin"
}
```

**Response (200):**
```json
{
  "status": 1,
  "message": "Envelope voided"
}
```

---

### POST `/envelopes/:id/signing-url` — Get Signing URL

Generates an embedded signing URL for a recipient.

**Request Body:**
```json
{
  "recipientEmail": "john@example.com",   // required
  "returnUrl": "https://yourapp.com/done" // optional
}
```

**Response (200):**
```json
{
  "status": 1,
  "data": {
    "signingUrl": "https://demo.docusign.net/signing/...",
    "mode": "local"  // only present when DocuSign not configured
  }
}
```

---

### PATCH `/envelopes/:id/recipient-status` — Update Recipient Status

Used by the signing flow (or webhook) to update a recipient's signing status.

**Request Body:**
```json
{
  "recipientEmail": "john@example.com",  // required
  "status": "signed",                     // required: created|sent|delivered|signed|completed|declined
  "declinedReason": "Wrong pay rate",     // optional, for declined status
  "signedFields": [                       // optional, saves field values (signatures, initials, etc.)
    {
      "tabIndex": 0,                      // index into envelope.tabs array
      "type": "signHere",
      "value": "data:image/png;base64,..." // signature/initial image or text value
    }
  ]
}
```

**Auto-completion:** If all signers have status `signed` or `completed`, the envelope status automatically changes to `completed`.

**Response (200):**
```json
{
  "status": 1,
  "message": "Recipient status updated",
  "data": { /* updated envelope */ }
}
```

---

### GET `/envelopes/:id/audit-trail` — Get Audit Trail

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `includeDocuSign` | string | Set to `"true"` to merge DocuSign audit events |

**Response (200):**
```json
{
  "status": 1,
  "data": [
    {
      "action": "created",
      "actor": "Admin User",
      "actorEmail": "admin@example.com",
      "timestamp": 1742034600000,
      "details": "Envelope has been created"
    },
    {
      "action": "sent",
      "actor": "Admin User",
      "timestamp": 1742036400000,
      "details": "Envelope has been sent to John Doe"
    }
  ]
}
```

---

### POST `/envelopes/:id/download` — Download Signed Document

**Response:** PDF binary (Content-Type: application/pdf) if DocuSign is configured, or JSON with file URL.

```json
{
  "status": 1,
  "data": { "fileUrl": "https://s3.amazonaws.com/..." }
}
```

---

### POST `/sync-status` — Sync All Statuses

Admin batch operation. Pulls latest status from DocuSign for all active envelopes.

**Response (200):**
```json
{
  "status": 1,
  "message": "Sync complete",
  "data": { "updated": 5, "errors": 0 }
}
```

---

## Tab Types

| Type | Description | Default Size |
|------|-------------|-------------|
| `signHere` | Signature field | 180 x 36 |
| `initialHere` | Initials field | 80 x 28 |
| `dateSigned` | Auto-filled date | 120 x 26 |
| `fullName` | Full name text | 160 x 26 |
| `email` | Email address | 180 x 26 |
| `text` | Free text input | 150 x 26 |
| `checkbox` | Checkbox | 26 x 26 |
| `company` | Company name | 150 x 26 |
| `title` | Job title | 150 x 26 |

### Placement Modes

**Coordinate-based** (`placementMode: "coordinate"`):
- `pageNumber` — Which page (1-based)
- `xPosition`, `yPosition` — Position in document points (72 DPI)
- `width`, `height` — Size in points

**Anchor-based** (`placementMode: "anchor"`):
- `anchorString` — Text marker in document (e.g., `\sign_here\`)
- `anchorXOffset`, `anchorYOffset` — Offset from anchor position
- `anchorUnits` — Unit type (default: `"pixels"`)

---

## MongoDB Schema

### DocuSignEnvelope

```javascript
{
  // References
  createdBy: ObjectId (ref: 'User', required),

  // Core
  title: String (required),
  description: String,
  status: 'draft' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined' | 'voided' | 'expired',

  // Document
  document: {
    source: 'upload' | 'generated',
    fileName: String,
    fileUrl: String,
    bucket: String,
    region: String,
    thumbnail: String,
    fileSize: Number,
    mimeType: String,
    pageCount: Number
  },

  // Recipients
  recipients: [{
    name: String (required),
    email: String (required),
    role: 'signer' | 'cc' | 'in_person_signer' | 'editor' | 'agent',
    routingOrder: Number,
    userId: ObjectId (ref: 'User'),
    dsRecipientId: String,
    status: 'created' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined' | 'authentication_failed',
    signedAt: Date,
    viewedAt: Date,
    declinedReason: String
  }],

  // Tabs/Fields
  tabs: [{
    type: String (enum, required),
    recipientIndex: Number (required),
    label: String,
    required: Boolean,
    placementMode: 'coordinate' | 'anchor',
    pageNumber: Number,
    xPosition: Number,
    yPosition: Number,
    width: Number,
    height: Number,
    anchorString: String,
    anchorXOffset: Number,
    anchorYOffset: Number,
    value: String,
    options: [String],
    _autoInitial: Boolean (default: false),  // auto-generated by "Initials on all pages"
    dsTabId: String
  }],

  // DocuSign
  dsEnvelopeId: String (indexed),
  templateId: String,
  templateName: String,

  // Dates
  sentAt: Date,
  completedAt: Date,
  voidedAt: Date,
  expiresAt: Date,
  voidReason: String,

  // Signed document
  signedDocument: {
    fileUrl: String,
    bucket: String,
    region: String,
    downloadedAt: Date
  },

  // Audit trail
  auditTrail: [{
    action: String,
    actor: String,
    actorEmail: String,
    timestamp: Date,
    details: String,
    ipAddress: String
  }],

  // Settings
  settings: {
    enableReminders: Boolean (default: true),
    reminderDelayDays: Number (default: 1),
    reminderFrequencyDays: Number (default: 2),
    expirationDays: Number (default: 30),
    allowReassign: Boolean (default: false),
    emailSubject: String,
    emailBody: String,
    initialsOnAllPages: Boolean (default: false)  // sign-once initials on every page
  },

  // Virtuals
  allSigned: Boolean (computed — true if all signers completed)

  // Timestamps
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
```

---

## Redux Store

### Thunks

Add these to your Redux store file:

```javascript
import api from '../api/client'

// Fetch all envelopes
export const fetchDocuSignEnvelopes = createAsyncThunk(
  'docusign/fetchEnvelopes',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/docusign/envelopes', { params })
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed')
    }
  },
)

// Fetch single envelope
export const fetchDocuSignEnvelope = createAsyncThunk(
  'docusign/fetchEnvelope',
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/docusign/envelopes/${id}`)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed')
    }
  },
)

// Create envelope
export const createDocuSignEnvelope = createAsyncThunk(
  'docusign/createEnvelope',
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/docusign/envelopes', payload)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed')
    }
  },
)

// Update envelope
export const updateDocuSignEnvelope = createAsyncThunk(
  'docusign/updateEnvelope',
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/docusign/envelopes/${id}`, payload)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed')
    }
  },
)

// Send envelope
export const sendDocuSignEnvelope = createAsyncThunk(
  'docusign/sendEnvelope',
  async ({ id, documentBase64 }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/docusign/envelopes/${id}/send`, { documentBase64 })
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed')
    }
  },
)

// Void envelope
export const voidDocuSignEnvelope = createAsyncThunk(
  'docusign/voidEnvelope',
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/docusign/envelopes/${id}/void`, { reason })
      return { ...data, id }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed')
    }
  },
)

// Delete envelope
export const deleteDocuSignEnvelope = createAsyncThunk(
  'docusign/deleteEnvelope',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/docusign/envelopes/${id}`)
      return id
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed')
    }
  },
)
```

### Slice

```javascript
const docusignSlice = createSlice({
  name: 'docusign',
  initialState: {
    envelopes: [],
    currentEnvelope: null,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearCurrentEnvelope: (state) => { state.currentEnvelope = null },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchDocuSignEnvelopes.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(fetchDocuSignEnvelopes.fulfilled, (state, action) => { state.envelopes = action.payload.data || []; state.isLoading = false })
      .addCase(fetchDocuSignEnvelopes.rejected, (state, action) => { state.isLoading = false; state.error = action.payload })
      // Fetch one
      .addCase(fetchDocuSignEnvelope.fulfilled, (state, action) => { state.currentEnvelope = action.payload.data || null })
      // Create
      .addCase(createDocuSignEnvelope.fulfilled, (state, action) => {
        if (action.payload.data) { state.envelopes.unshift(action.payload.data); state.currentEnvelope = action.payload.data }
      })
      // Update
      .addCase(updateDocuSignEnvelope.fulfilled, (state, action) => {
        const d = action.payload.data
        if (d) { state.currentEnvelope = d; const i = state.envelopes.findIndex((e) => e._id === d._id); if (i !== -1) state.envelopes[i] = d }
      })
      // Send
      .addCase(sendDocuSignEnvelope.fulfilled, (state, action) => {
        const d = action.payload.data
        if (d) { state.currentEnvelope = d; const i = state.envelopes.findIndex((e) => e._id === d._id); if (i !== -1) state.envelopes[i] = d }
      })
      // Void
      .addCase(voidDocuSignEnvelope.fulfilled, (state, action) => {
        const id = action.payload.id
        const e = state.envelopes.find((x) => x._id === id)
        if (e) e.status = 'voided'
        if (state.currentEnvelope?._id === id) state.currentEnvelope.status = 'voided'
      })
      // Delete
      .addCase(deleteDocuSignEnvelope.fulfilled, (state, action) => {
        state.envelopes = state.envelopes.filter((e) => e._id !== action.payload)
        if (state.currentEnvelope?._id === action.payload) state.currentEnvelope = null
      })
  },
})

export const { clearCurrentEnvelope } = docusignSlice.actions
```

Add to your store config:
```javascript
export const store = configureStore({
  reducer: {
    // ...your existing reducers
    docusign: docusignSlice.reducer,
  },
})
```

---

## Frontend Components

### DocuSignPanel
Main component. Role-aware: admin sees envelope manager, user sees received documents.

```jsx
import { DocuSignPanel } from './DocuSign'
<DocuSignPanel />
```

**Admin view:** Envelope list → Create/Edit envelope → Status tracking
**User view:** Received documents list → Review & Sign

### SigningView
Full-page signing experience for recipients. Split-screen: document preview on left, signing form on right.

```jsx
import { SigningView } from './DocuSign'
// Route: /docusign/sign/:id?recipient=email@example.com
<Route path="/docusign/sign/:id" element={<SigningView />} />
```

### DocumentFieldPlacer
Click-to-place field editor. Click on document → pick field type from popup → field appears at that spot. Includes "Initials on all pages" feature with per-signer selection.

```jsx
import { DocumentFieldPlacer } from './DocuSign'
<DocumentFieldPlacer
  tabs={tabs}
  onChange={setTabs}
  recipients={recipients}
  documentBase64={documentDataUrl}
  document={docMeta}
  pageCount={16}
  pageHeights={[792, 792, ...]}
  note={description}
  onNoteChange={setDescription}
  initialsOnAllPagesEnabled={initialsOnAllPages}
  onInitialsOnAllPagesChange={setInitialsOnAllPages}
/>
```

### EnvelopeStatusTracker
Admin detail view for sent envelopes. Shows progress, recipients, actions, audit trail.

```jsx
import { EnvelopeStatusTracker } from './DocuSign'
<EnvelopeStatusTracker envelope={envelopeData} onBack={handleBack} />
```

---

## Envelope Lifecycle

```
                  ┌─────────┐
                  │ Created │  (Draft)
                  └────┬────┘
                       │ Admin clicks "Send"
                  ┌────▼────┐
                  │  Sent   │  Email notification sent
                  └────┬────┘
                       │ Recipient opens document
                  ┌────▼─────┐
                  │ Delivered │  Recipient viewed the doc
                  └────┬─────┘
                       │
              ┌────────┼─────────┐
              │        │         │
        ┌─────▼──┐ ┌───▼───┐ ┌──▼─────┐
        │ Signed │ │Declined│ │ Voided │
        └────┬───┘ └───────┘ └────────┘
             │                (Admin cancelled)
        ┌────▼─────┐
        │Completed │  All recipients signed
        └──────────┘
```

### Status Definitions

| Status | Meaning | Who triggers it |
|--------|---------|----------------|
| **Created** | Draft, not sent | System (on create) |
| **Sent** | Notification email sent to recipients | Admin (clicks Send) |
| **Delivered** | Recipient opened/viewed the document | System (recipient opens) |
| **Signed** | A recipient has signed | System (recipient signs) |
| **Completed** | All signers finished | System (auto when all signed) |
| **Declined** | A recipient refused to sign | Recipient |
| **Voided** | Admin cancelled the envelope | Admin (clicks Void) |
| **Expired** | Past expiration date | System |

---

## Recipient Roles

When adding recipients to an envelope, each person is assigned a role that determines what they can do.

### Needs to Sign (role: `signer`)

The recipient must take action on the document.

| Aspect | Behavior |
|--------|----------|
| **Notification** | Receives email when envelope is sent |
| **Action required** | Must sign, initial, or fill fields assigned to them |
| **Appears in inbox** | Yes — shows in "Documents to Sign" on the user side |
| **Blocks completion** | Yes — envelope cannot complete until this person signs |
| **Signing order** | Follows `routingOrder` — if order is 2, they sign after order 1 finishes |
| **Can decline** | Yes — with a reason. Envelope status changes to "Declined" |
| **Receives signed copy** | Yes — after all parties complete signing |

### Receives a Copy (role: `cc`)

The recipient is kept informed but does not sign anything.

| Aspect | Behavior |
|--------|----------|
| **Notification** | Receives email when envelope is sent |
| **Action required** | None — view only |
| **Appears in inbox** | No — does not show in "Documents to Sign" |
| **Blocks completion** | No — envelope completes without them |
| **Signing order** | Typically placed after all signers |
| **Can decline** | No |
| **Receives signed copy** | Yes — after all parties complete signing |

### Comparison

```
Admin sends envelope with:
  1. Sarah Johnson  → Needs to Sign (signer)
  2. Michael Chen   → Needs to Sign (signer)
  3. Jessica Lee    → Receives a Copy (cc)

What happens:
  ├── Sarah gets email → sees in inbox → signs
  ├── Michael gets email → sees in inbox → signs
  ├── Jessica gets email → does NOT see in inbox → no action needed
  │
  └── After both Sarah and Michael sign:
      ├── Envelope status → "Completed"
      ├── Sarah receives signed PDF copy
      ├── Michael receives signed PDF copy
      └── Jessica receives signed PDF copy (she was CC'd)
```

### User-Side Visibility

| Role | "Documents to Sign" tab | "Copies" tab | Can sign |
|------|------------------------|-------------|----------|
| **Needs to Sign** | Shows with "Review & Sign" button | — | Yes |
| **Receives a Copy** | Does not appear | Shows as view-only | No |

### In-Person Signer (role: `in_person_signer`)

Used when the signer is physically present with the sender. The sender hosts the signing session on their device. The signer does not receive an email — instead they sign on the sender's screen.

---

## Initials on All Pages

A convenience feature for multi-page documents. Instead of manually placing initial fields on every page, the admin enables a single checkbox and the system auto-generates initial fields at the bottom of each page.

### Admin Side (DocumentFieldPlacer)

1. **Enable**: Check "Initials on all pages" in the field placement sidebar (appears when document has 2+ pages)
2. **Select signers**: When there are multiple signers, a signer picker appears. The admin chooses which signers must initial every page. All signers are selected by default.
3. **Exclude pages**: Individual pages can be toggled off if initials aren't needed on certain pages
4. **Positioning**: Each selected signer's initial box is placed side-by-side at the bottom-right of each page (no overlaps)
5. **Persistence**: The setting is saved as `settings.initialsOnAllPages: true` on the envelope, and each auto-generated tab has `_autoInitial: true`

### Receiver Side (SigningView)

When `initialsOnAllPages` is enabled, the signing experience is streamlined:

1. **Sign-once mode (default)**: All auto-initial fields are collapsed into a single "Initial All Pages" field. The signer draws their initials once and they are automatically applied to every page.
2. **Individual mode**: The signer can uncheck "I want to sign each page individually" to expand all initial fields and sign each page separately.
3. **Overlays**: The document preview shows the initials on every page regardless of which mode is active.

### Data Flow

```
Admin enables checkbox
  → DocumentFieldPlacer generates _autoInitial tabs for selected signers × selected pages
  → Tabs + settings.initialsOnAllPages saved to envelope via API

Signer opens SigningView
  → Detects initialsOnAllPages from settings or _autoInitial flags on tabs
  → Collapses N initial fields into 1 "Initial All Pages" field
  → Signer draws once → handleFieldValue propagates to all auto-initial tab indices
  → On submit, all auto-initial field values are included in signedFields payload
```

### Fallback Detection

The SigningView uses triple-layered detection for robustness:
1. `envelope.settings.initialsOnAllPages` — explicit setting
2. Any tab with `_autoInitial: true` — flag-based detection
3. If setting is on but no flags exist (legacy data), treats all `initialHere` fields (when >1) as auto-initials

---

## Environment Variables

### Required for local/prototype mode
None. Works out of the box with MongoDB.

### Required for real DocuSign integration

Add to `backend/.env`:

```env
# DocuSign API credentials
DOCUSIGN_INTEGRATION_KEY=your_integration_key
DOCUSIGN_SECRET_KEY=your_secret_key
DOCUSIGN_ACCOUNT_ID=your_account_id
DOCUSIGN_USER_ID=your_user_guid

# DocuSign environment
# Demo: https://demo.docusign.net/restapi, account-d.docusign.com
# Prod: https://na4.docusign.net/restapi, account.docusign.com
DOCUSIGN_BASE_URL=https://demo.docusign.net/restapi
DOCUSIGN_AUTH_SERVER=account-d.docusign.com

# RSA private key for JWT auth
DOCUSIGN_PRIVATE_KEY_PATH=./keys/docusign_private.pem

# OAuth redirect
DOCUSIGN_REDIRECT_URI=http://localhost:5175/docusign/callback

# Your frontend URL (for signing return URLs)
FRONTEND_URL=http://localhost:5175
```

### How credentials are used
The backend checks `process.env.DOCUSIGN_INTEGRATION_KEY` before making any DocuSign API calls. If not set, all operations happen locally in MongoDB only.

---

## S3 Integration Notes

If your documents are on Amazon S3:

1. Get the pre-signed URL for the document (you likely already have this)
2. Pass it to `loadPdfAsImage(s3SignedUrl)` to render as preview
3. The document is **not re-uploaded** — only rendered client-side for field placement
4. Store the S3 URL in `document.fileUrl` when creating the envelope

```javascript
// Example: loading an S3 document for field placement
import { loadPdfAsImage } from './DocuSign'

const s3Url = await getFileData({ media: document.fileUrl }) // your existing S3 helper
const result = await loadPdfAsImage(s3Url)
// result.dataUrl → pass to DocumentFieldPlacer
```

**Requirements:**
- S3 bucket must have CORS configured for your frontend domain
- Use pre-signed URLs for private buckets

---

## Quick Start Checklist (Generic)

- [ ] Copy `DocuSign/` folder to your frontend
- [ ] Copy backend files (model, service, controller, routes)
- [ ] Register route: `app.use('/api/docusign', docusignRoutes)`
- [ ] Add Redux thunks + slice to your store
- [ ] Add signing route to your React router
- [ ] Update `api.js` import path to your axios client
- [ ] Place a test PDF in `public/docusign/` (optional)
- [ ] Test: login as admin → eSignature → create envelope → send
- [ ] Test: login as user → eSignature → see received → sign

---

## zillit_web Integration Guide

This section is specific to integrating the DocuSign module into the **zillit_web** project.

### What already exists in zillit_web

| Feature | Location | Status |
|---------|----------|--------|
| Axios interceptor with encryption | `src/api/interceptor.js` | Existing — reuse |
| Redux store with persist + encryption | `src/store/store.js` | Existing — add slice |
| Deal Memo API functions | `src/api/projectapi/CrewDealMemoApi.js` | Existing — reference pattern |
| Deal Memo Redux slice | `src/api/userJoinRequest/dealmemoOneSlice.js` | Existing — reference pattern |
| S3 upload utilities | `src/components/common/commonFunctions/uploadedFilesOnAWS.js` | Existing — reuse for docs |
| Protected routes | `src/router/protectedRoute.jsx` | Existing — add routes |
| Forms & Signatures module | `src/pages/FilmTools/forms&Signatures/` | Existing — similar concept |
| Auth slice | `src/auth/authSlice.js` | Existing — check `is_admin` |
| Config with base URLs | `src/config.js` | Existing — add DocuSign URL |
| Socket real-time updates | `src/socket/SocketManager.js` | Existing — optional for live status |

### What needs to be added

| File | Location in zillit_web | What it does |
|------|----------------------|--------------|
| `DocuSign/` folder | `src/pages/DocuSign/` | All UI components |
| `docusignApi.js` | `src/api/docusignApi/docusignApi.js` | API call functions |
| `docusignSlice.js` | `src/api/docusignApi/docusignSlice.js` | Redux slice |
| Routes | `src/router/protectedRoute.jsx` | 2 new routes |
| Store registration | `src/store/store.js` | Import + add reducer |
| Config URL | `src/config.js` | Add base URL |
| Env variable | `.env` | Add `VITE_DOCUSIGN_BASE_URL` |

---

### Step 1: Add environment variable

**File:** `.env`
```env
VITE_DOCUSIGN_BASE_URL=https://your-api.com    # same as VITE_PROJECT_BASE_URL if using same backend
```

### Step 2: Add config URL

**File:** `src/config.js`
```javascript
const config = {
  // ... existing URLs
  docusignBase: VITE_DOCUSIGN_BASE_URL || VITE_PROJECT_BASE_URL,
}
```

### Step 3: Create API functions

**File:** `src/api/docusignApi/docusignApi.js`

Follow the same pattern as `CrewDealMemoApi.js` — use `apiInstance` from the interceptor:

```javascript
import apiInstance from '../interceptor'
import config from '../../config'

const baseUrl = config.docusignBase

// ── Envelope CRUD ─────────────────────────────────────────────
export const createEnvelope = async (payload) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes`,
    method: 'POST',
    data: payload,
  }
  return await apiInstance(urlData)
}

export const getEnvelopes = async (params = {}) => {
  const query = new URLSearchParams(params).toString()
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes${query ? `?${query}` : ''}`,
    method: 'GET',
  }
  return await apiInstance(urlData)
}

export const getEnvelope = async (id) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}`,
    method: 'GET',
  }
  return await apiInstance(urlData)
}

export const updateEnvelope = async (id, payload) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}`,
    method: 'PUT',
    data: payload,
  }
  return await apiInstance(urlData)
}

export const deleteEnvelope = async (id) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}`,
    method: 'DELETE',
  }
  return await apiInstance(urlData)
}

// ── Envelope Actions ──────────────────────────────────────────
export const sendEnvelope = async (id, payload) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}/send`,
    method: 'POST',
    data: payload,
  }
  return await apiInstance(urlData)
}

export const resendEnvelope = async (id) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}/resend`,
    method: 'POST',
  }
  return await apiInstance(urlData)
}

export const voidEnvelope = async (id, reason) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}/void`,
    method: 'POST',
    data: { reason },
  }
  return await apiInstance(urlData)
}

// ── Signing ───────────────────────────────────────────────────
export const getSigningUrl = async (id, recipientEmail, returnUrl) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}/signing-url`,
    method: 'POST',
    data: { recipientEmail, returnUrl },
  }
  return await apiInstance(urlData)
}

export const updateRecipientStatus = async (id, payload) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}/recipient-status`,
    method: 'PATCH',
    data: payload,
  }
  return await apiInstance(urlData)
}

// ── Documents & Audit ─────────────────────────────────────────
export const downloadSignedDocument = async (id) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}/download`,
    method: 'POST',
    responseType: 'blob',
  }
  return await apiInstance(urlData)
}

export const getAuditTrail = async (id) => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/envelopes/${id}/audit-trail`,
    method: 'GET',
  }
  return await apiInstance(urlData)
}

export const syncStatuses = async () => {
  const urlData = {
    url: `${baseUrl}/v2/docusign/sync-status`,
    method: 'POST',
  }
  return await apiInstance(urlData)
}
```

> **Note:** This uses `apiInstance` from `interceptor.js` which automatically handles:
> - Auth headers (encrypted `moduledata` + `bodyhash`)
> - Timezone header
> - 401/403 error handling
> - Request/response encryption
>
> You do NOT need to manually attach tokens — the interceptor does it.

### Step 4: Create Redux slice

**File:** `src/api/docusignApi/docusignSlice.js`

Follow the same pattern as `dealmemoOneSlice.js`:

```javascript
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from './docusignApi'

// ── Thunks ────────────────────────────────────────────────────
export const fetchDocuSignEnvelopes = createAsyncThunk(
  'docusign/fetchEnvelopes',
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.getEnvelopes(params)
      return response
    } catch (err) {
      return rejectWithValue(err?.message || 'Failed to fetch envelopes')
    }
  },
)

export const fetchDocuSignEnvelope = createAsyncThunk(
  'docusign/fetchEnvelope',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.getEnvelope(id)
      return response
    } catch (err) {
      return rejectWithValue(err?.message || 'Failed to fetch envelope')
    }
  },
)

export const createDocuSignEnvelope = createAsyncThunk(
  'docusign/createEnvelope',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.createEnvelope(payload)
      return response
    } catch (err) {
      return rejectWithValue(err?.message || 'Failed to create envelope')
    }
  },
)

export const updateDocuSignEnvelope = createAsyncThunk(
  'docusign/updateEnvelope',
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const response = await api.updateEnvelope(id, payload)
      return response
    } catch (err) {
      return rejectWithValue(err?.message || 'Failed to update envelope')
    }
  },
)

export const sendDocuSignEnvelope = createAsyncThunk(
  'docusign/sendEnvelope',
  async ({ id, documentBase64 }, { rejectWithValue }) => {
    try {
      const response = await api.sendEnvelope(id, { documentBase64 })
      return response
    } catch (err) {
      return rejectWithValue(err?.message || 'Failed to send envelope')
    }
  },
)

export const voidDocuSignEnvelope = createAsyncThunk(
  'docusign/voidEnvelope',
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      const response = await api.voidEnvelope(id, reason)
      return { ...response, id }
    } catch (err) {
      return rejectWithValue(err?.message || 'Failed to void envelope')
    }
  },
)

export const deleteDocuSignEnvelope = createAsyncThunk(
  'docusign/deleteEnvelope',
  async (id, { rejectWithValue }) => {
    try {
      await api.deleteEnvelope(id)
      return id
    } catch (err) {
      return rejectWithValue(err?.message || 'Failed to delete envelope')
    }
  },
)

// ── Slice ─────────────────────────────────────────────────────
const docusignSlice = createSlice({
  name: 'docusign',
  initialState: {
    envelopes: [],
    currentEnvelope: null,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearCurrentEnvelope: (state) => {
      state.currentEnvelope = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDocuSignEnvelopes.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchDocuSignEnvelopes.fulfilled, (state, action) => {
        state.envelopes = action.payload.data || []
        state.isLoading = false
      })
      .addCase(fetchDocuSignEnvelopes.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })
      .addCase(fetchDocuSignEnvelope.fulfilled, (state, action) => {
        state.currentEnvelope = action.payload.data || null
      })
      .addCase(createDocuSignEnvelope.fulfilled, (state, action) => {
        if (action.payload.data) {
          state.envelopes.unshift(action.payload.data)
          state.currentEnvelope = action.payload.data
        }
      })
      .addCase(updateDocuSignEnvelope.fulfilled, (state, action) => {
        const d = action.payload.data
        if (d) {
          state.currentEnvelope = d
          const i = state.envelopes.findIndex((e) => e._id === d._id)
          if (i !== -1) state.envelopes[i] = d
        }
      })
      .addCase(sendDocuSignEnvelope.fulfilled, (state, action) => {
        const d = action.payload.data
        if (d) {
          state.currentEnvelope = d
          const i = state.envelopes.findIndex((e) => e._id === d._id)
          if (i !== -1) state.envelopes[i] = d
        }
      })
      .addCase(voidDocuSignEnvelope.fulfilled, (state, action) => {
        const id = action.payload.id
        const e = state.envelopes.find((x) => x._id === id)
        if (e) e.status = 'voided'
        if (state.currentEnvelope?._id === id) state.currentEnvelope.status = 'voided'
      })
      .addCase(deleteDocuSignEnvelope.fulfilled, (state, action) => {
        state.envelopes = state.envelopes.filter((e) => e._id !== action.payload)
        if (state.currentEnvelope?._id === action.payload) state.currentEnvelope = null
      })
  },
})

export const { clearCurrentEnvelope } = docusignSlice.actions
export default docusignSlice.reducer
```

### Step 5: Register in store

**File:** `src/store/store.js`

```javascript
// Add import (around line 50 with other slice imports)
import docusignReducer from '../api/docusignApi/docusignSlice'

// Add to rootReducer combineReducers (around line 130)
const rootReducer = combineReducers({
  // ... existing reducers
  docusignData: docusignReducer,
})

// Add to persistConfigAuth whitelist (around line 100)
const persistConfigAuth = {
  // ...
  whitelist: [
    // ... existing whitelist items
    'docusignData',
  ],
}
```

### Step 6: Update API imports in DocuSign components

The DocuSign components currently import from `./api`. In zillit_web, update them to use the new API file:

**Find and replace in all DocuSign components:**
```javascript
// BEFORE (prototype)
import * as dsApi from './api'

// AFTER (zillit_web)
import * as dsApi from '../../api/docusignApi/docusignApi'
```

**Files that need this change:**
- `DocuSign/EnvelopeStatusTracker.jsx`
- `DocuSign/SigningView.jsx`

**For Redux thunk imports, update:**
```javascript
// BEFORE (prototype — thunks were in store.js)
import {
  createDocuSignEnvelope,
  fetchDocuSignEnvelopes,
  // ...
} from '../../store/store'

// AFTER (zillit_web — thunks are in the slice file)
import {
  createDocuSignEnvelope,
  fetchDocuSignEnvelopes,
  // ...
} from '../../api/docusignApi/docusignSlice'
```

**Files that need this change:**
- `DocuSign/DocuSignPanel.jsx`
- `DocuSign/EnvelopeStatusTracker.jsx`

### Step 7: Update auth/user checks

The DocuSign components check `user.role === 'admin'`. In zillit_web, the admin check is different:

```javascript
// BEFORE (prototype)
const { user } = useSelector((s) => s.auth)
const isAdmin = user?.role === 'admin'

// AFTER (zillit_web)
const { isAdmin } = useSelector((s) => s.auth)
// OR
const isAdmin = JSON.parse(getLocalStorage('user'))?.is_admin
```

**Files that need this change:**
- `DocuSign/DocuSignPanel.jsx` — the main role check
- `DocuSign/AppShell.jsx` — if sidebar needs admin check

### Step 8: Update user list selector

The DocuSign components fetch users for the recipient selector. In zillit_web, users come from a different slice:

```javascript
// BEFORE (prototype)
const { usersList: users } = useSelector((s) => s.accountData || { usersList: [] })

// AFTER (zillit_web) — depends on your crew/user data location
// Option A: from project members
const { projectMembers } = useSelector((s) => s.projectsData)
// Option B: from department users
const { departmentUsers } = useSelector((s) => s.departmentData)
// Use whichever gives you the list of users in the current project
```

**Files that need this change:**
- `DocuSign/DocuSignPanel.jsx` — `RecipientsSection` component

### Step 9: Add routes

**File:** `src/router/protectedRoute.jsx`

```jsx
// Add import (with other lazy imports)
import DocuSignSigningView from '../pages/DocuSign/SigningView'

// Add routes (inside the protected route tree, near deal memo routes)
<Route path="/docusign/sign/:id" element={<DocuSignSigningView />} />
<Route path="/docusign/signing-complete" element={<DocuSignSigningView />} />
```

> The main `DocuSignPanel` does NOT need a route — it renders inside the sidebar/menu system.

### Step 10: Update S3 document loading

The `loadPdfAsImage` function in `dummyData.js` loads from a static path. In zillit_web, load from S3:

```javascript
// In DocumentFieldPlacer.jsx or wherever you load the doc

import { getFileData } from '../../components/common/commonFunctions/uploadedFilesOnAWS'
import { loadPdfAsImage } from './dummyData'

// When admin selects a document from S3:
const loadDocumentPreview = async (s3MediaKey) => {
  // Get pre-signed URL from your existing S3 helper
  const signedUrl = await getFileData({ media: s3MediaKey })

  // Render all pages as image
  const result = await loadPdfAsImage(signedUrl)

  // result.dataUrl → pass to DocumentFieldPlacer as documentBase64 prop
  return result
}
```

### Step 11: Remove dummy data

In production, remove or disable the dummy data:

**File:** `DocuSign/dummyData.js`
- Keep: `loadPdfAsImage()`, `generateFallbackDocument()`, `DOCUMENT_PDF_URL`
- Remove: `DUMMY_RECIPIENTS`, `DUMMY_ENVELOPES`, `DUMMY_RECEIVED_ENVELOPES`

**File:** `DocuSign/DocuSignPanel.jsx`
- Remove all `DUMMY_*` imports and references
- Remove the `useMemo` that merges dummy envelopes with API data
- The `EnvelopeList` should only show `apiEnvelopes` from Redux
- The `EnvelopeEditor` should start with empty state (no pre-filled title/recipients)
- The `ReceivedEnvelopes` should fetch from API only

---

### zillit_web File Mapping

| Prototype file | zillit_web location |
|---|---|
| `src/dynamicdealmemo/DocuSign/` | `src/pages/DocuSign/` |
| `src/api/docusignApi.js` | `src/api/docusignApi/docusignApi.js` |
| Redux thunks + slice (in `store.js`) | `src/api/docusignApi/docusignSlice.js` |
| `src/api/client.js` | `src/api/interceptor.js` (already exists) |
| Store config | `src/store/store.js` (add reducer + whitelist) |
| Routes | `src/router/protectedRoute.jsx` (add 2 routes) |
| S3 uploads | `src/components/common/commonFunctions/uploadedFilesOnAWS.js` (already exists) |
| Auth check | `src/auth/authSlice.js` → `state.auth.isAdmin` |
| Config | `src/config.js` → add `docusignBase` |

### zillit_web Key Differences from Prototype

| Aspect | Prototype | zillit_web |
|--------|-----------|-----------|
| HTTP client | Plain axios (`src/api/client.js`) | Encrypted interceptor (`src/api/interceptor.js`) |
| Auth header | `Authorization: Bearer {token}` | `bodyhash` + `moduledata` (encrypted) |
| Admin check | `user.role === 'admin'` | `state.auth.isAdmin` or `getLocalStorage('user').is_admin` |
| User list | `state.accountData.usersList` | Project members or department users |
| Store persist | No persistence | `redux-persist` with encryption (add to whitelist) |
| API pattern | `api.get('/docusign/...')` | `apiInstance({ url, method, data })` |
| Error handling | Axios 401 interceptor | Custom event emitter (`emitCustomEvent`) |
| File upload | Local multer | AWS S3 via `@aws-sdk/client-s3` |
| Real-time | None | Socket.io available for live status updates |

### zillit_web Integration Checklist

- [ ] Add `VITE_DOCUSIGN_BASE_URL` to `.env`
- [ ] Add `docusignBase` to `src/config.js`
- [ ] Create `src/api/docusignApi/docusignApi.js` using `apiInstance` pattern
- [ ] Create `src/api/docusignApi/docusignSlice.js` with thunks + slice
- [ ] Import reducer in `src/store/store.js` → add to `rootReducer` + `whitelist`
- [ ] Copy `DocuSign/` folder to `src/pages/DocuSign/`
- [ ] Update `import * as dsApi from './api'` → `'../../api/docusignApi/docusignApi'` in components
- [ ] Update Redux thunk imports → `'../../api/docusignApi/docusignSlice'` in components
- [ ] Update `user.role === 'admin'` → `state.auth.isAdmin` in DocuSignPanel
- [ ] Update user list selector in RecipientsSection
- [ ] Add 2 routes to `src/router/protectedRoute.jsx`
- [ ] Load documents from S3 using `getFileData()` + `loadPdfAsImage()`
- [ ] Remove dummy data from `dummyData.js` and `DocuSignPanel.jsx`
- [ ] Test: admin creates envelope → sends → user receives → signs
