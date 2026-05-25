/**
 * Envelope wire-shape normalizer.
 *
 * Backend has settled on snake_case for envelope/recipient/tab fields,
 * while many FE call sites still read the camelCase form (userId,
 * signedAt, createdBy, etc.). Rather than refactor every read, normalize
 * on the way in: inject camelCase aliases onto each envelope as it lands
 * in the slice. The aliases are idempotent — re-running this is safe.
 *
 * Pair with `normalizeEnvelopeWritePayload` on the way out so create/
 * update payloads emit the snake_case wire shape the backend expects.
 */

// Recipient-level alias map: snake_case → camelCase the FE reads.
const RECIPIENT_ALIASES = [
  ['user_id', 'userId'],
  ['recipient_id', 'recipientId'],
  ['is_external', 'isExternal'],
  ['routing_order', 'routingOrder'],
  ['declined_reason', 'declinedReason'],
  ['signed_on', 'signedAt'],
  ['viewed_on', 'viewedAt'],
  ['accepted_terms_on', 'acceptedTermsOn'],
]

// Tab-level alias map.
const TAB_ALIASES = [
  ['placement_mode', 'placementMode'],
  ['anchor_string', 'anchorString'],
  ['auto_initial', '_autoInitial'],
  ['page', 'pageNumber'],
  ['x', 'xPosition'],
  ['y', 'yPosition'],
  ['signed_on', 'signedAt'],
  ['document_index', 'documentIndex'],
  ['default_value', 'defaultValue'],
  ['option_id', 'optionId'],
]

// Envelope-level alias map.
const ENVELOPE_ALIASES = [
  ['created_by', 'createdBy'],
  ['created', 'createdAt'],
  ['updated', 'updatedAt'],
  ['sent_on', 'sentAt'],
  ['completed_on', 'completedAt'],
  ['expires_on', 'expiresAt'],
  ['signed_document', 'signedDocument'],
  ['template_id', 'templateId'],
  ['bulk_job_id', 'bulkJobId'],
  ['completion_format', 'completionFormat'],
]

const aliasFields = (obj, pairs) => {
  if (!obj || typeof obj !== 'object') return obj
  for (const [snake, camel] of pairs) {
    if (obj[camel] === undefined && obj[snake] !== undefined) {
      obj[camel] = obj[snake]
    }
  }
  return obj
}

/**
 * Mutate an envelope-shaped object in place: inject camelCase aliases on
 * the envelope itself, every recipient, every tab. Idempotent.
 * Returns the same reference so it can be chained.
 */
