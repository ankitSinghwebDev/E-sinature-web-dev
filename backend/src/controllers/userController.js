const mongoose = require('mongoose')
const User = require('../models/User')

// GET /api/users
exports.getUsers = async (req, res, next) => {
  try {
    const { type, status } = req.query
    const filter = {}

    if (type === 'external') {
      filter.isExternal = true
    } else if (type === 'internal') {
      filter.isExternal = false
    }

    if (status) {
      filter.status = status
    }

    const users = await User.find(filter).sort({ order: 1 })
    res.json({ data: users })
  } catch (error) {
    next(error)
  }
}

// GET /api/users/:id
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({ data: user })
  } catch (error) {
    next(error)
  }
}

// POST /api/users  (admin creates user)
exports.createUser = async (req, res, next) => {
  try {
    const {
      first_name,
      last_name,
      email,
      password,
      department_id,
      department_name,
      department_identifier,
      designation_id,
      designation_name,
      designation_identifier,
      isExternal,
      project_id,
      country_code,
      join_unit_id,
      join_unit_name,
      join_unit_identifier,
    } = req.body

    const user_id = new mongoose.Types.ObjectId().toString()

    const user = await User.create({
      user_id,
      first_name,
      last_name,
      full_name: `${first_name} ${last_name}`,
      email,
      password: password || 'default123',
      department_id: department_id || '',
      department_name: department_name || '',
      department_identifier: department_identifier || '',
      designation_id: designation_id || '',
      designation_name: designation_name || '',
      designation_identifier: designation_identifier || '',
      isExternal: isExternal || false,
      project_id: project_id || '',
      country_code: country_code || '',
      join_unit_id: join_unit_id || '',
      join_unit_name: join_unit_name || '',
      join_unit_identifier: join_unit_identifier || '',
      order: (await User.countDocuments()) + 1,
    })

    res.status(201).json({ data: user })
  } catch (error) {
    next(error)
  }
}

// PUT /api/users/:id
exports.updateUser = async (req, res, next) => {
  try {
    const { password, ...updateData } = req.body

    // Auto-update full_name if first/last name changes
    if (updateData.first_name || updateData.last_name) {
      const existing = await User.findById(req.params.id)
      if (existing) {
        updateData.full_name = `${updateData.first_name || existing.first_name} ${updateData.last_name || existing.last_name}`
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({ data: user })
  } catch (error) {
    next(error)
  }
}

// PATCH /api/users/:id/status  (accept or reject a pending user)
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be "accepted" or "rejected"' })
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true },
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ data: user })
  } catch (error) {
    next(error)
  }
}

// DELETE /api/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'removed' },
      { new: true },
    )
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({ message: 'User removed' })
  } catch (error) {
    next(error)
  }
}
