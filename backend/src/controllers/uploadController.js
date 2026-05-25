const path = require('path')

// POST /api/upload
exports.uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const file = req.file
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const fileUrl = `${baseUrl}/uploads/${file.filename}`
    const ext = path.extname(file.originalname).replace('.', '')

    res.json({
      media: fileUrl,
      thumbnail: fileUrl,
      media_type: file.mimetype.startsWith('image/') ? 'image' : 'application',
      file_extension: ext,
      bucket: 'local',
      region: 'local',
      original_file_name: file.originalname,
      size: file.size,
    })
  } catch (error) {
    next(error)
  }
}

// POST /api/upload/signature
exports.uploadSignature = async (req, res, next) => {
  try {
    const { signatureDataURL } = req.body

    if (!signatureDataURL) {
      return res.status(400).json({ message: 'No signature data provided' })
    }

    // Convert base64 to file and save
    const base64Data = signatureDataURL.replace(/^data:image\/png;base64,/, '')
    const fs = require('fs')
    const filename = `signature-${Date.now()}.png`
    const filepath = path.join(__dirname, '../../uploads', filename)

    fs.writeFileSync(filepath, base64Data, 'base64')

    const baseUrl = `${req.protocol}://${req.get('host')}`
    const fileUrl = `${baseUrl}/uploads/${filename}`

    res.json({
      url: fileUrl,
      filename,
    })
  } catch (error) {
    next(error)
  }
}
