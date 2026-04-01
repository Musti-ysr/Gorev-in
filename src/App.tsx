import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { UserProfile } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Check if user exists in Firestore
          const q = query(collection(db, 'users'), where('email', '==', firebaseUser.email));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data() as UserProfile;
            setUser({ ...userData, uid: querySnapshot.docs[0].id });
          } else if (firebaseUser.email === 'muhittinoz.ogs@gmail.com') {
            // Default admin fallback
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email!,
              role: 'admin',
              displayName: 'Yönetici',
            });
          } else {
            // Not authorized
            await auth.signOut();
            setUser(null);
          }
        } catch (error) {
          console.error('Auth state change error:', error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = (userData: UserProfile) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
    } catch (e) {
      console.error('Logout error:', e);
      setUser(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-black border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!user ? (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Login />
        </motion.div>
      ) : user.role === 'admin' ? (
        <motion.div
          key="admin"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <AdminDashboard user={user} onLogout={handleLogout} />
        </motion.div>
      ) : (
        <motion.div
          key="user"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <UserDashboard user={user} onLogout={handleLogout} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
