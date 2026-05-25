const mongoose = require('mongoose')

const userSignatureSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['signature', 'initial'],
      required: true,
    },
    dataUrl: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: '',
    },
  },
  { timestamps: true },
)

userSignatureSchema.index({ userId: 1, type: 1 })

module.exports = mongoose.model('UserSignature', userSignatureSchema)
