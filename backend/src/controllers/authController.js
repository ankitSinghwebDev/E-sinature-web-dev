const jwt = require('jsonwebtoken')
const User = require('../models/User')

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  })
}

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { first_name, last_name, email, password, designation_name } = req.body

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' })
    }

    // Generate user_id
    const count = await User.countDocuments()
    const user_id = `u${String(count + 1).padStart(3, '0')}`

    const user = await User.create({
      user_id,
      first_name,
      last_name,
      email,
      password,
      designation_name: designation_name || '',
    })

    const token = generateToken(user._id)

    res.status(201).json({
      status: true,
      token,
      user,
    })
  } catch (error) {
    next(error)
  }
}

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }

    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const token = generateToken(user._id)

    res.json({
      status: true,
      token,
      user,
    })
  } catch (error) {
    next(error)
  }
}

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ status: true, user: req.user })
}
