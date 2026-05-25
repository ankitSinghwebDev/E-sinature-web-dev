/**
 * DocuSign eSignature API Service
 *
 * Wraps DocuSign REST API calls for envelope creation, sending,
 * embedded signing, and status management.
 *
 * Required env vars:
 *   DOCUSIGN_INTEGRATION_KEY   – OAuth integration key (client ID)
 *   DOCUSIGN_SECRET_KEY        – OAuth secret
 *   DOCUSIGN_ACCOUNT_ID        – DocuSign account ID
 *   DOCUSIGN_USER_ID           – Impersonated user GUID (for JWT grant)
 *   DOCUSIGN_BASE_URL          – e.g. https://demo.docusign.net/restapi (demo) or https://na4.docusign.net/restapi (prod)
 *   DOCUSIGN_AUTH_SERVER       – e.g. account-d.docusign.com (demo) or account.docusign.com (prod)
 *   DOCUSIGN_PRIVATE_KEY_PATH  – Path to RSA private key PEM for JWT auth
 *   DOCUSIGN_REDIRECT_URI      – OAuth redirect URI
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const BASE_URL = process.env.DOCUSIGN_BASE_URL || 'https://demo.docusign.net/restapi'
const AUTH_SERVER = process.env.DOCUSIGN_AUTH_SERVER || 'account-d.docusign.com'
const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID || ''
const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY || ''

let cachedToken = null
let tokenExpiresAt = 0

/* ── Helper: build API client with current token ─────────────────────── */
function apiClient(accessToken) {
  return axios.create({
    baseURL: `${BASE_URL}/v2.1/accounts/${ACCOUNT_ID}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
}

/* ── Auth: JWT Grant flow ────────────────────────────────────────────── */
async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken
  }

  try {
    const jwt = require('jsonwebtoken')
    const privateKeyPath = process.env.DOCUSIGN_PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/docusign_private.pem')
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8')

    const now = Math.floor(Date.now() / 1000)
    const jwtPayload = {
      iss: INTEGRATION_KEY,
      sub: process.env.DOCUSIGN_USER_ID || '',
      aud: AUTH_SERVER,
      iat: now,
      exp: now + 3600,
      scope: 'signature impersonation',
    }

    const assertion = jwt.sign(jwtPayload, privateKey, { algorithm: 'RS256' })

    const { data } = await axios.post(`https://${AUTH_SERVER}/oauth/token`, null, {
      params: {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      },
    })

    cachedToken = data.access_token
    tokenExpiresAt = Date.now() + data.expires_in * 1000
    return cachedToken
  } catch (err) {
    console.error('[DocuSign] JWT auth failed:', err.response?.data || err.message)
    throw new Error('DocuSign authentication failed')
  }
}

/* ── Map internal tab types to DocuSign tab type names ────────────────── */
function mapTabType(type) {
  const mapping = {
    signHere: 'signHereTabs',
    initialHere: 'initialHereTabs',
    dateSigned: 'dateSignedTabs',
    fullName: 'fullNameTabs',
    email: 'emailTabs',
    company: 'companyTabs',
    title: 'titleTabs',
    text: 'textTabs',
    checkbox: 'checkboxTabs',
    approve: 'approveTabs',
    decline: 'declineTabs',
  }
  return mapping[type] || 'textTabs'
}

/* ── Build DocuSign tabs object from our tab documents ───────────────── */
function buildRecipientTabs(tabs, recipientIndex) {
  const recipientTabs = tabs.filter((t) => t.recipientIndex === recipientIndex)
  const dsTabsObj = {}

  for (const tab of recipientTabs) {
    const dsType = mapTabType(tab.type)
    if (!dsTabsObj[dsType]) dsTabsObj[dsType] = []

    const dsTab = {
      documentId: '1',
      recipientId: String(recipientIndex + 1),
      required: tab.required ? 'true' : 'false',
    }

    if (tab.label) dsTab.tabLabel = tab.label
    if (tab.value) dsTab.value = tab.value

    if (tab.placementMode === 'anchor' && tab.anchorString) {
      dsTab.anchorString = tab.anchorString
      dsTab.anchorXOffset = String(tab.anchorXOffset || 0)
      dsTab.anchorYOffset = String(tab.anchorYOffset || 0)
      dsTab.anchorUnits = tab.anchorUnits || 'pixels'
    } else {
      dsTab.pageNumber = String(tab.pageNumber || 1)
      dsTab.xPosition = String(tab.xPosition || 0)
      dsTab.yPosition = String(tab.yPosition || 0)
    }

    if (tab.width) dsTab.width = String(tab.width)
    if (tab.height) dsTab.height = String(tab.height)

    dsTabsObj[dsType].push(dsTab)
  }

  return dsTabsObj
}

