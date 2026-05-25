/**
 * DocuSign Module — Self-contained eSignature module.
 *
 * Integration guide:
 * 1. Copy this entire DocuSign/ folder into your project
 * 2. Copy backend files: backend/src/models/DocuSignEnvelope.js,
 *    backend/src/services/docusignService.js,
 *    backend/src/controllers/docusignController.js,
 *    backend/src/routes/docusign.js
 * 3. Register the route in your backend: app.use('/api/docusign', docusignRoutes)
 * 4. Add the Redux slice from store.js (search for "DocuSign Thunks" and "DocuSign Slice")
 * 5. Add <DocuSignPanel /> wherever you want the admin envelope manager
 * 6. Add <SigningView /> route for receiver signing: /docusign/sign/:id
 * 7. Update api.js import path to point to your axios client
 */

export { default as DocuSignPanel } from './DocuSignPanel'
export { default as SigningView } from './SigningView'
export { default as DocumentFieldPlacer } from './DocumentFieldPlacer'
export { default as EnvelopeStatusTracker } from './EnvelopeStatusTracker'
export * as docusignApi from './api'
export { loadPdfAsImage, DOCUMENT_PDF_URL, DUMMY_RECEIVED_ENVELOPES } from './dummyData'
