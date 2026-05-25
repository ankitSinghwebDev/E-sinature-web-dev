import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../api/client'
import {
  docusignReducer,
  // Re-export the docusign thunks + actions so existing call sites that
  // `import { fetchDocuSignEnvelopes, ... } from '../store/store'` keep
  // working unchanged. New code should import from
  // '../api/docusignApi' directly.
  fetchDocuSignEnvelopes,
  fetchDocuSignEnvelopesByStatus,
  fetchDocuSignEnvelope,
  createDocuSignEnvelope,
  updateDocuSignEnvelope,
  sendDocuSignEnvelope,
  voidDocuSignEnvelope,
  deleteDocuSignEnvelope,
  fetchSavedSignatures,
  createSavedSignatureEntry,
  deleteSavedSignatureEntry,
  clearCurrentEnvelope,
  applyEnvelopeUpdate,
  removeEnvelopeById,
  ENVELOPE_STATUS_BUCKETS,
  envelopeStateKey,
  bucketToArray,
} from '../api/docusignApi'

export {
  fetchDocuSignEnvelopes,
  fetchDocuSignEnvelopesByStatus,
  fetchDocuSignEnvelope,
  createDocuSignEnvelope,
  updateDocuSignEnvelope,
  sendDocuSignEnvelope,
  voidDocuSignEnvelope,
  deleteDocuSignEnvelope,
  fetchSavedSignatures,
  createSavedSignatureEntry,
  deleteSavedSignatureEntry,
  clearCurrentEnvelope,
  applyEnvelopeUpdate,
  removeEnvelopeById,
  ENVELOPE_STATUS_BUCKETS,
  envelopeStateKey,
  bucketToArray,
}

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

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    accountData: accountSlice.reducer,
    docusign: docusignReducer,
  },
})
