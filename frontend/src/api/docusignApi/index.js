/**
 * DocuSign API barrel — single import surface mirroring
 * zillit_web/src/api/docusignApi. Components import HTTP helpers,
 * thunks, slice actions, and the observer from here.
 */
export * as docusignApi from './docusignApi'
export { default as docusignReducer } from './docusignSlice'
export {
  ENVELOPE_STATUS_BUCKETS,
  envelopeStateKey,
  bucketToArray,
  // thunks
  fetchDocuSignEnvelopes,
  fetchDocuSignEnvelopesByStatus,
  fetchDocuSignEnvelope,
  createDocuSignEnvelope,
  updateDocuSignEnvelope,
  sendDocuSignEnvelope,
  voidDocuSignEnvelope,
  deleteDocuSignEnvelope,
  fetchSavedSignatures,
  createSavedSignatureEntry,
  deleteSavedSignatureEntry,
  // template thunks
  fetchDocuSignTemplates,
  createDocuSignTemplate,
  updateDocuSignTemplate,
  deleteDocuSignTemplate,
  instantiateDocuSignTemplate,
  // bulk thunks
  startDocuSignBulkSend,
  fetchDocuSignBulkJobs,
  fetchDocuSignBulkJob,
  retryDocuSignBulkFailed,
  // actions
  clearCurrentEnvelope,
  clearCurrentBulkJob,
  applyEnvelopeUpdate,
  removeEnvelopeById,
} from './docusignSlice'
export { default as DocuSignObservers } from './DocuSignObservers'
export {
  normalizeEnvelopeShape,
  normalizeEnvelopeList,
  normalizeEnvelopeWritePayload,
} from './envelopeShape'
