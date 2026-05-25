// Shared constants for DocuSign module

export const PRIMARY = '#E8930C'

export const SIGNER_COLORS = [
  '#E8930C', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4',
  '#f59e0b', '#ec4899',
]

export const CC_ROUTING_ORDER = 99
export const DEFAULT_EXPIRATION_DAYS = 30
export const AUTO_REFRESH_INTERVAL_MS = 30000
export const PAGE_GAP = 8 // must match dummyData.js gap between stitched pages

// Field placement
export const INITIAL_W = 140
export const INITIAL_H = 35
export const INITIAL_GAP = 6
export const FIELD_MARGIN = 20
export const ROW_GAP = 24
export const AUTO_INITIAL_ROW_GAP = 6

// ----------------------------------------------------------------------
// Field types — single source of truth for every tab type the module
// understands. DocumentFieldPlacer's toolbar consumes the rows where
// `toolbar === true`; SigningView consumes `interactive` to decide
// whether the signer must capture input.
//
// `defaultShape` describes the shape of `tab.defaultValue`:
//   'string'   → free-text value
//   'bool'     → boolean (checkbox)
//   'optionId' → one of `options[].option_id` (radio / dropdown)
//   null       → field does not support a default value
//
// `hasOptions` flips on for tab types that carry an `options[]` array.
// ----------------------------------------------------------------------
export const FIELD_TYPES = [
  { type: 'signHere',    label: 'Signature',   color: '#E8930C', w: 180, h: 36,  interactive: true,  toolbar: true,  supportsDefault: false, defaultShape: null,       hasOptions: false },
  { type: 'initialHere', label: 'Initial',     color: '#3b82f6', w: 120, h: 40,  interactive: true,  toolbar: true,  supportsDefault: false, defaultShape: null,       hasOptions: false },
  { type: 'checkbox',    label: 'Checkbox',    color: '#10b981', w: 180, h: 36,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'bool',     hasOptions: false },
  { type: 'radioGroup',  label: 'Radio',       color: '#8b5cf6', w: 180, h: 64,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'optionId', hasOptions: true  },
  { type: 'dropdown',    label: 'Select',      color: '#06b6d4', w: 160, h: 32,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'optionId', hasOptions: true  },
  { type: 'text',        label: 'Text',        color: '#f59e0b', w: 150, h: 32,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'string',   hasOptions: false },
  { type: 'date',        label: 'Date',        color: '#d946ef', w: 130, h: 32,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'string',   hasOptions: false },
  { type: 'dateSigned',  label: 'Date Signed', color: '#64748b', w: 120, h: 28,  interactive: false, toolbar: false, supportsDefault: false, defaultShape: null,       hasOptions: false },
  { type: 'fullName',    label: 'Full Name',   color: '#64748b', w: 180, h: 28,  interactive: false, toolbar: false, supportsDefault: false, defaultShape: null,       hasOptions: false },
  { type: 'email',       label: 'Email',       color: '#0ea5e9', w: 180, h: 32,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'string',   hasOptions: false },
  { type: 'phone',       label: 'Phone',       color: '#14b8a6', w: 150, h: 32,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'string',   hasOptions: false },
  { type: 'number',      label: 'Number',      color: '#ef4444', w: 100, h: 32,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'string',   hasOptions: false },
  { type: 'url',         label: 'URL',         color: '#7c3aed', w: 180, h: 32,  interactive: true,  toolbar: true,  supportsDefault: true,  defaultShape: 'string',   hasOptions: false },
  { type: 'image',       label: 'Image',       color: '#0891b2', w: 120, h: 120, interactive: true,  toolbar: true,  supportsDefault: false, defaultShape: null,       hasOptions: false },
]

export const FIELD_TYPE_BY_TYPE = FIELD_TYPES.reduce((acc, f) => {
  acc[f.type] = f
  return acc
}, {})

export const getToolbarFieldTypes = () => FIELD_TYPES.filter((f) => f.toolbar)
export const isInteractiveField = (type) => !!FIELD_TYPE_BY_TYPE[type]?.interactive
export const supportsDefaultValue = (type) => !!FIELD_TYPE_BY_TYPE[type]?.supportsDefault

// Timers
export const INSTRUCTION_DISPLAY_MS = 2000
export const PAGE_NAV_HIDE_MS = 2500
export const PAGE_NAV_INITIAL_HIDE_MS = 3000

// Recipient handler helpers
export const buildRecipientUpdate = (recipients, currentUser, selectedSignerIds, users, ccList) => {
  const selfSigner = recipients.filter(
    (r) => r.role === 'signer' && (r.userId === currentUser?._id || r.email === currentUser?.email),
  )
  let ord = selfSigner.length > 0 ? Math.max(...selfSigner.map((r) => r.routingOrder || 0)) : 0
  const otherSigners = selectedSignerIds
    .map((uid) => {
      const u = (users || []).find((x) => x._id === uid)
      if (!u) return null
      const existing = recipients.find((r) => r.userId === uid && r.role === 'signer')
      if (existing) return existing
      ord += 1
      return {
        name: u.full_name || `${u.first_name} ${u.last_name}`,
        email: u.email,
        role: 'signer',
        routingOrder: ord,
        userId: u._id,
        status: 'created',
      }
    })
    .filter(Boolean)
  return [...selfSigner, ...otherSigners, ...(ccList || [])]
}

export const buildCCUpdate = (recipients, selectedCCIds, users) => {
  const signers = recipients.filter((r) => r.role === 'signer')
  const ccList = selectedCCIds
    .map((uid) => {
      const u = (users || []).find((x) => x._id === uid)
      if (!u) return null
      return {
        name: u.full_name || `${u.first_name} ${u.last_name}`,
        email: u.email,
        role: 'cc',
        routingOrder: CC_ROUTING_ORDER,
        userId: u._id,
        status: 'created',
      }
    })
    .filter(Boolean)
  return [...signers, ...ccList]
}

export const toggleSelfSignerHelper = (recipients, currentUser, checked) => {
  if (checked) {
    if (!currentUser) return recipients
    const maxOrd = recipients.reduce((m, r) => Math.max(m, r.routingOrder || 0), 0)
    return [
      ...recipients.filter(
        (r) => !(r.role === 'signer' && (r.userId === currentUser._id || r.email === currentUser.email)),
      ),
      {
        name: currentUser.full_name || `${currentUser.first_name} ${currentUser.last_name}`,
        email: currentUser.email,
        role: 'signer',
        routingOrder: maxOrd + 1,
        userId: currentUser._id,
        status: 'created',
      },
    ]
  }
  return recipients.filter(
    (r) => !(r.role === 'signer' && (r.userId === currentUser?._id || r.email === currentUser?.email)),
  )
}