/* ══════════════════════════════════════════════════════════════════════
 *  PUBLIC API
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * Create an envelope on DocuSign and optionally send it.
 *
 * @param {Object} params
 * @param {Buffer|string} params.documentBase64 – base64-encoded PDF
 * @param {string} params.documentName
 * @param {Array} params.recipients – from our model
 * @param {Array} params.tabs – from our model
 * @param {string} params.emailSubject
 * @param {string} params.emailBody
 * @param {string} params.status – 'created' (draft) or 'sent'
 * @returns {Object} { envelopeId, status, uri }
 */
async function createEnvelope({
  documentBase64,
  documentName,
  recipients,
  tabs,
  emailSubject,
  emailBody,
  status = 'sent',
}) {
  const token = await getAccessToken()
  const client = apiClient(token)

  // Build signers array
  const signers = recipients
    .filter((r) => r.role === 'signer' || r.role === 'in_person_signer')
    .map((r, idx) => ({
      email: r.email,
      name: r.name,
      recipientId: String(idx + 1),
      routingOrder: String(r.routingOrder || idx + 1),
      tabs: buildRecipientTabs(tabs, recipients.indexOf(r)),
    }))

  // Build CC recipients
  const carbonCopies = recipients
    .filter((r) => r.role === 'cc')
    .map((r, idx) => ({
      email: r.email,
      name: r.name,
      recipientId: String(signers.length + idx + 1),
      routingOrder: String(r.routingOrder || signers.length + idx + 1),
    }))

  const envelopeDefinition = {
    emailSubject: emailSubject || `Please sign: ${documentName}`,
    emailBlurb: emailBody || '',
    documents: [
      {
        documentBase64,
        name: documentName || 'Document.pdf',
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers,
      carbonCopies,
    },
    status, // 'created' = draft, 'sent' = send immediately
  }

  const { data } = await client.post('/envelopes', envelopeDefinition)
  return {
    envelopeId: data.envelopeId,
    status: data.status,
    uri: data.uri,
  }
}

/**
 * Send a draft envelope (change status from 'created' to 'sent').
 */
async function sendEnvelope(envelopeId) {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.put(`/envelopes/${envelopeId}`, { status: 'sent' })
  return data
}

/**
 * Void (cancel) an envelope.
 */
async function voidEnvelope(envelopeId, voidReason = 'Voided by admin') {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.put(`/envelopes/${envelopeId}`, {
    status: 'voided',
    voidedReason: voidReason,
  })
  return data
}

/**
 * Resend envelope notifications to recipients.
 */
async function resendEnvelope(envelopeId) {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.put(`/envelopes/${envelopeId}/recipients?resend_envelope=true`)
  return data
}

/**
 * Get envelope status from DocuSign.
 */
async function getEnvelopeStatus(envelopeId) {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.get(`/envelopes/${envelopeId}`)
  return data
}

/**
 * Get recipients and their statuses.
 */
async function getRecipientStatus(envelopeId) {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.get(`/envelopes/${envelopeId}/recipients`)
  return data
}

/**
 * Generate an embedded signing URL for a recipient.
 * The recipient signs inside your app via an iframe/redirect.
 *
 * @param {string} envelopeId
 * @param {Object} recipient – { name, email }
 * @param {string} returnUrl – URL to redirect after signing
 * @returns {Object} { url } – the signing session URL
 */
async function createRecipientView(envelopeId, recipient, returnUrl) {
  const token = await getAccessToken()
  const client = apiClient(token)

  const { data } = await client.post(`/envelopes/${envelopeId}/views/recipient`, {
    returnUrl,
    authenticationMethod: 'none',
    email: recipient.email,
    userName: recipient.name,
    clientUserId: recipient.email, // Must match clientUserId used at envelope creation for embedded
  })

  return { url: data.url }
}

/**
 * Download the completed (signed) document.
 *
 * @param {string} envelopeId
 * @param {string} documentId – '1' for first doc, 'combined' for all, 'certificate' for CoC
 * @returns {Buffer} PDF binary
 */
async function downloadDocument(envelopeId, documentId = 'combined') {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.get(`/envelopes/${envelopeId}/documents/${documentId}`, {
    responseType: 'arraybuffer',
  })
  return data
}

/**
 * Get audit events for an envelope.
 */
async function getAuditEvents(envelopeId) {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.get(`/envelopes/${envelopeId}/audit_events`)
  return data
}

/**
 * List envelopes by status (for syncing).
 *
 * @param {string} fromDate – ISO date string
 * @param {string} status – comma-separated statuses
 */
async function listEnvelopes(fromDate, status = 'sent,delivered,completed,declined,voided') {
  const token = await getAccessToken()
  const client = apiClient(token)
  const { data } = await client.get('/envelopes', {
    params: { from_date: fromDate, status },
  })
  return data
}

module.exports = {
  getAccessToken,
  createEnvelope,
  sendEnvelope,
  voidEnvelope,
  resendEnvelope,
  getEnvelopeStatus,
  getRecipientStatus,
  createRecipientView,
  downloadDocument,
  getAuditEvents,
  listEnvelopes,
}
