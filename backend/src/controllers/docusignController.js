const DocuSignEnvelope = require('../models/DocuSignEnvelope')
const docusignService = require('../services/docusignService')

/**
 * POST /api/docusign/envelopes
 * Create a new envelope (draft or send immediately).
 */
exports.createEnvelope = async (req, res, next) => {
  try {
    const {
      title,
      description,
      document,
      recipients,
      tabs,
      templateId,
      templateName,
      settings,
      sendNow,
    } = req.body

    if (!title) {
      return res.status(400).json({ message: 'Envelope title is required' })
    }
    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ message: 'At least one recipient is required' })
    }

    const envelope = await DocuSignEnvelope.create({
      createdBy: req.user._id,
      title,
      description: description || '',
      document: document || {},
      recipients,
      tabs: tabs || [],
      templateId: templateId || '',
      templateName: templateName || '',
      settings: settings || {},
      status: 'draft',
      auditTrail: [
        {
          action: 'created',
          actor: req.user.full_name || `${req.user.first_name} ${req.user.last_name}`,
          actorEmail: req.user.email,
          details: 'Envelope created',
        },
      ],
    })

    // If sendNow and we have DocuSign credentials configured, create on DocuSign and send
    if (sendNow && process.env.DOCUSIGN_INTEGRATION_KEY) {
      try {
        const result = await docusignService.createEnvelope({
          documentBase64: req.body.documentBase64 || '',
          documentName: document?.fileName || 'Document.pdf',
          recipients,
          tabs: tabs || [],
          emailSubject: settings?.emailSubject || `Please sign: ${title}`,
          emailBody: settings?.emailBody || '',
          status: 'sent',
        })

        envelope.dsEnvelopeId = result.envelopeId
        envelope.status = 'sent'
        envelope.sentAt = new Date()
        envelope.auditTrail.push({
          action: 'sent',
          actor: req.user.full_name || `${req.user.first_name} ${req.user.last_name}`,
          actorEmail: req.user.email,
          details: `Sent via DocuSign (${result.envelopeId})`,
        })
        await envelope.save()
      } catch (dsErr) {
        console.error('[DocuSign] Create+send failed:', dsErr.message)
        // Envelope is saved as draft; return with a warning
        const populated = await DocuSignEnvelope.findById(envelope._id)
          .populate('createdBy', 'first_name last_name email')
            return res.status(201).json({
          status: 1,
          message: 'Envelope saved as draft (DocuSign send failed)',
          warning: dsErr.message,
          data: populated,
        })
      }
    }

    // Local mode: if sendNow but no DocuSign credentials, still mark as sent
    if (sendNow && envelope.status === 'draft') {
      envelope.status = 'sent'
      envelope.sentAt = new Date()
      envelope.auditTrail.push({
        action: 'sent',
        actor: req.user.full_name || `${req.user.first_name} ${req.user.last_name}`,
        actorEmail: req.user.email,
        details: 'Envelope sent to recipients',
      })
      await envelope.save()
    }

    const populated = await DocuSignEnvelope.findById(envelope._id)
      .populate('createdBy', 'first_name last_name email')

    res.status(201).json({
      status: 1,
      message: sendNow ? 'Envelope created and sent' : 'Envelope saved as draft',
      data: populated,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/docusign/envelopes
 * List envelopes. Supports ?status=draft,sent
 */
exports.getEnvelopes = async (req, res, next) => {
  try {
    const filter = {}

    // Non-admin users only see envelopes where they are a recipient
    if (req.user.role !== 'admin') {
      filter['recipients.userId'] = req.user._id
    }

    if (req.query.status) {
      filter.status = { $in: req.query.status.split(',') }
    }

    const envelopes = await DocuSignEnvelope.find(filter)
      .populate('createdBy', 'first_name last_name email')
      .sort({ updatedAt: -1 })

    res.json({ status: 1, data: envelopes })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/docusign/envelopes/:id
 * Get a single envelope with full details.
 */
exports.getEnvelope = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
      .populate('createdBy', 'first_name last_name email')

    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }

    res.json({ status: 1, data: envelope })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/docusign/envelopes/:id
 * Update envelope (while still in draft).
 */
exports.updateEnvelope = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }
    if (envelope.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft envelopes can be edited' })
    }

    const allowedFields = [
      'title', 'description', 'document', 'recipients', 'tabs',
      'templateId', 'templateName', 'settings',
    ]
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        envelope[field] = req.body[field]
      }
    }

    envelope.auditTrail.push({
      action: 'updated',
      actor: req.user.full_name || `${req.user.first_name} ${req.user.last_name}`,
      actorEmail: req.user.email,
      details: 'Envelope updated',
    })

    await envelope.save()

    const populated = await DocuSignEnvelope.findById(envelope._id)
      .populate('createdBy', 'first_name last_name email')

    res.json({ status: 1, message: 'Envelope updated', data: populated })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/docusign/envelopes/:id/send
 * Send a draft envelope.
 */
