const mongoose = require('mongoose')

/**
 * Tracks a bulk-send job: one envelope per CSV row. Status, per-row
 * outcomes, and overall progress live here so the dashboard can poll a
 * single document to render the bulk send's full state.
 */

const bulkEnvelopeEntrySchema = new mongoose.Schema(
  {
    row_index: { type: Number, required: true },
    row: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    error: { type: String, default: '' },
    envelope_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocuSignEnvelope',
      default: null,
    },
  },
  { _id: false },
)

const docuSignBulkJobSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    template_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocuSignTemplate',
      required: true,
      index: true,
    },
    // Denormalized so the dashboard doesn't need to join.
    template_name: { type: String, default: '' },

    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },

    total_rows: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    succeeded: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },

    // Whether each created envelope was auto-sent or left as draft.
    send_immediately: { type: Boolean, default: true },

    envelopes: [bulkEnvelopeEntrySchema],
  },
  { timestamps: true },
)

module.exports = mongoose.model('DocuSignBulkJob', docuSignBulkJobSchema)
