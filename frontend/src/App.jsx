import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import RidePlanningPage from "./pages/RidePlanningPage";
import InvoicePage from "./pages/InvoicePage";
import MileagePage from "./pages/MileagePage";
import SchedulePage from "./pages/SchedulePage";

export default function App() {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-logo">CareConnect</span>
        <NavLink
          to="/schedule"
          className={({ isActive }) =>
            `nav-link${isActive ? " active" : ""}`
          }
        >
          Annual Schedule
        </NavLink>
        <NavLink
          to="/rides"
          className={({ isActive }) =>
            `nav-link${isActive ? " active" : ""}`
          }
        >
          Ride Planning
        </NavLink>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `nav-link${isActive ? " active" : ""}`
          }
          end
        >
          Invoice Matching
        </NavLink>
        <NavLink
          to="/mileage"
          className={({ isActive }) =>
            `nav-link${isActive ? " active" : ""}`
          }
        >
          Mileage Tracking
        </NavLink>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/rides" element={<RidePlanningPage />} />
          <Route path="/" element={<InvoicePage />} />
          <Route path="/mileage" element={<MileagePage />} />
        </Routes>
      </main>
    </div>
  );
}
