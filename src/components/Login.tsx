import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { motion } from 'motion/react';
import { LogIn, Lock, Mail, AlertCircle, MessageSquare, Check } from 'lucide-react';
import { Logo } from './Logo';

interface LoginProps {}

export default function Login({}: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // Auth state listener in App.tsx will handle the redirect and authorization check
    } catch (err: any) {
      console.error('Google login error:', err);
      let errorMessage = 'Google ile giriş yapılırken bir hata oluştu.';
      
      if (err.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Google giriş popup\'ı kapatıldı. Lütfen tekrar deneyin.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Google giriş isteği iptal edildi.';
      } else if (err.code === 'auth/popup-blocked') {
        errorMessage = 'Popup engellendi. Lütfen popup engelleyicisini devre dışı bırakın.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMessage = 'Google girişi bu proje için etkinleştirilmemiş. Firebase Console\'dan etkinleştirin.';
      } else if (err.code === 'auth/unauthorized-domain') {
        errorMessage = 'Bu domain yetkilendirilmemiş. Firebase Console\'da authorized domains\'e ekleyin.';
      } else if (err.message) {
        errorMessage = `Google giriş hatası: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Auth state listener in App.tsx will handle the redirect and authorization check
    } catch (err: any) {
      console.error('Email login error:', err);
      let errorMessage = 'Giriş yapılırken bir hata oluştu.';
      
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Hatalı şifre. Lütfen şifrenizi kontrol edin.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Geçersiz e-posta adresi formatı.';
      } else if (err.code === 'auth/user-disabled') {
        errorMessage = 'Bu hesap devre dışı bırakılmış.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Ağ bağlantısı hatası. İnternet bağlantınızı kontrol edin.';
      } else if (err.message) {
        errorMessage = `Giriş hatası: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-gray-100"
      >
        <div className="flex items-center justify-center gap-6 mb-10">
          <div className="w-24 h-24 shrink-0">
            <Logo />
          </div>
          <div className="text-left">
            <div className="flex items-baseline select-none">
              <span className="text-5xl font-black text-blue-900 tracking-tighter">Görev</span>
              <span className="text-5xl font-black text-orange-500 tracking-tighter">-in</span>
            </div>
            <p className="text-gray-400 font-bold tracking-[0.2em] uppercase text-sm mt-1">YÖNETİCİ PANELİ</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 ml-1">E-posta</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                placeholder="ornek@mail.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 ml-1">Şifre</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-black text-white rounded-xl font-bold text-lg hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Giriş Yap'
            )}
          </button>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500 font-medium">Veya</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-50 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Google ile Giriş Yap
          </button>
        </form>
      </motion.div>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-100 py-3 px-6 z-40">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-gray-400 font-medium">
          <span className="font-bold">Muhittin ÖZ ve Mustafa YAŞAR Tarafından Geliştirilmiştir.</span>
          <span className="text-gray-200 hidden sm:inline">|</span>
          <span className="font-black uppercase tracking-widest">© 2026 Görev-in</span>
          <span className="text-gray-200 hidden sm:inline">|</span>
          <span>Tüm Hakları Saklıdır.</span>
          <span className="text-gray-200 hidden sm:inline">|</span>
          <span className="text-gray-500 font-bold">İletişim: 0535 043 9150 - 0552 254 1870</span>
        </div>
      </footer>
    </div>
  );
}
