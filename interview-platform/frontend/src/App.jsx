import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import Payment from './pages/Payment';
import ResumeUpload from './pages/ResumeUpload';
import Instructions from './pages/Instructions';
import Interview from './pages/Interview';
import Report from './pages/Report';
import Mobile from './pages/Mobile';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Home from './pages/Home';

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        {/* Public landing — Home itself redirects auth'd users to /dashboard */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Mobile receiver — public route, auth is via pairing token in URL */}
        <Route path="/mobile" element={<Mobile />} />

        {/* Public auth flows */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/verify-email"    element={<VerifyEmail />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
        <Route path="/payment/:planId" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
        <Route path="/resume" element={<ProtectedRoute><ResumeUpload /></ProtectedRoute>} />
        <Route path="/instructions" element={<ProtectedRoute><Instructions /></ProtectedRoute>} />
        <Route path="/interview" element={<ProtectedRoute><Interview /></ProtectedRoute>} />
        <Route path="/report/:sessionId" element={<ProtectedRoute><Report /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
