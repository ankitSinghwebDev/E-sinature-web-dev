const express = require('express')
const router = express.Router()
const userController = require('../controllers/userController')
const auth = require('../middleware/auth')

router.get('/', auth, userController.getUsers)
router.get('/:id', auth, userController.getUser)
router.post('/', auth, userController.createUser)
router.put('/:id', auth, userController.updateUser)
router.patch('/:id/status', auth, userController.updateUserStatus)
router.delete('/:id', auth, userController.deleteUser)

module.exports = router
