/**
 * File resolution helpers for the eSignature module.
 *
 * The DocuSign components store uploaded files either as:
 *   - absolute URLs (http://.../uploads/foo.pdf) returned by the backend
 *   - data:/blob: URLs from in-memory canvas/PDF rendering
 *   - localStorage keys (legacy demo mode)
 *
 * getFileData resolves all three forms to something a browser can render.
 */

export const getFileData = async (keyOrAttachment) => {
  const key =
    typeof keyOrAttachment === 'string'
      ? keyOrAttachment
      : keyOrAttachment?.media || keyOrAttachment?.thumbnail

  if (!key) return null

  if (
    key.startsWith('http://') ||
    key.startsWith('https://') ||
    key.startsWith('data:') ||
    key.startsWith('blob:')
  ) {
    return key
  }

  try {
    const stored = localStorage.getItem(key)
    if (stored) return stored
    const thumb = localStorage.getItem(`${key}_thumb`)
    if (thumb) return thumb
  } catch {
    /* localStorage unavailable */
  }

  return key
}

export const resolveThumbnail = async (attachment) => {
  if (!attachment) return null
  const thumbKey = attachment.thumbnail || attachment.media
  if (!thumbKey) return null

  if (
    thumbKey.startsWith('http') ||
    thumbKey.startsWith('data:') ||
    thumbKey.startsWith('blob:')
  ) {
    return thumbKey
  }

  try {
    const thumb = localStorage.getItem(`${thumbKey}_thumb`)
    if (thumb) return thumb
    const full = localStorage.getItem(thumbKey)
    if (full) return full
  } catch {
    /* ok */
  }

  return null
}
