/**
 * DocuSignObservers — bridges DocuSign socket events into the Redux slice.
 *
 * Mount once at app shell level. Inert until a socket layer is wired up
 * that dispatches the matching CustomEvents on `window`:
 *
 *   window.dispatchEvent(new CustomEvent('esignature:envelope:update', {
 *     detail: { envelope: { _id, status, recipients, ... } },
 *   }))
 *
 *   window.dispatchEvent(new CustomEvent('esignature:envelope:delete', {
 *     detail: { id: '<envelope id>' },
 *   }))
 *
 * Backend wire events that would normally feed these:
 *   esignature:envelope:delivered, signed, declined, completed, voided,
 *   updated, deleted.
 */
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { applyEnvelopeUpdate, removeEnvelopeById } from './docusignSlice'

const pickEnvelope = (data) =>
  data?.envelope ?? data?.data ?? data?.detail?.envelope ?? data?.detail ?? data

const pickId = (data) =>
  data?.id ?? data?._id ?? data?.envelopeId ?? data?.detail?.id ?? data?.detail?._id

const DocuSignObservers = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    const onUpdate = (e) => {
      const env = pickEnvelope(e?.detail ?? e)
      if (!env?._id) return
      dispatch(applyEnvelopeUpdate(env))
    }
    const onDelete = (e) => {
      const id = pickId(e?.detail ?? e)
      if (!id) return
      dispatch(removeEnvelopeById(id))
    }

    window.addEventListener('esignature:envelope:update', onUpdate)
    window.addEventListener('esignature:envelope:delete', onDelete)
    return () => {
      window.removeEventListener('esignature:envelope:update', onUpdate)
      window.removeEventListener('esignature:envelope:delete', onDelete)
    }
  }, [dispatch])

  return null
}

export default DocuSignObservers
