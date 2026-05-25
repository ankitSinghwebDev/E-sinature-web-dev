import api from '../api/client'

const BASE = '/docusign'

// ── Envelope CRUD ────────────────────────────────────────────────────
export const createEnvelope = (payload) => api.post(`${BASE}/envelopes`, payload)
export const getEnvelopes = (params) => api.get(`${BASE}/envelopes`, { params })
export const getEnvelope = (id) => api.get(`${BASE}/envelopes/${id}`)
export const updateEnvelope = (id, payload) => api.put(`${BASE}/envelopes/${id}`, payload)
export const deleteEnvelope = (id) => api.delete(`${BASE}/envelopes/${id}`)

// ── Envelope actions ─────────────────────────────────────────────────
export const sendEnvelope = (id, payload) => api.post(`${BASE}/envelopes/${id}/send`, payload)
export const resendEnvelope = (id) => api.post(`${BASE}/envelopes/${id}/resend`)
export const voidEnvelope = (id, reason) => api.post(`${BASE}/envelopes/${id}/void`, { reason })

// ── Signing ──────────────────────────────────────────────────────────
export const getSigningUrl = (id, recipientEmail, returnUrl) =>
  api.post(`${BASE}/envelopes/${id}/signing-url`, { recipientEmail, returnUrl })
export const updateRecipientStatus = (id, payload) =>
  api.patch(`${BASE}/envelopes/${id}/recipient-status`, payload)

// ── Documents & audit ────────────────────────────────────────────────
export const downloadSignedDocument = (id) =>
  api.post(`${BASE}/envelopes/${id}/download`, {}, { responseType: 'blob' })
export const getAuditTrail = (id) => api.get(`${BASE}/envelopes/${id}/audit-trail`)

// ── Admin sync ───────────────────────────────────────────────────────
export const syncStatuses = () => api.post(`${BASE}/sync-status`)

// ── Saved signatures & initials ─────────────────────────────────────
export const getSavedSignatures = () => api.get(`${BASE}/saved-signatures`)
export const createSavedSignature = (payload) =>
  api.post(`${BASE}/saved-signatures`, payload)
export const deleteSavedSignature = (id) =>
  api.delete(`${BASE}/saved-signatures/${id}`)
