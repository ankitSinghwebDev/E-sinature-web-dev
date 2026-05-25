const UserSignature = require('../models/UserSignature')

const MAX_PER_TYPE = 3

/**
 * GET /api/docusign/saved-signatures
 * List all saved signatures & initials for the current user.
 */
exports.getSavedSignatures = async (req, res, next) => {
  try {
    const signatures = await UserSignature.find({ userId: req.user._id }).sort({
      createdAt: -1,
    })
    res.json({ status: 1, data: signatures })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/docusign/saved-signatures
 * Save a new signature or initial (max 3 per type).
 */
exports.createSavedSignature = async (req, res, next) => {
  try {
    const { type, dataUrl, label } = req.body

    if (!type || !dataUrl) {
      return res.status(400).json({ message: 'type and dataUrl are required' })
    }
    if (!['signature', 'initial'].includes(type)) {
      return res
        .status(400)
        .json({ message: 'type must be "signature" or "initial"' })
    }

    const count = await UserSignature.countDocuments({
      userId: req.user._id,
      type,
    })
    if (count >= MAX_PER_TYPE) {
      return res.status(400).json({
        message: `You can save up to ${MAX_PER_TYPE} ${type === 'signature' ? 'signatures' : 'initials'}. Please delete one first.`,
      })
    }

    const sig = await UserSignature.create({
      userId: req.user._id,
      type,
      dataUrl,
      label:
        label ||
        `${type === 'signature' ? 'Signature' : 'Initial'} ${count + 1}`,
    })

    res.status(201).json({ status: 1, data: sig })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/docusign/saved-signatures/:id
 * Delete a saved signature or initial.
 */
exports.deleteSavedSignature = async (req, res, next) => {
  try {
    const sig = await UserSignature.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!sig) {
      return res.status(404).json({ message: 'Signature not found' })
    }

    await UserSignature.findByIdAndDelete(req.params.id)
    res.json({ status: 1, message: 'Signature deleted' })
  } catch (err) {
    next(err)
  }
}