exports.sendEnvelope = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }
    // Allow sending from draft or if some recipients already signed (counter-sign flow)
    if (!['draft', 'sent', 'delivered'].includes(envelope.status)) {
      return res.status(400).json({ message: `Cannot send envelope in ${envelope.status} status` })
    }

    // If DocuSign is configured, create and send on DocuSign
    if (process.env.DOCUSIGN_INTEGRATION_KEY && req.body.documentBase64) {
      const result = await docusignService.createEnvelope({
        documentBase64: req.body.documentBase64,
        documentName: envelope.document?.fileName || 'Document.pdf',
        recipients: envelope.recipients,
        tabs: envelope.tabs,
        emailSubject: envelope.settings?.emailSubject || `Please sign: ${envelope.title}`,
        emailBody: envelope.settings?.emailBody || '',
        status: 'sent',
      })
      envelope.dsEnvelopeId = result.envelopeId
    }

    envelope.status = 'sent'
    envelope.sentAt = new Date()
    envelope.auditTrail.push({
      action: 'sent',
      actor: req.user.full_name || `${req.user.first_name} ${req.user.last_name}`,
      actorEmail: req.user.email,
      details: 'Envelope sent to recipients',
    })

    await envelope.save()

    const populated = await DocuSignEnvelope.findById(envelope._id)
      .populate('createdBy', 'first_name last_name email')

    res.json({ status: 1, message: 'Envelope sent', data: populated })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/docusign/envelopes/:id/resend
 * Resend notifications to recipients.
 */
exports.resendEnvelope = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }
    if (envelope.status === 'draft' || envelope.status === 'completed' || envelope.status === 'voided') {
      return res.status(400).json({ message: `Cannot resend envelope in ${envelope.status} status` })
    }

    if (envelope.dsEnvelopeId) {
      await docusignService.resendEnvelope(envelope.dsEnvelopeId)
    }

    envelope.auditTrail.push({
      action: 'resent',
      actor: req.user.full_name || `${req.user.first_name} ${req.user.last_name}`,
      actorEmail: req.user.email,
      details: 'Envelope resent to recipients',
    })
    await envelope.save()

    res.json({ status: 1, message: 'Envelope resent' })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/docusign/envelopes/:id/void
 * Void/cancel an envelope.
 */
exports.voidEnvelope = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }
    if (envelope.status === 'completed' || envelope.status === 'voided') {
      return res.status(400).json({ message: `Cannot void envelope in ${envelope.status} status` })
    }

    const reason = req.body.reason || 'Voided by admin'

    if (envelope.dsEnvelopeId) {
      await docusignService.voidEnvelope(envelope.dsEnvelopeId, reason)
    }

    envelope.status = 'voided'
    envelope.voidedAt = new Date()
    envelope.voidReason = reason
    envelope.auditTrail.push({
      action: 'voided',
      actor: req.user.full_name || `${req.user.first_name} ${req.user.last_name}`,
      actorEmail: req.user.email,
      details: `Voided: ${reason}`,
    })
    await envelope.save()

    res.json({ status: 1, message: 'Envelope voided' })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/docusign/envelopes/:id/signing-url
 * Generate an embedded signing URL for a recipient.
 */
