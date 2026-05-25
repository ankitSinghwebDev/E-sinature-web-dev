require('dotenv').config()
const mongoose = require('mongoose')
const connectDB = require('../config/db')
const User = require('../models/User')

const SEED_USERS = [
  {
    user_id: 'u001',
    first_name: 'Admin',
    last_name: 'User',
    email: 'admin@example.com',
    password: 'password123',
    designation_name: 'Administrator',
    role: 'admin',
    status: 'accepted',
    order: 1,
  },
  {
    user_id: 'u002',
    first_name: 'Sarah',
    last_name: 'Johnson',
    email: 'sarah@example.com',
    password: 'password123',
    designation_name: 'Director of Photography',
    department_name: 'Camera',
    status: 'accepted',
    order: 2,
  },
  {
    user_id: 'u003',
    first_name: 'Michael',
    last_name: 'Chen',
    email: 'michael@example.com',
    password: 'password123',
    designation_name: 'Gaffer',
    department_name: 'Lighting',
    status: 'accepted',
    order: 3,
  },
  {
    user_id: 'u004',
    first_name: 'Jessica',
    last_name: 'Lee',
    email: 'jessica@example.com',
    password: 'password123',
    designation_name: 'Producer',
    status: 'accepted',
    order: 4,
  },
]

async function seed() {
  await connectDB()
  console.log('Clearing existing users…')
  await User.deleteMany({})

  console.log('Inserting seed users…')
  for (const u of SEED_USERS) {
    await User.create(u)
    console.log(`  ✓ ${u.email} (${u.role || 'user'})`)
  }

  console.log('\nSeed complete. Login with:')
  console.log('  admin@example.com / password123')
  await mongoose.disconnect()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
