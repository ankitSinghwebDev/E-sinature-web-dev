const mongoose = require('mongoose')

/**
 * Reusable envelope design: documents + role-placeholder recipients +
 * tabs + email body. Instantiated into a draft envelope at use time.
 */

const templateRecipientSchema = new mongoose.Schema(
  {
    // Role placeholder at template time — name/email filled in on instantiate.
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    role: {
      type: String,
      enum: ['signer', 'cc', 'in_person_signer', 'editor', 'agent'],
      default: 'signer',
    },
    routingOrder: { type: Number, default: 1 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true },
)

const templateOptionSchema = new mongoose.Schema(
  { option_id: { type: String, required: true }, label: { type: String, default: '' } },
  { _id: false },
)

const templateTabSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'signHere', 'initialHere', 'dateSigned', 'fullName', 'email',
        'company', 'title', 'text', 'checkbox', 'radioGroup', 'dropdown',
        'approve', 'decline', 'date', 'phone', 'number', 'url', 'image',
      ],
      required: true,
    },
    recipientIndex: { type: Number, required: true },
    label: { type: String, default: '' },
    required: { type: Boolean, default: true },
    pageNumber: { type: Number, default: 1 },
    xPosition: { type: Number, default: 0 },
    yPosition: { type: Number, default: 0 },
    width: { type: Number, default: 150 },
    height: { type: Number, default: 30 },
    anchorString: { type: String, default: '' },
    anchorXOffset: { type: Number, default: 0 },
    anchorYOffset: { type: Number, default: 0 },
    placementMode: { type: String, enum: ['coordinate', 'anchor'], default: 'coordinate' },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
    locked: { type: Boolean, default: false },
    options: [templateOptionSchema],
    _autoInitial: { type: Boolean, default: false },
  },
  { _id: true },
)

const docuSignTemplateSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Lowercased slug — 'nda', 'deal_memo', 'crew_onboarding', etc.
    category: { type: String, default: 'other', index: true },

    document: {
      source: { type: String, enum: ['upload', 'generated'], default: 'upload' },
      fileName: { type: String, default: '' },
      fileUrl: { type: String, default: '' },
      bucket: { type: String, default: '' },
      region: { type: String, default: '' },
      thumbnail: { type: String, default: '' },
      fileSize: { type: Number, default: 0 },
      mimeType: { type: String, default: 'application/pdf' },
      pageCount: { type: Number, default: 0 },
    },

    recipients: [templateRecipientSchema],
    tabs: [templateTabSchema],

    settings: {
      enableReminders: { type: Boolean, default: true },
      reminderDelayDays: { type: Number, default: 1 },
      reminderFrequencyDays: { type: Number, default: 2 },
      expirationDays: { type: Number, default: 30 },
      allowReassign: { type: Boolean, default: false },
      emailSubject: { type: String, default: '' },
      emailBody: { type: String, default: '' },
      initialsOnAllPages: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('DocuSignTemplate', docuSignTemplateSchema)