export const normalizeEnvelopeShape = (env) => {
  if (!env || typeof env !== 'object') return env
  aliasFields(env, ENVELOPE_ALIASES)

  // Multi-document back-compat. Make BOTH `attachment` and `documents`
  // present after this call so callers can read either shape:
  //   • Legacy single-doc (only env.attachment)  → synth env.documents = [attachment]
  //   • New multi-doc (only env.documents)       → synth env.attachment = documents[0]
  //   • Both present                              → leave as-is
  const hasDocs = Array.isArray(env.documents) && env.documents.length > 0
  const hasAttach = env.attachment && typeof env.attachment === 'object'
  if (hasDocs && !hasAttach) {
    env.attachment = env.documents[0]
  } else if (hasAttach && !hasDocs) {
    env.documents = [{
      ...env.attachment,
      document_index: env.attachment.document_index ?? 0,
      order: env.attachment.order ?? 0,
    }]
  }

  // Top-level `initials_on_all_pages` + `reminder_cadence_days` mirror
  // into `settings.*` so the camelCase reads on settings keep working.
  if (env.initials_on_all_pages !== undefined) {
    env.settings = env.settings || {}
    if (env.settings.initialsOnAllPages === undefined) {
      env.settings.initialsOnAllPages = env.initials_on_all_pages
    }
  }
  if (env.reminder_cadence_days !== undefined) {
    env.settings = env.settings || {}
    if (env.settings.reminderCadenceDays === undefined) {
      env.settings.reminderCadenceDays = env.reminder_cadence_days
    }
    if (env.settings.reminderFrequencyDays === undefined) {
      env.settings.reminderFrequencyDays = env.reminder_cadence_days
    }
  }

  // Settings snake → camel mirror (no clobber).
  if (env.settings && typeof env.settings === 'object') {
    const s = env.settings
    if (s.email_subject !== undefined && s.emailSubject === undefined) s.emailSubject = s.email_subject
    if (s.email_body !== undefined && s.emailBody === undefined) s.emailBody = s.email_body
    if (s.enable_reminders !== undefined && s.enableReminders === undefined) s.enableReminders = s.enable_reminders
    if (s.reminder_delay_days !== undefined && s.reminderDelayDays === undefined) s.reminderDelayDays = s.reminder_delay_days
    if (s.expiration_days !== undefined && s.expirationDays === undefined) s.expirationDays = s.expiration_days
    if (s.allow_reassign !== undefined && s.allowReassign === undefined) s.allowReassign = s.allow_reassign
    if (s.placement_mode !== undefined && s.placementMode === undefined) s.placementMode = s.placement_mode
  }

  if (Array.isArray(env.recipients)) {
    env.recipients.forEach((r) => aliasFields(r, RECIPIENT_ALIASES))
  }

  if (Array.isArray(env.tabs)) {
    const recipientIdx = new Map()
    if (Array.isArray(env.recipients)) {
      env.recipients.forEach((r, idx) => {
        if (r?._id) recipientIdx.set(r._id, idx)
        if (r?.recipient_id) recipientIdx.set(r.recipient_id, idx)
      })
    }
    env.tabs.forEach((t) => {
      aliasFields(t, TAB_ALIASES)
      if (t.recipientIndex === undefined) {
        const ownerId = t.recipient_id
        const idx = ownerId !== undefined ? recipientIdx.get(ownerId) : undefined
        t.recipientIndex = idx !== undefined ? idx : 0
      }
      if (t.document_index === undefined && t.documentIndex === undefined) {
        t.document_index = 0
        t.documentIndex = 0
      }
    })
  }
  return env
}

/**
 * Per-tab serializer — camelCase FE shape → snake_case wire shape.
 * Unknown fields pass through untouched.
 */
const toWireTab = (t) => {
  if (!t || typeof t !== 'object') return t
  const out = { ...t }
  if (out.recipientIndex !== undefined) {
    out.recipient_index = out.recipient_index ?? out.recipientIndex
    delete out.recipientIndex
  }
  if (out.pageNumber !== undefined) {
    out.page = out.page ?? out.pageNumber
    delete out.pageNumber
  }
  if (out.xPosition !== undefined) {
    out.x = out.x ?? out.xPosition
    delete out.xPosition
  }
  if (out.yPosition !== undefined) {
    out.y = out.y ?? out.yPosition
    delete out.yPosition
  }
  if (out.placementMode !== undefined) {
    out.placement_mode = out.placement_mode ?? out.placementMode
    delete out.placementMode
  }
  if (out.anchorString !== undefined) {
    out.anchor_string = out.anchor_string ?? out.anchorString
    delete out.anchorString
  }
  if (out._autoInitial !== undefined) {
    out.auto_initial = out.auto_initial ?? !!out._autoInitial
    delete out._autoInitial
  }
  if (out.documentIndex !== undefined) {
    out.document_index = out.document_index ?? out.documentIndex
    delete out.documentIndex
  }
  if (out.defaultValue !== undefined) {
    out.default_value = out.default_value ?? out.defaultValue
    delete out.defaultValue
  }
  if (out.optionId !== undefined) {
    out.option_id = out.option_id ?? out.optionId
    delete out.optionId
  }
  if (Array.isArray(out.options)) {
    out.options = out.options.map((o) => {
      if (!o || typeof o !== 'object') return o
      const opt = { ...o }
      if (opt.optionId !== undefined) {
        opt.option_id = opt.option_id ?? opt.optionId
        delete opt.optionId
      }
      return opt
    })
  }
  return out
}

/**
 * Per-recipient serializer — strip read-side aliases and normalize
 * camelCase fields to snake_case for the wire.
 */
const toWireRecipient = (r) => {
  if (!r || typeof r !== 'object') return r
  const out = { ...r }
  if (out.userId !== undefined) {
    out.user_id = out.user_id ?? out.userId
    delete out.userId
  }
  if (out.isExternal !== undefined) {
    out.is_external = out.is_external ?? out.isExternal
    delete out.isExternal
  }
  if (out.routingOrder !== undefined) {
    out.routing_order = out.routing_order ?? out.routingOrder
    delete out.routingOrder
  }
  if (out.declinedReason !== undefined) {
    out.declined_reason = out.declined_reason ?? out.declinedReason
    delete out.declinedReason
  }
  delete out.signedAt
  delete out.viewedAt
  delete out.acceptedTermsOn
  delete out.recipientId
  return out
}

