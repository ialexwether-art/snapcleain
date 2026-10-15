import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from '@/components/Header';
import PricingPage from '@/pages/PricingPage';
import SuccessPage from '@/pages/SuccessPage';
import AuthModal from '@/components/AuthModal';
import { useNavigate } from 'react-router-dom';

function AuthPage() {
  const navigate = useNavigate();
  return (
    <AuthModal
      onClose={() => navigate('/pricing')}
      onSuccess={() => navigate('/pricing')}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/pricing" replace />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/auth" element={<><PricingPage /><AuthPage /></>} />
        <Route path="*" element={<Navigate to="/pricing" replace />} />
      </Routes>
    </BrowserRouter>
  );
}