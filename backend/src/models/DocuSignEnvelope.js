const mongoose = require('mongoose')

/**
 * Represents a single recipient (signer) within an envelope.
 */
const recipientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: {
      type: String,
      enum: ['signer', 'cc', 'in_person_signer', 'editor', 'agent'],
      default: 'signer',
    },
    routingOrder: { type: Number, default: 1 },
    // Internal user reference (null for external recipients)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // DocuSign-assigned recipientId after envelope creation
    dsRecipientId: { type: String, default: '' },
    // Per-recipient status
    status: {
      type: String,
      enum: ['created', 'sent', 'delivered', 'signed', 'completed', 'declined', 'authentication_failed'],
      default: 'created',
    },
    signedAt: { type: Date, default: null },
    viewedAt: { type: Date, default: null },
    declinedReason: { type: String, default: '' },
  },
  { _id: true },
)

/**
 * Represents a field/tab placed on the document for a specific recipient.
 * Supports both anchor-based and coordinate-based placement.
 */
const tabSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'signHere',
        'initialHere',
        'dateSigned',
        'fullName',
        'email',
        'company',
        'title',
        'text',
        'checkbox',
        'radioGroup',
        'dropdown',
        'approve',
        'decline',
      ],
      required: true,
    },
    // Which recipient this tab belongs to (index into recipients array)
    recipientIndex: { type: Number, required: true },
    // Label shown to the signer
    label: { type: String, default: '' },
    required: { type: Boolean, default: true },

    // ── Coordinate-based placement (drag-and-drop) ──
    pageNumber: { type: Number, default: 1 },
    xPosition: { type: Number, default: 0 },
    yPosition: { type: Number, default: 0 },
    width: { type: Number, default: 150 },
    height: { type: Number, default: 30 },

    // ── Anchor-based placement (template markers) ──
    anchorString: { type: String, default: '' },
    anchorXOffset: { type: Number, default: 0 },
    anchorYOffset: { type: Number, default: 0 },
    anchorUnits: { type: String, default: 'pixels' },

    // Placement mode
    placementMode: {
      type: String,
      enum: ['coordinate', 'anchor'],
      default: 'coordinate',
    },

    // For text/dropdown fields
    value: { type: String, default: '' },
    options: [{ type: String }], // dropdown options

    // Auto-generated initial (from "Initials on all pages" feature)
    _autoInitial: { type: Boolean, default: false },

    // DocuSign-assigned tabId
    dsTabId: { type: String, default: '' },
  },
  { _id: true },
)

/**
 * Main envelope schema — tracks the full lifecycle of a DocuSign signing request.
 */
const docuSignEnvelopeSchema = new mongoose.Schema(
  {
    // Admin who created this envelope
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Envelope title (e.g., "Deal Memo - John Doe - Project X")
    title: { type: String, required: true },
    description: { type: String, default: '' },

    // ── Document ──
    document: {
      // Source: uploaded PDF or generated from deal memo
      source: {
        type: String,
        enum: ['upload', 'generated'],
        default: 'upload',
      },
      fileName: { type: String, default: '' },
      fileUrl: { type: String, default: '' },
      // S3 / storage metadata
      bucket: { type: String, default: '' },
      region: { type: String, default: '' },
      thumbnail: { type: String, default: '' },
      fileSize: { type: Number, default: 0 },
      mimeType: { type: String, default: 'application/pdf' },
      // Total pages (detected after upload)
      pageCount: { type: Number, default: 0 },
    },

    // ── Recipients ──
    recipients: [recipientSchema],

    // ── Tabs / Fields ──
    tabs: [tabSchema],

    // ── Template ──
    // If using a saved DocuSign template
    templateId: { type: String, default: '' },
    templateName: { type: String, default: '' },

    // ── Envelope lifecycle ──
    status: {
      type: String,
      enum: [
        'draft',       // Not yet sent
        'sent',        // Sent to recipients
        'delivered',   // Opened by at least one recipient
        'signed',      // All signers have signed (but not yet completed)
        'completed',   // Fully completed and finalized
        'declined',    // A signer declined
        'voided',      // Admin cancelled/voided
        'expired',     // Envelope expired
      ],
      default: 'draft',
      index: true,
    },

    // DocuSign envelope ID (assigned after creation on DocuSign side)
    dsEnvelopeId: { type: String, default: '', index: true },

    // ── Dates ──
    sentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    voidedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    voidReason: { type: String, default: '' },

    // ── Signed document ──
    signedDocument: {
      fileUrl: { type: String, default: '' },
      bucket: { type: String, default: '' },
      region: { type: String, default: '' },
      downloadedAt: { type: Date, default: null },
    },

    // ── Audit trail ──
    auditTrail: [
      {
        action: { type: String, required: true },
        actor: { type: String, default: '' },
        actorEmail: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now },
        details: { type: String, default: '' },
        ipAddress: { type: String, default: '' },
      },
    ],

    // ── Settings ──
    settings: {
      // Reminder config
      enableReminders: { type: Boolean, default: true },
      reminderDelayDays: { type: Number, default: 1 },
      reminderFrequencyDays: { type: Number, default: 2 },
      // Expiration
      expirationDays: { type: Number, default: 30 },
      // Allow recipients to reassign
      allowReassign: { type: Boolean, default: false },
      // Email subject/body customization
      emailSubject: { type: String, default: '' },
      emailBody: { type: String, default: '' },
      // "Initials on all pages" — sign once, apply to all
      initialsOnAllPages: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  },
)

// Virtual: check if all recipients have signed
docuSignEnvelopeSchema.virtual('allSigned').get(function () {
  const signers = this.recipients.filter((r) => r.role === 'signer' || r.role === 'in_person_signer')
  return signers.length > 0 && signers.every((r) => r.status === 'signed' || r.status === 'completed')
})

// Ensure virtuals are included in JSON
docuSignEnvelopeSchema.set('toJSON', { virtuals: true })
docuSignEnvelopeSchema.set('toObject', { virtuals: true })

module.exports = mongoose.model('DocuSignEnvelope', docuSignEnvelopeSchema)
