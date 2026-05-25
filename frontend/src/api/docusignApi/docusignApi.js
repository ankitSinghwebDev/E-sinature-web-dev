/**
 * DocuSign HTTP layer — thin axios wrappers, one named export per
 * endpoint. Mirrors the structure of the zillit_web docusignApi module
 * so call sites read the same regardless of project.
 *
 * Every call returns the parsed JSON body (axios `data`) rather than the
 * raw response — components and the slice can treat the resolved value
 * as the API payload directly.
 *
 * This project's `api` client already injects the Bearer token and
 * throws on non-2xx responses, so we don't need the `isApiFailure`
 * disambiguation that zillit's interceptor pattern requires.
 */
import api from '../client'

const docusignPath = (suffix = '') => `/docusign${suffix}`
const signPath = (suffix = '') => `/sign${suffix}`

const unwrap = (res) => res?.data

// ── Envelope CRUD ────────────────────────────────────────────────
export const createEnvelope = async (payload) =>
  unwrap(await api.post(docusignPath('/envelopes'), payload))

export const getEnvelopes = async (params = {}) =>
  unwrap(await api.get(docusignPath('/envelopes'), { params }))

export const getEnvelope = async (id) =>
  unwrap(await api.get(docusignPath(`/envelopes/${id}`)))

export const updateEnvelope = async (id, payload) =>
  unwrap(await api.put(docusignPath(`/envelopes/${id}`), payload))

export const deleteEnvelope = async (id) =>
  unwrap(await api.delete(docusignPath(`/envelopes/${id}`)))

// ── Envelope actions ─────────────────────────────────────────────
export const sendEnvelope = async (id, payload = {}) =>
  unwrap(await api.post(docusignPath(`/envelopes/${id}/send`), payload))

export const resendEnvelope = async (id, payload = {}) =>
  unwrap(await api.post(docusignPath(`/envelopes/${id}/resend`), payload))

export const voidEnvelope = async (id, reason) =>
  unwrap(await api.post(docusignPath(`/envelopes/${id}/void`), { reason }))

// ── Signing ──────────────────────────────────────────────────────
// payload: { recipient_id } | { recipient_email, return_url? }
export const getSigningUrl = async (id, payload) =>
  unwrap(await api.post(docusignPath(`/envelopes/${id}/signing-url`), payload))

// Record that the signer opened the envelope. No body — recipient is
// read from req.user server-side.
export const markViewed = async (id) =>
  unwrap(await api.post(docusignPath(`/envelopes/${id}/mark-viewed`)))

export const updateRecipientStatus = async (id, payload) =>
  unwrap(await api.patch(docusignPath(`/envelopes/${id}/recipient-status`), payload))

// ── Documents & audit ────────────────────────────────────────────
export const downloadSignedDocument = async (id, payload = {}) =>
  unwrap(await api.post(docusignPath(`/envelopes/${id}/download`), payload))

export const getAuditTrail = async (id) =>
  unwrap(await api.get(docusignPath(`/envelopes/${id}/audit-trail`)))

// Server-rendered PDF audit trail. Returns a Blob; caller wraps in an
// object URL to trigger a download.
export const getAuditTrailPdf = async (id) =>
  (await api.get(docusignPath(`/envelopes/${id}/audit-trail/pdf`), {
    responseType: 'blob',
    headers: { Accept: 'application/pdf' },
  })).data

// ── Admin ────────────────────────────────────────────────────────
export const syncStatuses = async () =>
  unwrap(await api.post(docusignPath('/sync-status')))

// ── Saved signatures & initials ──────────────────────────────────
export const getSavedSignatures = async (params = {}) =>
  unwrap(await api.get(docusignPath('/saved-signatures'), { params }))

export const createSavedSignature = async (payload) =>
  unwrap(await api.post(docusignPath('/saved-signatures'), payload))

export const deleteSavedSignature = async (id) =>
  unwrap(await api.delete(docusignPath(`/saved-signatures/${id}`)))

// ── Templates ─────────────────────────────────────────────────────
export const createTemplate = async (payload) =>
  unwrap(await api.post(docusignPath('/templates'), payload))

export const getTemplates = async (params = {}) =>
  unwrap(await api.get(docusignPath('/templates'), { params }))

export const getTemplate = async (id) =>
  unwrap(await api.get(docusignPath(`/templates/${id}`)))

export const updateTemplate = async (id, payload) =>
  unwrap(await api.put(docusignPath(`/templates/${id}`), payload))

export const deleteTemplate = async (id) =>
  unwrap(await api.delete(docusignPath(`/templates/${id}`)))

// Body: { recipients: [{ name, email, ... }], pre_fill_values?: { tab_id: value } }
// Returns the draft-envelope-shaped payload — NOT persisted.
export const instantiateTemplate = async (id, payload) =>
  unwrap(await api.post(docusignPath(`/templates/${id}/instantiate`), payload))

// ── Bulk send (CSV) ───────────────────────────────────────────────
// Multipart body: { template_id, csv_file (File), send_immediately? }
export const startBulkSend = async (payload) => {
  const fd = new FormData()
  if (payload?.template_id) fd.append('template_id', payload.template_id)
  if (payload?.csv_file) fd.append('csv_file', payload.csv_file)
  if (payload?.send_immediately !== undefined) {
    fd.append('send_immediately', String(payload.send_immediately))
  }
  return unwrap(await api.post(docusignPath('/bulk-send'), fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }))
}

export const getBulkJobs = async (params = {}) =>
  unwrap(await api.get(docusignPath('/bulk-jobs'), { params }))

export const getBulkJob = async (id) =>
  unwrap(await api.get(docusignPath(`/bulk-jobs/${id}`)))

export const retryFailedBulkRows = async (id) =>
  unwrap(await api.post(docusignPath(`/bulk-jobs/${id}/retry-failed`)))

// ── Public token-gated signer routes (no auth) ───────────────────
// These hit /api/sign/* and use the token in the body as the only
// credential. The backend in this project does not yet expose these
// routes — calls will 404 until the corresponding controller +
// router are added. Shape is kept here so the slice + signing view can
// switch over without further API-layer changes.
export const resolveTokenEnvelope = async (token) =>
  unwrap(await api.post(signPath('/resolve'), { token }))

export const acceptTokenTerms = async (token) =>
  unwrap(await api.post(signPath('/accept'), { token }))

export const submitTokenSign = async (payload) =>
  unwrap(await api.patch(signPath('/submit'), payload))

export const declineTokenSign = async (token, declined_reason) =>
  unwrap(await api.post(signPath('/decline'), { token, declined_reason }))
