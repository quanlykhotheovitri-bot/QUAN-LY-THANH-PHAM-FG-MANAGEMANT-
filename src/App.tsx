import { AuthProvider } from './contexts/AuthContext';
import MainLayout from './pages/MainLayout';

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
