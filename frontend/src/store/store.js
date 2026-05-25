import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../api/client'

/* ══════════════════════════════════════════════════════════════════════
 *  AUTH
 * ══════════════════════════════════════════════════════════════════════ */
export const loginUser = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Login failed')
    }
  },
)

const savedUser = localStorage.getItem('user')
const savedToken = localStorage.getItem('token')

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: savedUser ? JSON.parse(savedUser) : null,
    token: savedToken || null,
    isAuthenticated: !!savedToken,
  },
  reducers: {
    logout: (state) => {
      state.user = null
      state.token = null
      state.isAuthenticated = false
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loginUser.fulfilled, (state, action) => {
      state.user = action.payload.user
      state.token = action.payload.token
      state.isAuthenticated = true
    })
  },
})

export const { logout } = authSlice.actions

/* ══════════════════════════════════════════════════════════════════════
 *  USERS (for recipient selection)
 * ══════════════════════════════════════════════════════════════════════ */
export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/users')
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch users')
    }
  },
)

const accountSlice = createSlice({
  name: 'accountData',
  initialState: { usersList: [] },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchUsers.fulfilled, (state, action) => {
      const allUsers = action.payload.data || []
      state.usersList = allUsers.filter((u) => !u.isExternal)
    })
  },
})

/* ══════════════════════════════════════════════════════════════════════
 *  DOCUSIGN ENVELOPES
 * ══════════════════════════════════════════════════════════════════════ */
export const fetchDocuSignEnvelopes = createAsyncThunk(
  'docusign/fetchEnvelopes',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/docusign/envelopes', { params })
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch envelopes')
    }
  },
)

export const fetchDocuSignEnvelope = createAsyncThunk(
  'docusign/fetchEnvelope',
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/docusign/envelopes/${id}`)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch envelope')
    }
  },
)

export const createDocuSignEnvelope = createAsyncThunk(
  'docusign/createEnvelope',
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/docusign/envelopes', payload)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create envelope')
    }
  },
)

export const updateDocuSignEnvelope = createAsyncThunk(
  'docusign/updateEnvelope',
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/docusign/envelopes/${id}`, payload)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update envelope')
    }
  },
)

export const sendDocuSignEnvelope = createAsyncThunk(
  'docusign/sendEnvelope',
  async ({ id, documentBase64 }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/docusign/envelopes/${id}/send`, { documentBase64 })
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to send envelope')
    }
  },
)

export const voidDocuSignEnvelope = createAsyncThunk(
  'docusign/voidEnvelope',
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/docusign/envelopes/${id}/void`, { reason })
      return { ...data, id }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to void envelope')
    }
  },
)

export const deleteDocuSignEnvelope = createAsyncThunk(
  'docusign/deleteEnvelope',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/docusign/envelopes/${id}`)
      return id
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete envelope')
    }
  },
)

const docusignSlice = createSlice({
  name: 'docusign',
  initialState: {
    envelopes: [],
    currentEnvelope: null,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearCurrentEnvelope: (state) => {
      state.currentEnvelope = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDocuSignEnvelopes.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchDocuSignEnvelopes.fulfilled, (state, action) => {
        state.envelopes = action.payload.data || []
        state.isLoading = false
      })
      .addCase(fetchDocuSignEnvelopes.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })
      .addCase(fetchDocuSignEnvelope.fulfilled, (state, action) => {
        state.currentEnvelope = action.payload.data || null
      })
      .addCase(createDocuSignEnvelope.fulfilled, (state, action) => {
        if (action.payload.data) {
          state.envelopes.unshift(action.payload.data)
          state.currentEnvelope = action.payload.data
        }
      })
      .addCase(updateDocuSignEnvelope.fulfilled, (state, action) => {
        const updated = action.payload.data
        if (updated) {
          state.currentEnvelope = updated
          const idx = state.envelopes.findIndex((e) => (e._id || e.id) === (updated._id || updated.id))
          if (idx !== -1) state.envelopes[idx] = updated
        }
      })
      .addCase(sendDocuSignEnvelope.fulfilled, (state, action) => {
        const updated = action.payload.data
        if (updated) {
          state.currentEnvelope = updated
          const idx = state.envelopes.findIndex((e) => (e._id || e.id) === (updated._id || updated.id))
          if (idx !== -1) state.envelopes[idx] = updated
        }
      })
      .addCase(voidDocuSignEnvelope.fulfilled, (state, action) => {
        const id = action.payload.id
        const env = state.envelopes.find((e) => (e._id || e.id) === id)
        if (env) env.status = 'voided'
        if (state.currentEnvelope && (state.currentEnvelope._id || state.currentEnvelope.id) === id) {
          state.currentEnvelope.status = 'voided'
        }
      })
      .addCase(deleteDocuSignEnvelope.fulfilled, (state, action) => {
        state.envelopes = state.envelopes.filter((e) => (e._id || e.id) !== action.payload)
        if (state.currentEnvelope && (state.currentEnvelope._id || state.currentEnvelope.id) === action.payload) {
          state.currentEnvelope = null
        }
      })
  },
})

export const { clearCurrentEnvelope } = docusignSlice.actions

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    accountData: accountSlice.reducer,
    docusign: docusignSlice.reducer,
  },
})
