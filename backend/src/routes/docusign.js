const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/docusignController')
const savedSigCtrl = require('../controllers/savedSignatureController')
const auth = require('../middleware/auth')

// Envelope CRUD
router.post('/envelopes', auth, ctrl.createEnvelope)
router.get('/envelopes', auth, ctrl.getEnvelopes)
router.get('/envelopes/:id', auth, ctrl.getEnvelope)
router.put('/envelopes/:id', auth, ctrl.updateEnvelope)
router.delete('/envelopes/:id', auth, ctrl.deleteEnvelope)

// Envelope actions
router.post('/envelopes/:id/send', auth, ctrl.sendEnvelope)
router.post('/envelopes/:id/resend', auth, ctrl.resendEnvelope)
router.post('/envelopes/:id/void', auth, ctrl.voidEnvelope)

// Signing
router.post('/envelopes/:id/signing-url', auth, ctrl.getSigningUrl)
router.patch('/envelopes/:id/recipient-status', auth, ctrl.updateRecipientStatus)

// Documents & audit
router.post('/envelopes/:id/download', auth, ctrl.downloadSignedDocument)
router.get('/envelopes/:id/audit-trail', auth, ctrl.getAuditTrail)

// Admin sync
router.post('/sync-status', auth, ctrl.syncStatuses)

// Saved signatures & initials
router.get('/saved-signatures', auth, savedSigCtrl.getSavedSignatures)
router.post('/saved-signatures', auth, savedSigCtrl.createSavedSignature)
router.delete('/saved-signatures/:id', auth, savedSigCtrl.deleteSavedSignature)

module.exports = router
