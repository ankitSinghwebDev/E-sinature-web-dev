import api from './client'

export const uploadFile = async (file) => {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const uploadSignature = async (signatureDataURL) => {
  const { data } = await api.post('/upload/signature', { signatureDataURL })
  return data
}
