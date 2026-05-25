const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const profilePictureSchema = new mongoose.Schema(
  {
    media: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    bucket: { type: String, default: '' },
    region: { type: String, default: '' },
  },
  { _id: false },
)

const userSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      unique: true,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    profile_picture: {
      type: profilePictureSchema,
      default: null,
    },
    device_id: {
      type: String,
      default: '',
    },
    project_id: {
      type: String,
      default: '',
    },
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    full_name: {
      type: String,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
    },
    country_code: {
      type: String,
      default: '',
    },
    join_code: {
      type: String,
      default: '',
    },
    // Department info
    department_id: {
      type: String,
      default: '',
    },
    department_name: {
      type: String,
      default: '',
    },
    department_identifier: {
      type: String,
      default: '',
    },
    // Designation info
    designation_id: {
      type: String,
      default: '',
    },
    designation_name: {
      type: String,
      default: '',
    },
    designation_identifier: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'accepted', 'pending', 'rejected', 'inactive', 'left', 'removed'],
      default: 'accepted',
    },
    // Join unit info
    join_unit_id: {
      type: String,
      default: '',
    },
    join_unit_name: {
      type: String,
      default: '',
    },
    join_unit_identifier: {
      type: String,
      default: '',
    },
    // Contract & document flags
    signing_required: {
      type: Boolean,
      default: false,
    },
    contract_signed: {
      type: Boolean,
      default: false,
    },
    dashboard_creater: {
      type: Boolean,
      default: false,
    },
    dashboard_user: {
      type: Boolean,
      default: false,
    },
    dashboard_forwarding: {
      type: Boolean,
      default: false,
    },
    joining_contract_id: {
      type: String,
      default: null,
    },
    contract_type: {
      type: String,
      default: 'contract',
    },
    nda_sign: {
      type: Boolean,
      default: false,
    },
    other_document: {
      type: Boolean,
      default: false,
    },
    other_document_sender: {
      type: String,
      default: null,
    },
    other_document_sign: {
      type: Boolean,
      default: false,
    },
    // Sender confirmation flags
    contract_signed_sender: {
      type: Boolean,
      default: false,
    },
    nda_signed_sender: {
      type: Boolean,
      default: false,
    },
    document_signed_sender: {
      type: Boolean,
      default: false,
    },
    // Reference IDs
    nda_id: {
      type: String,
      default: null,
    },
    other_document_id: {
      type: String,
      default: null,
    },
    // Internal fields
    isExternal: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
  },
  {
    timestamps: true,
  },
)

// Auto-generate full_name before saving
userSchema.pre('save', async function (next) {
  this.full_name = `${this.first_name} ${this.last_name}`
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12)
  }
  next()
})

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const user = this.toObject()
  delete user.password
  return user
}

module.exports = mongoose.model('User', userSchema)
