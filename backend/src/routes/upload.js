const express = require('express')
const router = express.Router()
const uploadController = require('../controllers/uploadController')
const auth = require('../middleware/auth')
const upload = require('../middleware/upload')

router.post('/', auth, upload.single('file'), uploadController.uploadFile)
router.post('/signature', auth, uploadController.uploadSignature)

module.exports = router
