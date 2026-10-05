import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import CrewApp from './crew/CrewApp.jsx'
import AdminApp from './admin/AdminApp.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="*" element={<CrewApp />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
