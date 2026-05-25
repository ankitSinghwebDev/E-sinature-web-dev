const DocuSignTemplate = require('../models/DocuSignTemplate')

// GET /api/docusign/templates
exports.list = async (req, res, next) => {
  try {
    const items = await DocuSignTemplate.find({ createdBy: req.user._id })
      .sort({ updatedAt: -1 })
      .lean()
    res.json({ data: { items, total: items.length, page: 1, limit: items.length } })
  } catch (err) { next(err) }
}

// GET /api/docusign/templates/:id
exports.get = async (req, res, next) => {
  try {
    const tpl = await DocuSignTemplate.findOne({
      _id: req.params.id, createdBy: req.user._id,
    }).lean()
    if (!tpl) return res.status(404).json({ message: 'Template not found' })
    res.json({ data: tpl })
  } catch (err) { next(err) }
}

// POST /api/docusign/templates
// Body: { name, description?, category?, document, recipients, tabs, settings, from_envelope_id? }
exports.create = async (req, res, next) => {
  try {
    const { name, description, category, document, recipients, tabs, settings } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Template name is required' })
    }
    const tpl = await DocuSignTemplate.create({
      createdBy: req.user._id,
      name: name.trim(),
      description: description || '',
      category: category || 'other',
      document: document || {},
      recipients: (recipients || []).map((r) => ({
        // Strip recipient-specific identifiers when saving as template;
        // those get filled in at instantiate time.
        name: '',
        email: '',
        role: r.role || 'signer',
        routingOrder: r.routingOrder || 1,
        userId: null,
      })),
      tabs: tabs || [],
      settings: settings || {},
    })
    res.status(201).json({ data: tpl.toObject() })
  } catch (err) { next(err) }
}

// PUT /api/docusign/templates/:id
exports.update = async (req, res, next) => {
  try {
    const patch = { ...req.body }
    delete patch._id
    delete patch.createdBy
    delete patch.createdAt
    delete patch.updatedAt
    const tpl = await DocuSignTemplate.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean()
    if (!tpl) return res.status(404).json({ message: 'Template not found' })
    res.json({ data: tpl })
  } catch (err) { next(err) }
}

// DELETE /api/docusign/templates/:id
exports.remove = async (req, res, next) => {
  try {
    const r = await DocuSignTemplate.deleteOne({
      _id: req.params.id, createdBy: req.user._id,
    })
    if (r.deletedCount === 0) return res.status(404).json({ message: 'Template not found' })
    res.json({ data: { id: req.params.id } })
  } catch (err) { next(err) }
}

// POST /api/docusign/templates/:id/instantiate
// Body: { recipients: [{ name, email }], pre_fill_values?: { tab_id: value } }
// Returns a draft envelope-shaped payload — NOT persisted. Caller posts
// it via createEnvelope after review.
exports.instantiate = async (req, res, next) => {
  try {
    const tpl = await DocuSignTemplate.findOne({
      _id: req.params.id, createdBy: req.user._id,
    }).lean()
    if (!tpl) return res.status(404).json({ message: 'Template not found' })

    const { recipients = [], pre_fill_values = {} } = req.body
    const mergedRecipients = tpl.recipients.map((r, i) => {
      const supplied = recipients[i] || {}
      return {
        ...r,
        name: supplied.name || r.name || '',
        email: supplied.email || r.email || '',
        userId: supplied.userId || r.userId || null,
        status: 'created',
      }
    })

    // Pre-fill tab default values if caller supplied any (keyed by tab id).
    const tabs = (tpl.tabs || []).map((t) => {
      const v = pre_fill_values[t._id?.toString?.()]
      if (v === undefined) return t
      return { ...t, defaultValue: v }
    })

    res.json({
      data: {
        title: tpl.name,
        description: tpl.description,
        document: tpl.document,
        recipients: mergedRecipients,
        tabs,
        settings: tpl.settings,
        templateId: tpl._id,
        templateName: tpl.name,
        status: 'draft',
      },
    })
  } catch (err) { next(err) }
}
