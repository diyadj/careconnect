import axios from "axios";

const api = axios.create({
  // Use Vite dev proxy by default to avoid CORS in local development.
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 30000,
});

export default api;
