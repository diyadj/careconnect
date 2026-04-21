import axios from "axios";

const api = axios.create({
  // Use Vite dev proxy by default to avoid CORS in local development.
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 30000,
});

// Ride management helpers
export const ridesAPI = {
  list: (year) => api.get("/rides", { params: { year } }),
  get: (id) => api.get(`/rides/${id}`),
  create: (data) => api.post("/rides", data),
  update: (id, data) => api.patch(`/rides/${id}`, data),
  delete: (id) => api.delete(`/rides/${id}`),
  getUpcoming: (year) => api.get("/rides/upcoming", { params: { year } }),
  getByStatus: (year, status) => api.get("/rides", { params: { year, status } }),
};

export default api;
