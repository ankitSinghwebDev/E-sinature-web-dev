/**
 * DocuSign Redux slice — bucket-organized envelopes, saved-signature
 * cache with TTL, and socket-driven upsert/removal hooks.
 *
 * State shape carries two views of the envelopes:
 *   • `envelopesByStatus` (authoritative) — per-bucket arrays keyed by
 *     state key (draft, received, sent, completed_{sent,received},
 *     rejected_{sent,received}).
 *   • `envelopes` (flat, derived) — union of all buckets, dedup-by-id.
 *     Kept in sync by the reducer so existing components that read
 *     `s.docusign.envelopes` keep working without changes.
 *
 * The current backend exposes a flat GET /docusign/envelopes endpoint
 * that returns every envelope the user can see. The bucket fetch thunks
 * call that single endpoint and distribute results into buckets
 * client-side using the current user's identity. When the backend is
 * upgraded to honour `bucket` + `scope` query params, swap the
 * distribution in `bucketize` for whatever the server returns.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from './docusignApi'
import {
  normalizeEnvelopeList,
  normalizeEnvelopeShape,
  normalizeEnvelopeWritePayload,
} from './envelopeShape'

// Logical UI buckets the panel exposes.
export const ENVELOPE_STATUS_BUCKETS = [
  'draft',
  'received',
  'sent',
  'completed',
  'rejected',
]

// Internal storage keys — `completed` and `rejected` are split by scope
// (sent vs received) so admin "Manage" and "Sign" views don't collide.
const ENVELOPE_STATE_KEYS = [
  'draft',
  'received',
  'sent',
  'completed_sent',
  'completed_received',
  'rejected_sent',
  'rejected_received',
]

export const envelopeStateKey = (bucket, scope) => {
  if (bucket === 'completed' || bucket === 'rejected') {
    return `${bucket}_${scope === 'received' ? 'received' : 'sent'}`
  }
  return bucket
}

// ── Helpers ─────────────────────────────────────────────────────
const emptyByStatus = () =>
  ENVELOPE_STATE_KEYS.reduce((acc, k) => ({ ...acc, [k]: [] }), {})

const emptyLoading = () =>
  ENVELOPE_STATE_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {})

const emptyFetched = () =>
  ENVELOPE_STATE_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {})

export const bucketToArray = (v) => {
  if (Array.isArray(v)) return v
  if (Array.isArray(v?.items)) return v.items
  return []
}

const upsertById = (list, env) => {
  if (!env?._id) return list
  const i = list.findIndex((e) => e._id === env._id)
  if (i === -1) return [env, ...list]
  const next = list.slice()
  next[i] = env
  return next
}

const removeById = (list, id) => list.filter((e) => e._id !== id)

const mapAcrossBuckets = (byStatus, fn) =>
  ENVELOPE_STATE_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: fn(byStatus[k] || []) }),
    {},
  )

// Flatten + dedup all buckets into a single envelope list. Used to keep
// the backward-compat `state.envelopes` array in sync after every
// bucket mutation.
const flattenBuckets = (byStatus) => {
  const seen = new Set()
  const out = []
  ENVELOPE_STATE_KEYS.forEach((k) => {
    ;(byStatus[k] || []).forEach((env) => {
      if (!env?._id || seen.has(env._id)) return
      seen.add(env._id)
      out.push(env)
    })
  })
  return out
}

// Decide which bucket(s) an envelope belongs to from the current user's
// perspective. Returns a list of state keys.
const bucketsFor = (env, userId) => {
  if (!env || !env.status) return []
  const createdById = env.created_by || env.createdBy
  const isCreator = userId && createdById && String(createdById) === String(userId)
  const isRecipient = Array.isArray(env.recipients) && env.recipients.some((r) => {
    const rid = r?.user_id || r?.userId
    return userId && rid && String(rid) === String(userId)
  })

  switch (env.status) {
    case 'draft':
      return isCreator ? ['draft'] : []
    case 'sent':
    case 'delivered':
    case 'signed':
      return [
        ...(isCreator ? ['sent'] : []),
        ...(isRecipient && !isCreator ? ['received'] : []),
      ]
    case 'completed':
      return [
        ...(isCreator ? ['completed_sent'] : []),
        ...(isRecipient && !isCreator ? ['completed_received'] : []),
      ]
    case 'declined':
    case 'voided':
    case 'expired':
      return [
        ...(isCreator ? ['rejected_sent'] : []),
        ...(isRecipient && !isCreator ? ['rejected_received'] : []),
      ]
    default:
      return []
  }
}

// Distribute a flat envelope list into the seven internal bucket keys
// using the current user's identity. Buckets without a logical owner
// (e.g. envelopes the user is neither creator nor recipient of) are
// dropped — they shouldn't be in the user's response in the first place.
const bucketize = (envelopes, userId) => {
  const out = emptyByStatus()
  envelopes.forEach((env) => {
    bucketsFor(env, userId).forEach((key) => {
      out[key] = upsertById(out[key], env)
    })
  })
  return out
}

// Tolerate both `data: [...]` and `data: { items: [...] }` response shapes.
const extractList = (payload) => {
  const data = payload?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  return []
}

// ── Thunks: envelope fetch ──────────────────────────────────────
// Single fetch + client-side bucket distribution. The `statuses` arg
// selects which buckets to repopulate; the others are left untouched.
// `scope` is forwarded for symmetry with the zillit interface and is
// honoured for completed/rejected — for the others scope is ignored.
export const fetchDocuSignEnvelopes = createAsyncThunk(
  'docusign/fetchEnvelopes',
  async (
    { statuses = ENVELOPE_STATUS_BUCKETS, scope, ...extra } = {},
    { getState, rejectWithValue },
  ) => {
    try {
      const payload = await api.getEnvelopes(extra)
      const list = extractList(payload)
      normalizeEnvelopeList(list)
      const userId = getState()?.auth?.user?._id || getState()?.auth?.user?.id
      return { statuses, scope, envelopes: list, userId, raw: payload }
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to fetch envelopes')
    }
  },
)

// Per-bucket fetch. Uses the same underlying endpoint and filters
// client-side into the requested bucket. Backend can later honour
// `bucket` + `scope` query params — swap the API call args here.
export const fetchDocuSignEnvelopesByStatus = createAsyncThunk(
  'docusign/fetchEnvelopesByStatus',
  async ({ status, scope, ...extra } = {}, { getState, rejectWithValue }) => {
    try {
      const payload = await api.getEnvelopes(extra)
      const list = extractList(payload)
      normalizeEnvelopeList(list)
      const userId = getState()?.auth?.user?._id || getState()?.auth?.user?.id
      return { status, scope, envelopes: list, userId, raw: payload }
    } catch (err) {
      return rejectWithValue({
        status,
        scope,
        message: err?.response?.data?.message || err?.message || 'Failed to fetch envelopes',
      })
    }
  },
)

export const fetchDocuSignEnvelope = createAsyncThunk(
  'docusign/fetchEnvelope',
  async (id, { rejectWithValue }) => {
    try {
      const payload = await api.getEnvelope(id)
      if (payload?.data) normalizeEnvelopeShape(payload.data)
      return payload
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to fetch envelope')
    }
  },
)

// ── Thunks: envelope mutations ──────────────────────────────────
export const createDocuSignEnvelope = createAsyncThunk(
  'docusign/createEnvelope',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.createEnvelope(normalizeEnvelopeWritePayload(payload))
      if (response?.data) normalizeEnvelopeShape(response.data)
      return response
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to create envelope')
    }
  },
)

export const updateDocuSignEnvelope = createAsyncThunk(
  'docusign/updateEnvelope',
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const response = await api.updateEnvelope(id, normalizeEnvelopeWritePayload(payload))
      if (response?.data) normalizeEnvelopeShape(response.data)
      return response
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to update envelope')
    }
  },
)

export const sendDocuSignEnvelope = createAsyncThunk(
  'docusign/sendEnvelope',
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const response = await api.sendEnvelope(id, payload)
      if (response?.data) normalizeEnvelopeShape(response.data)
      return response
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to send envelope')
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
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to void envelope')
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
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to delete envelope')
    }
  },
)

// ── Thunks: saved signatures ────────────────────────────────────
const SAVED_SIG_TTL_MS = 5 * 60 * 1000

export const fetchSavedSignatures = createAsyncThunk(
  'docusign/fetchSavedSignatures',
  async (_arg, { rejectWithValue }) => {
    try {
      const resp = await api.getSavedSignatures()
      const rawData = resp?.data?.data ?? resp?.data
      const all = Array.isArray(rawData) ? rawData : (rawData?.items || [])
      return all
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to fetch saved signatures')
    }
  },
  {
    // Skip the refetch if the cache is fresh and has data; the caller
    // can pass `{ force: true }` to bypass.
    condition: (arg, { getState }) => {
      const force = arg?.force === true
      if (force) return true
      const s = getState().docusign?.savedSignatures
      if (!s) return true
      if (s.loading) return false
      const age = Date.now() - (s.lastFetched || 0)
      const hasData = (s.signatures?.length || 0) + (s.initials?.length || 0) > 0
      return !hasData || age > SAVED_SIG_TTL_MS
    },
  },
)

export const createSavedSignatureEntry = createAsyncThunk(
  'docusign/createSavedSignature',
  async ({ kind, image, displayUrl }, { rejectWithValue }) => {
    try {
      const resp = await api.createSavedSignature({ kind, image })
      const saved = resp?.data?.data || resp?.data
      if (!saved?._id) return rejectWithValue('Backend did not return a saved id')
      return { ...saved, displayUrl: displayUrl || saved.displayUrl || null }
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to save signature')
    }
  },
)

export const deleteSavedSignatureEntry = createAsyncThunk(
  'docusign/deleteSavedSignature',
  async ({ id }, { rejectWithValue }) => {
    try {
      await api.deleteSavedSignature(id)
      return id
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to delete signature')
    }
  },
)

// ── Thunks: templates ───────────────────────────────────────────
export const fetchDocuSignTemplates = createAsyncThunk(
  'docusign/fetchTemplates',
  async (params = {}, { rejectWithValue }) => {
    try {
      const resp = await api.getTemplates(params)
      const data = resp?.data
      return Array.isArray(data?.items) ? data.items
        : Array.isArray(data) ? data
          : []
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to fetch templates')
    }
  },
)

export const createDocuSignTemplate = createAsyncThunk(
  'docusign/createTemplate',
  async (payload, { rejectWithValue }) => {
    try {
      const resp = await api.createTemplate(payload)
      return resp?.data
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to save template')
    }
  },
)

export const updateDocuSignTemplate = createAsyncThunk(
  'docusign/updateTemplate',
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const resp = await api.updateTemplate(id, payload)
      return resp?.data
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to update template')
    }
  },
)

export const deleteDocuSignTemplate = createAsyncThunk(
  'docusign/deleteTemplate',
  async ({ id }, { rejectWithValue }) => {
    try {
      await api.deleteTemplate(id)
      return id
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to delete template')
    }
  },
)

// Returns the draft-envelope payload built from the template (NOT
// persisted). The caller (envelope editor) opens it for review, then
// the normal createEnvelope/sendEnvelope flow commits it.
export const instantiateDocuSignTemplate = createAsyncThunk(
  'docusign/instantiateTemplate',
  async ({ id, recipients = [], pre_fill_values }, { rejectWithValue }) => {
    try {
      const resp = await api.instantiateTemplate(id, { recipients, pre_fill_values })
      return resp?.data
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to instantiate template')
    }
  },
)

// ── Thunks: bulk send ───────────────────────────────────────────
export const startDocuSignBulkSend = createAsyncThunk(
  'docusign/startBulkSend',
  async (payload, { rejectWithValue }) => {
    try {
      const resp = await api.startBulkSend(payload)
      return resp?.data
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to start bulk send')
    }
  },
)

export const fetchDocuSignBulkJobs = createAsyncThunk(
  'docusign/fetchBulkJobs',
  async (_arg, { rejectWithValue }) => {
    try {
      const resp = await api.getBulkJobs()
      const data = resp?.data
      return Array.isArray(data?.items) ? data.items
        : Array.isArray(data) ? data
          : []
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to fetch bulk jobs')
    }
  },
)

export const fetchDocuSignBulkJob = createAsyncThunk(
  'docusign/fetchBulkJob',
  async (id, { rejectWithValue }) => {
    try {
      const resp = await api.getBulkJob(id)
      return resp?.data
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to fetch bulk job')
    }
  },
)

export const retryDocuSignBulkFailed = createAsyncThunk(
  'docusign/retryBulkFailed',
  async ({ id }, { rejectWithValue }) => {
    try {
      const resp = await api.retryFailedBulkRows(id)
      return resp?.data
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err?.message || 'Failed to retry failed rows')
    }
  },
)

// ── Slice ───────────────────────────────────────────────────────
const initialState = {
  envelopesByStatus: emptyByStatus(),
  loadingByStatus: emptyLoading(),
  fetchedByStatus: emptyFetched(),
  // Flat, derived view of all buckets. Maintained by the reducer for
  // backward compat with components that read `s.docusign.envelopes`.
  envelopes: [],
  // True iff any bucket is loading. Mirrors the old `isLoading` flag.
  isLoading: false,
  currentEnvelope: null,
  error: null,
  savedSignatures: {
    signatures: [],
    initials: [],
    loading: false,
    lastFetched: 0,
    error: null,
  },
  // ── Templates ──
  templates: [],
  templatesLoading: false,
  templatesFetched: false,
  templatesError: null,
  // ── Bulk jobs ──
  bulkJobs: [],
  bulkJobsLoading: false,
  bulkJobsFetched: false,
  bulkJobsError: null,
  currentBulkJob: null,
}

// Recompute the derived flat view + isLoading flag after any mutation
// that touched envelopesByStatus or loadingByStatus.
const syncDerived = (state) => {
  state.envelopes = flattenBuckets(state.envelopesByStatus)
  state.isLoading = Object.values(state.loadingByStatus).some(Boolean)
}

// Pre-cleanup persisted state may be missing maps or have buckets stored
// as `{ items, total, page, limit }` wrappers. Coerce in place.
const ensureShape = (state) => {
  if (!state.envelopesByStatus) state.envelopesByStatus = emptyByStatus()
  ENVELOPE_STATE_KEYS.forEach((k) => {
    const v = state.envelopesByStatus[k]
    if (!Array.isArray(v)) {
      state.envelopesByStatus[k] = Array.isArray(v?.items) ? v.items : []
    }
  })
  if (!state.loadingByStatus) state.loadingByStatus = emptyLoading()
  if (!state.fetchedByStatus) state.fetchedByStatus = emptyFetched()
  if (!state.savedSignatures) {
    state.savedSignatures = { signatures: [], initials: [], loading: false, lastFetched: 0, error: null }
  }
  if (!Array.isArray(state.envelopes)) state.envelopes = []
  if (typeof state.isLoading !== 'boolean') state.isLoading = false
}

const docusignSlice = createSlice({
  name: 'docusign',
  initialState,
  reducers: {
    clearCurrentEnvelope: (state) => {
      state.currentEnvelope = null
    },

    clearCurrentBulkJob: (state) => {
      state.currentBulkJob = null
    },

    // Socket bridge: bridged in via DocuSignObservers. Upserts the
    // envelope into the bucket it belongs to from the current user's
    // perspective, and removes it from buckets it no longer belongs to
    // after a terminal transition (completed / declined / voided /
    // expired). Inert unless something dispatches it.
    applyEnvelopeUpdate: (state, action) => {
      ensureShape(state)
      const env = action.payload
      if (!env?._id) return
      normalizeEnvelopeShape(env)
      if (state.currentEnvelope?._id === env._id) state.currentEnvelope = env

      // Get the user id off the envelope's nearest signal — the socket
      // event doesn't carry the viewer's identity, so we infer
      // membership from buckets the envelope is already in.
      const wasIn = ENVELOPE_STATE_KEYS.filter((k) =>
        (state.envelopesByStatus[k] || []).some((e) => e._id === env._id),
      )
      const terminal = env.status === 'completed' ? 'completed'
        : env.status === 'declined' || env.status === 'voided' || env.status === 'expired' ? 'rejected'
          : null

      if (terminal) {
        const terminalSent = `${terminal}_sent`
        const terminalReceived = `${terminal}_received`
        const wasSentSide = wasIn.includes('sent') || wasIn.includes(terminalSent)
        const wasReceivedSide = wasIn.includes('received') || wasIn.includes(terminalReceived)

        // Drop from non-terminal buckets.
        ;['draft', 'received', 'sent'].forEach((k) => {
          state.envelopesByStatus[k] = removeById(state.envelopesByStatus[k] || [], env._id)
        })
        if (wasSentSide) {
          state.envelopesByStatus[terminalSent] = upsertById(
            state.envelopesByStatus[terminalSent] || [], env,
          )
        }
        if (wasReceivedSide) {
          state.envelopesByStatus[terminalReceived] = upsertById(
            state.envelopesByStatus[terminalReceived] || [], env,
          )
        }
        syncDerived(state)
        return
      }

      // Non-terminal: refresh any bucket already holding it.
      ENVELOPE_STATE_KEYS.forEach((k) => {
        const list = state.envelopesByStatus[k] || []
        if (list.some((e) => e._id === env._id)) {
          state.envelopesByStatus[k] = upsertById(list, env)
        }
      })
      if (env.status === 'draft' && wasIn.length === 0) {
        // Brand-new draft seen via socket — slot it into the draft bucket.
        state.envelopesByStatus.draft = upsertById(state.envelopesByStatus.draft || [], env)
      }
      syncDerived(state)
    },

    removeEnvelopeById: (state, action) => {
      ensureShape(state)
      const id = action.payload
      if (!id) return
      state.envelopesByStatus = mapAcrossBuckets(state.envelopesByStatus, (list) =>
        removeById(list, id),
      )
      if (state.currentEnvelope?._id === id) state.currentEnvelope = null
      syncDerived(state)
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Multi-bucket fetch ──
      .addCase(fetchDocuSignEnvelopes.pending, (state, action) => {
        ensureShape(state)
        const statuses = action.meta.arg?.statuses || ENVELOPE_STATUS_BUCKETS
        const scope = action.meta.arg?.scope
        statuses.forEach((b) => {
          const key = envelopeStateKey(b, scope)
          if (key) state.loadingByStatus[key] = true
        })
        state.error = null
        syncDerived(state)
      })
      .addCase(fetchDocuSignEnvelopes.fulfilled, (state, action) => {
        ensureShape(state)
        const { statuses, scope, envelopes, userId } = action.payload || {}
        const distributed = bucketize(envelopes || [], userId)
        const requestedKeys = (statuses || ENVELOPE_STATUS_BUCKETS).map((b) =>
          envelopeStateKey(b, scope),
        )
        // Replace only the buckets the caller asked for. Buckets not
        // requested stay untouched.
        requestedKeys.forEach((k) => {
          if (k) {
            state.envelopesByStatus[k] = distributed[k] || []
            state.loadingByStatus[k] = false
            state.fetchedByStatus[k] = true
          }
        })
        syncDerived(state)
      })
      .addCase(fetchDocuSignEnvelopes.rejected, (state, action) => {
        ensureShape(state)
        const statuses = action.meta.arg?.statuses || ENVELOPE_STATUS_BUCKETS
        const scope = action.meta.arg?.scope
        statuses.forEach((b) => {
          const key = envelopeStateKey(b, scope)
          if (key) state.loadingByStatus[key] = false
        })
        state.error = action.payload || action.error?.message
        syncDerived(state)
      })

      // ── Per-bucket fetch ──
      .addCase(fetchDocuSignEnvelopesByStatus.pending, (state, action) => {
        ensureShape(state)
        const { status, scope } = action.meta.arg || {}
        const key = envelopeStateKey(status, scope)
        if (key) state.loadingByStatus[key] = true
        state.error = null
        syncDerived(state)
      })
      .addCase(fetchDocuSignEnvelopesByStatus.fulfilled, (state, action) => {
        ensureShape(state)
        const { status, scope, envelopes, userId } = action.payload || {}
        const key = envelopeStateKey(status, scope)
        if (!key) return
        const distributed = bucketize(envelopes || [], userId)
        state.envelopesByStatus[key] = distributed[key] || []
        state.loadingByStatus[key] = false
        state.fetchedByStatus[key] = true
        syncDerived(state)
      })
      .addCase(fetchDocuSignEnvelopesByStatus.rejected, (state, action) => {
        ensureShape(state)
        const status = action.payload?.status || action.meta.arg?.status
        const scope = action.payload?.scope || action.meta.arg?.scope
        const key = envelopeStateKey(status, scope)
        if (key) state.loadingByStatus[key] = false
        state.error = action.payload?.message || action.error?.message
        syncDerived(state)
      })

      // ── Single envelope ──
      .addCase(fetchDocuSignEnvelope.fulfilled, (state, action) => {
        ensureShape(state)
        const env = action.payload?.data || null
        state.currentEnvelope = env
        if (!env?._id) return
        ENVELOPE_STATE_KEYS.forEach((k) => {
          const list = state.envelopesByStatus[k] || []
          if (list.some((e) => e._id === env._id)) {
            state.envelopesByStatus[k] = upsertById(list, env)
          }
        })
        syncDerived(state)
      })

      // ── Mutations ──
      .addCase(createDocuSignEnvelope.fulfilled, (state, action) => {
        ensureShape(state)
        const env = action.payload?.data
        if (!env) return
        state.currentEnvelope = env
        if (env.status === 'draft') {
          state.envelopesByStatus.draft = upsertById(
            state.envelopesByStatus.draft || [], env,
          )
        }
        syncDerived(state)
      })
      .addCase(updateDocuSignEnvelope.fulfilled, (state, action) => {
        ensureShape(state)
        const env = action.payload?.data
        if (!env) return
        state.currentEnvelope = env
        ENVELOPE_STATE_KEYS.forEach((k) => {
          const list = state.envelopesByStatus[k] || []
          if (list.some((e) => e._id === env._id)) {
            state.envelopesByStatus[k] = upsertById(list, env)
          }
        })
        syncDerived(state)
      })
      .addCase(sendDocuSignEnvelope.fulfilled, (state, action) => {
        ensureShape(state)
        const env = action.payload?.data
        if (!env) return
        state.currentEnvelope = env
        // The envelope leaves the draft bucket on send.
        state.envelopesByStatus.draft = removeById(
          state.envelopesByStatus.draft || [], env._id,
        )
        // Refresh any bucket already holding it (e.g. sent if the
        // current user was already viewing the in-flight list).
        ENVELOPE_STATE_KEYS.forEach((k) => {
          const list = state.envelopesByStatus[k] || []
          if (list.some((e) => e._id === env._id)) {
            state.envelopesByStatus[k] = upsertById(list, env)
          }
        })
        syncDerived(state)
      })
      .addCase(voidDocuSignEnvelope.fulfilled, (state, action) => {
        ensureShape(state)
        const id = action.payload?.id
        state.envelopesByStatus = mapAcrossBuckets(state.envelopesByStatus, (list) =>
          list.map((e) => (e._id === id ? { ...e, status: 'voided' } : e)),
        )
        if (state.currentEnvelope?._id === id) state.currentEnvelope.status = 'voided'
        syncDerived(state)
      })
      .addCase(deleteDocuSignEnvelope.fulfilled, (state, action) => {
        ensureShape(state)
        const id = action.payload
        state.envelopesByStatus = mapAcrossBuckets(state.envelopesByStatus, (list) =>
          removeById(list, id),
        )
        if (state.currentEnvelope?._id === id) state.currentEnvelope = null
        syncDerived(state)
      })

      // ── Saved signatures ──
      .addCase(fetchSavedSignatures.pending, (state) => {
        ensureShape(state)
        state.savedSignatures.loading = true
        state.savedSignatures.error = null
      })
      .addCase(fetchSavedSignatures.fulfilled, (state, action) => {
        ensureShape(state)
        const all = action.payload || []
        state.savedSignatures.signatures = all.filter((s) => s.kind === 'signature')
        state.savedSignatures.initials = all.filter((s) => s.kind === 'initial')
        state.savedSignatures.loading = false
        state.savedSignatures.lastFetched = Date.now()
        state.savedSignatures.error = null
      })
      .addCase(fetchSavedSignatures.rejected, (state, action) => {
        ensureShape(state)
        state.savedSignatures.loading = false
        state.savedSignatures.error = action.payload || action.error?.message || 'Failed to load saved signatures'
      })
      .addCase(createSavedSignatureEntry.fulfilled, (state, action) => {
        ensureShape(state)
        const entry = action.payload
        if (!entry?._id) return
        if (entry.kind === 'signature') {
          state.savedSignatures.signatures = [
            entry,
            ...state.savedSignatures.signatures.filter((s) => s._id !== entry._id),
          ]
        } else if (entry.kind === 'initial') {
          state.savedSignatures.initials = [
            entry,
            ...state.savedSignatures.initials.filter((s) => s._id !== entry._id),
          ]
        }
      })
      .addCase(deleteSavedSignatureEntry.fulfilled, (state, action) => {
        ensureShape(state)
        const id = action.payload
        state.savedSignatures.signatures = state.savedSignatures.signatures.filter((s) => s._id !== id)
        state.savedSignatures.initials = state.savedSignatures.initials.filter((s) => s._id !== id)
      })

      // ── Templates ──
      .addCase(fetchDocuSignTemplates.pending, (state) => {
        state.templatesLoading = true
        state.templatesError = null
      })
      .addCase(fetchDocuSignTemplates.fulfilled, (state, action) => {
        state.templates = action.payload || []
        state.templatesLoading = false
        state.templatesFetched = true
        state.templatesError = null
      })
      .addCase(fetchDocuSignTemplates.rejected, (state, action) => {
        state.templatesLoading = false
        state.templatesError = action.payload || action.error?.message || 'Failed to load templates'
      })
      .addCase(createDocuSignTemplate.fulfilled, (state, action) => {
        const tpl = action.payload
        if (!tpl?._id) return
        state.templates = [tpl, ...state.templates.filter((t) => t._id !== tpl._id)]
      })
      .addCase(updateDocuSignTemplate.fulfilled, (state, action) => {
        const tpl = action.payload
        if (!tpl?._id) return
        state.templates = state.templates.map((t) => (t._id === tpl._id ? tpl : t))
      })
      .addCase(deleteDocuSignTemplate.fulfilled, (state, action) => {
        const id = action.payload
        state.templates = state.templates.filter((t) => t._id !== id)
      })

      // ── Bulk jobs ──
      .addCase(fetchDocuSignBulkJobs.pending, (state) => {
        state.bulkJobsLoading = true
        state.bulkJobsError = null
      })
      .addCase(fetchDocuSignBulkJobs.fulfilled, (state, action) => {
        state.bulkJobs = action.payload || []
        state.bulkJobsLoading = false
        state.bulkJobsFetched = true
        state.bulkJobsError = null
      })
      .addCase(fetchDocuSignBulkJobs.rejected, (state, action) => {
        state.bulkJobsLoading = false
        state.bulkJobsError = action.payload || action.error?.message || 'Failed to load bulk jobs'
      })
      .addCase(fetchDocuSignBulkJob.fulfilled, (state, action) => {
        state.currentBulkJob = action.payload || null
      })
      .addCase(startDocuSignBulkSend.fulfilled, (state) => {
        // Force a refetch on next read by clearing the fetched flag —
        // the new job will land in the dashboard's next poll tick.
        state.bulkJobsFetched = false
      })
  },
})

export const {
  clearCurrentEnvelope,
  clearCurrentBulkJob,
  applyEnvelopeUpdate,
  removeEnvelopeById,
} = docusignSlice.actions

export default docusignSlice.reducer
