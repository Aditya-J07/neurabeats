import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('nuro_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth Endpoints
export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
};

// Patient Endpoints
export const patientsAPI = {
  getProfile: (patientId = 1) => api.get(`/patients/${patientId}`),
  updateSafety: (patientId = 1, safetyData) => api.patch(`/patients/${patientId}/safety`, safetyData),
  getBaseline: (patientId = 1) => api.get(`/patients/${patientId}/baseline`),
  getSessions: (patientId = 1) => api.get(`/patients/${patientId}/sessions`),
  getProgress: (patientId = 1) => api.get(`/patients/${patientId}/progress`),
};

// Therapy Sessions Endpoints
export const sessionsAPI = {
  createSession: (sessionData) => api.post('/sessions', sessionData),
  pushEvents: (sessionId, events) => api.post(`/sessions/${sessionId}/events`, { events }),
  pushTelemetry: (sessionId, telemetryData) => api.post(`/sessions/${sessionId}/telemetry`, telemetryData),
  completeSession: (sessionId, completionData) => api.post(`/sessions/${sessionId}/complete`, completionData),
  getSession: (sessionId) => api.get(`/sessions/${sessionId}`),
};

// AI & Adaptation Endpoints (GenAI & ML)
export const aiAPI = {
  generateSessionSummary: (summaryData) => api.post('/ai/session-summary', summaryData),
  generateRhythmConfig: (configData) => api.post('/ai/rhythm-config', configData),
  getRecommendation: (recData) => api.post('/adaptation/recommendation', recData),
};

export default api;
