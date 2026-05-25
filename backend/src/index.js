require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const connectDB = require('./config/db')
const errorHandler = require('./middleware/errorHandler')

const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const uploadRoutes = require('./routes/upload')
const docusignRoutes = require('./routes/docusign')

const app = express()

connectDB()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/docusign', docusignRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use(errorHandler)

const PORT = process.env.PORT || 5001
app.listen(PORT, () => {
  console.log(`eSignature backend running on port ${PORT}`)
  console.log(`API:    http://localhost:${PORT}/api`)
  console.log(`Health: http://localhost:${PORT}/api/health`)
})
