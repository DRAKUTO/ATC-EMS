import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('authUser');
    return saved ? JSON.parse(saved) : null;
  });

  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem('registeredUsers');
    return saved ? JSON.parse(saved) : [];
  });

  const register = (userData) => {
    const exists = users.find((u) => u.email === userData.email);
    if (exists) return { success: false, error: 'البريد الإلكتروني مسجل مسبقًا' };
    const newUser = { ...userData, id: Date.now() };
    const updated = [...users, newUser];
    setUsers(updated);
    localStorage.setItem('registeredUsers', JSON.stringify(updated));
    return { success: true };
  };

  const login = (email, password) => {
    const found = users.find((u) => u.email === email && u.password === password);
    if (!found) return { success: false, error: 'بيانات الدخول غير صحيحة' };
    setUser(found);
    localStorage.setItem('authUser', JSON.stringify(found));
    return { success: true, user: found };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('authUser');
  };

  const updateProfile = (data) => {
    const updated = { ...user, ...data };
    setUser(updated);
    localStorage.setItem('authUser', JSON.stringify(updated));
    const updatedUsers = users.map((u) => (u.id === user.id ? updated : u));
    setUsers(updatedUsers);
    localStorage.setItem('registeredUsers', JSON.stringify(updatedUsers));
  };

  return (
    <AuthContext.Provider value={{ user, users, register, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