/**
 * Reshape a create/update envelope payload from the FE's loose shape
 * (sendNow, pageCount, settings.initialsOnAllPages, etc.) into the wire
 * shape the backend expects. Pure function — returns a new object.
 *
 * Wire renames:
 *   sendNow                          → send_now
 *   pageCount (top-level)            → attachment.page_count
 *   settings.initialsOnAllPages      → top-level initials_on_all_pages
 *   settings.reminderFrequencyDays   → top-level reminder_cadence_days
 *   tabs[]                           → snake_case (see toWireTab)
 *   recipients[]                     → snake_case (see toWireRecipient)
 */
export const normalizeEnvelopeWritePayload = (body) => {
  if (!body || typeof body !== 'object') return body

  const {
    sendNow, send_now,
    pageCount, page_count,
    attachment,
    documents,
    completion_format, completionFormat,
    settings,
    tabs,
    recipients,
    ...rest
  } = body

  const out = { ...rest }

  if (send_now !== undefined) out.send_now = send_now
  else if (sendNow !== undefined) out.send_now = sendNow

  // Multi-doc write path. Only envelopes that genuinely have >1 documents
  // migrate to the new wire shape — single-doc envelopes stay on `attachment`.
  const isMultiDoc = Array.isArray(documents) && documents.length > 1
  if (isMultiDoc) {
    out.documents = documents.map((d, i) => ({
      ...d,
      document_index: d.document_index ?? d.documentIndex ?? i,
      order: d.order ?? i,
    }))
  } else if (attachment && typeof attachment === 'object') {
    const inferredPageCount =
      attachment.page_count !== undefined ? attachment.page_count
        : page_count !== undefined ? page_count
          : pageCount !== undefined ? pageCount
            : undefined
    out.attachment = inferredPageCount !== undefined
      ? { ...attachment, page_count: inferredPageCount }
      : attachment
  } else if (Array.isArray(documents) && documents.length === 1) {
    out.attachment = documents[0]
  } else if (attachment !== undefined) {
    out.attachment = attachment
  }

  const cf = completion_format ?? completionFormat
  if (cf !== undefined && isMultiDoc) {
    out.completion_format = cf
  }

  if (settings && typeof settings === 'object') {
    const {
      initialsOnAllPages, reminderFrequencyDays,
      emailSubject, emailBody, enableReminders, reminderDelayDays,
      expirationDays, allowReassign, placementMode,
      ...settingsRest
    } = settings
    if (initialsOnAllPages !== undefined) {
      out.initials_on_all_pages = initialsOnAllPages
    }
    if (reminderFrequencyDays !== undefined) {
      out.reminder_cadence_days = reminderFrequencyDays
    }
    const wireSettings = { ...settingsRest }
    if (emailSubject !== undefined) wireSettings.email_subject = emailSubject
    if (emailBody !== undefined) wireSettings.email_body = emailBody
    if (enableReminders !== undefined) wireSettings.enable_reminders = enableReminders
    if (reminderDelayDays !== undefined) wireSettings.reminder_delay_days = reminderDelayDays
    if (expirationDays !== undefined) wireSettings.expiration_days = expirationDays
    if (allowReassign !== undefined) wireSettings.allow_reassign = allowReassign
    if (placementMode !== undefined) wireSettings.placement_mode = placementMode
    out.settings = wireSettings
  }

  if (Array.isArray(tabs)) out.tabs = tabs.map(toWireTab)
  if (Array.isArray(recipients)) out.recipients = recipients.map(toWireRecipient)

  return out
}

/**
 * Normalize a list of envelopes. Tolerant of bare arrays and the
 * `{ items, total, page, limit }` paginator wrapper.
 */
export const normalizeEnvelopeList = (list) => {
  if (!list) return list
  if (Array.isArray(list)) {
    list.forEach((e) => normalizeEnvelopeShape(e))
    return list
  }
  if (Array.isArray(list?.items)) {
    list.items.forEach((e) => normalizeEnvelopeShape(e))
  }
  return list
}
