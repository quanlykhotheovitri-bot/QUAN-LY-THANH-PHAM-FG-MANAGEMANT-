import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { UserRole } from '../types';

interface User {
  username: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (username: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const VALID_USERS = [
  { username: 'admin', pass: '123456789@', role: 'admin' as UserRole },
  { username: 'user1', pass: '123456789@', role: 'viewer' as UserRole },
  ...Array.from({ length: 15 }, (_, i) => ({
    username: `user${i + 2}`,
    pass: '123456789@',
    role: 'user' as UserRole
  }))
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('fg_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);

  const signIn = async (username: string, pass: string) => {
    setLoading(true);
    try {
      const found = VALID_USERS.find(u => u.username === username && u.pass === pass);
      if (found) {
        const userData = { username: found.username, role: found.role };
        setUser(userData);
        localStorage.setItem('fg_user', JSON.stringify(userData));
        return { success: true };
      }
      return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('fg_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