exports.getSigningUrl = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }

    const { recipientEmail, returnUrl } = req.body
    if (!recipientEmail) {
      return res.status(400).json({ message: 'recipientEmail is required' })
    }

    const recipient = envelope.recipients.find((r) => r.email === recipientEmail)
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found in this envelope' })
    }

    // If DocuSign integration is live, get real signing URL
    if (envelope.dsEnvelopeId) {
      const { url } = await docusignService.createRecipientView(
        envelope.dsEnvelopeId,
        { name: recipient.name, email: recipient.email },
        returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:5175'}/settings/dealmemo/docusign/signing-complete`,
      )
      return res.json({ status: 1, data: { signingUrl: url } })
    }

    // For local/demo mode, return a local signing route
    res.json({
      status: 1,
      data: {
        signingUrl: `/settings/dealmemo/docusign/sign/${envelope._id}?recipient=${recipientEmail}`,
        mode: 'local',
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/docusign/envelopes/:id/recipient-status
 * Update a recipient's signing status (used by webhook or local signing flow).
 */
exports.updateRecipientStatus = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }

    const { recipientEmail, status, declinedReason, signedFields } = req.body
    const recipient = envelope.recipients.find((r) => r.email === recipientEmail)
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' })
    }

    recipient.status = status
    if (status === 'signed' || status === 'completed') {
      recipient.signedAt = new Date()

      // Save signed field values (signature images, initials, email, etc.)
      if (signedFields && Array.isArray(signedFields)) {
        for (const sf of signedFields) {
          const tab = envelope.tabs[sf.tabIndex]
          if (tab && sf.value) {
            tab.value = sf.value
          }
        }
      }
    }
    if (status === 'delivered') {
      recipient.viewedAt = new Date()
    }
    if (status === 'declined') {
      recipient.declinedReason = declinedReason || ''
      envelope.status = 'declined'
    }

    envelope.auditTrail.push({
      action: `recipient_${status}`,
      actor: recipient.name,
      actorEmail: recipient.email,
      details: `Recipient ${status}${declinedReason ? `: ${declinedReason}` : ''}`,
    })

    // Check if all signers have signed → mark envelope as signed/completed
    const signers = envelope.recipients.filter((r) => r.role === 'signer' || r.role === 'in_person_signer')
    const allSigned = signers.every((s) => s.status === 'signed' || s.status === 'completed')
    if (allSigned && signers.length > 0) {
      envelope.status = 'completed'
      envelope.completedAt = new Date()
      envelope.auditTrail.push({
        action: 'completed',
        actor: 'system',
        details: 'All recipients have signed. Envelope completed.',
      })
    }

    await envelope.save()

    const populated = await DocuSignEnvelope.findById(envelope._id)
      .populate('createdBy', 'first_name last_name email')

    res.json({ status: 1, message: 'Recipient status updated', data: populated })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/docusign/envelopes/:id/audit-trail
 * Get the audit trail for an envelope.
 */
exports.getAuditTrail = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id).select('auditTrail title')
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }

    // If DocuSign integration is live, merge with DocuSign audit events
    if (req.query.includeDocuSign === 'true' && envelope.dsEnvelopeId) {
      try {
        const dsAudit = await docusignService.getAuditEvents(envelope.dsEnvelopeId)
        return res.json({ status: 1, data: { local: envelope.auditTrail, docusign: dsAudit } })
      } catch { /* fall through to local only */ }
    }

    res.json({ status: 1, data: envelope.auditTrail })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/docusign/envelopes/:id
 * Delete a draft envelope.
 */
exports.deleteEnvelope = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }
    if (envelope.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft envelopes can be deleted' })
    }

    await DocuSignEnvelope.findByIdAndDelete(req.params.id)
    res.json({ status: 1, message: 'Envelope deleted' })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/docusign/envelopes/:id/download
 * Download the signed document (from DocuSign or local).
 */
exports.downloadSignedDocument = async (req, res, next) => {
  try {
    const envelope = await DocuSignEnvelope.findById(req.params.id)
    if (!envelope) {
      return res.status(404).json({ message: 'Envelope not found' })
    }

    if (envelope.dsEnvelopeId) {
      const pdfBuffer = await docusignService.downloadDocument(envelope.dsEnvelopeId, 'combined')
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${envelope.title}-signed.pdf"`)
      return res.send(pdfBuffer)
    }

    // If no DocuSign envelope, return the stored signed document URL
    if (envelope.signedDocument?.fileUrl) {
      return res.json({ status: 1, data: { fileUrl: envelope.signedDocument.fileUrl } })
    }

    res.status(404).json({ message: 'No signed document available' })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/docusign/sync-status
 * Sync envelope statuses from DocuSign (admin batch operation).
 */
exports.syncStatuses = async (req, res, next) => {
  try {
    const envelopes = await DocuSignEnvelope.find({
      dsEnvelopeId: { $ne: '' },
      status: { $in: ['sent', 'delivered', 'signed'] },
    })

    const results = { updated: 0, errors: 0 }

    for (const env of envelopes) {
      try {
        const dsStatus = await docusignService.getEnvelopeStatus(env.dsEnvelopeId)
        const recipientData = await docusignService.getRecipientStatus(env.dsEnvelopeId)

        // Update envelope status
        if (dsStatus.status !== env.status) {
          env.status = dsStatus.status
          if (dsStatus.status === 'completed') env.completedAt = new Date()
        }

        // Update recipient statuses
        if (recipientData.signers) {
          for (const dsSigner of recipientData.signers) {
            const localRecipient = env.recipients.find((r) => r.email === dsSigner.email)
            if (localRecipient && dsSigner.status !== localRecipient.status) {
              localRecipient.status = dsSigner.status
              if (dsSigner.signedDateTime) localRecipient.signedAt = new Date(dsSigner.signedDateTime)
              if (dsSigner.deliveredDateTime) localRecipient.viewedAt = new Date(dsSigner.deliveredDateTime)
            }
          }
        }

        await env.save()
        results.updated++
      } catch (err) {
        console.error(`[DocuSign Sync] Error for envelope ${env._id}:`, err.message)
        results.errors++
      }
    }

    res.json({ status: 1, message: 'Sync complete', data: results })
  } catch (err) {
    next(err)
  }
}
