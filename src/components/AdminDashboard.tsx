import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDocs, where, writeBatch, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Task, UserProfile, RecurrenceInterval, TaskStatus, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Users, ClipboardList, LogOut, Trash2, Edit2, 
  Download, CheckCircle2, Clock, Calendar, Repeat, 
  UserPlus, X, Search, Filter, ChevronRight, MoreVertical,
  AlertCircle, RefreshCw, FileText, MessageSquare, Check, Car, Archive, Building2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Logo } from './Logo';
import Bildirin from './Bildirin';
import TaxCalendar from './TaxCalendar';
import CompanyInfo from './CompanyInfo';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  // Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignedToEmails, setTaskAssignedToEmails] = useState<string[]>([]);
  const [taskDueDate, setTaskDueDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [taskIsRecurring, setTaskIsRecurring] = useState(false);
  const [taskRecurrence, setTaskRecurrence] = useState<RecurrenceInterval>('none');

  // User Form State
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('1234');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('user');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showBildirin, setShowBildirin] = useState(false);
  const [showTaxCalendar, setShowTaxCalendar] = useState(false);
  const [showArchivedTaxCalendar, setShowArchivedTaxCalendar] = useState(false);
  const [showCompanyInfo, setShowCompanyInfo] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [isTaxSubMenuOpen, setIsTaxSubMenuOpen] = useState(false);

  const isFirebaseAuth = !!auth.currentUser;

  const hasCheckedAdmin = useRef(false);

  useEffect(() => {
    // Ensure primary admin is in users collection
    if (user.email === 'muhittinoz.ogs@gmail.com' && !hasCheckedAdmin.current) {
      const adminExists = users.find(u => u.email === 'muhittinoz.ogs@gmail.com');
      // Only bootstrap if we have users loaded (or confirmed empty) and admin is missing
      if (users.length >= 0 && !adminExists && auth.currentUser) {
        hasCheckedAdmin.current = true;
        setDoc(doc(db, 'users', auth.currentUser.uid), {
          email: 'muhittinoz.ogs@gmail.com',
          displayName: 'Muhittin Öz',
          role: 'admin',
          password: '123456'
        }).catch(e => {
          console.error('Error bootstrapping admin:', e);
          hasCheckedAdmin.current = false; // Retry on failure
        });
      }
    }
  }, [users, user]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const qTasks = query(collection(db, 'tasks'));
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      const taskList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Task));
      setTasks(taskList);
      setGlobalError(null);
    }, (error) => {
      console.error('Task sync error:', error);
      if (error.message?.includes('permission-denied')) {
        setGlobalError('Yetki hatası: Verilere erişim izniniz yok.');
      } else {
        setGlobalError('Görevler senkronize edilemiyor.');
      }
      try { handleFirestoreError(error, OperationType.GET, 'tasks'); } catch (e) {}
    });

    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      setUsers(userList);
      setGlobalError(null);
    }, (error) => {
      console.error('User sync error:', error);
      if (error.message?.includes('permission-denied')) {
        // Silent error for users list if not admin, though AdminDashboard should only be for admins
      } else {
        setGlobalError('Kullanıcı listesi alınamıyor.');
      }
      try { handleFirestoreError(error, OperationType.GET, 'users'); } catch (e) {}
    });

    return () => {
      unsubscribeTasks();
      unsubscribeUsers();
    };
  }, [user.uid]);

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const taskData = {
      title: taskTitle,
      description: taskDesc,
      assignedToEmails: taskAssignedToEmails,
      status: 'pending' as TaskStatus,
      dueDate: taskDueDate,
      isRecurring: taskIsRecurring,
      recurrenceInterval: taskRecurrence,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdAt: new Date().toISOString(),
        });
      }
      resetTaskForm();
    } catch (err) {
      handleFirestoreError(err, editingTask ? OperationType.UPDATE : OperationType.CREATE, 'tasks');
    }
  };

  const resetTaskForm = () => {
    setTaskTitle('');
    setTaskDesc('');
    setTaskAssignedToEmails([]);
    setTaskDueDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setTaskIsRecurring(false);
    setTaskRecurrence('none');
    setEditingTask(null);
    setIsTaskModalOpen(false);
  };

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');
    setIsSavingUser(true);
    const userData = {
      email: userEmail,
      password: userPassword,
      displayName: userDisplayName,
      role: userRole,
    };

    try {
      if (!auth.currentUser && user.email === 'muhittinoz.ogs@gmail.com') {
        setErrorMessage('Yönetici yetkisiyle işlem yapmak için lütfen Google ile giriş yapın.');
        setIsSavingUser(false);
        return;
      }

      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.uid), userData);
        setSuccessMessage('Kullanıcı güncellendi.');
      } else {
        await addDoc(collection(db, 'users'), userData);
        setSuccessMessage('Kullanıcı başarıyla eklendi.');
      }
      
      // Clear fields but keep modal open so user can see the success message and updated list
      setUserEmail('');
      setUserPassword('1234');
      setUserDisplayName('');
      setUserRole('user');
      setEditingUser(null);
      
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      console.error('User save error:', err);
      if (err.message?.includes('permission-denied')) {
        setErrorMessage('Yetki hatası: Lütfen Google ile giriş yaptığınızdan emin olun.');
      } else {
        setErrorMessage('Kullanıcı kaydedilirken bir hata oluştu.');
      }
      try {
        handleFirestoreError(err, editingUser ? OperationType.UPDATE : OperationType.CREATE, 'users');
      } catch (e) {
        // Error already logged by handleFirestoreError
      }
    } finally {
      setIsSavingUser(false);
    }
  };

  const resetUserForm = () => {
    setUserEmail('');
    setUserPassword('1234');
    setUserDisplayName('');
    setUserRole('user');
    setEditingUser(null);
    setIsUserModalOpen(false);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleRestoreTask = async (id: string) => {
    try {
      await updateDoc(doc(db, 'tasks', id), {
        isArchived: false,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tasks');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (confirm('Bu görevi silmek istediğinize emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'tasks', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'tasks');
      }
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'users');
      }
    }
  };

  const exportToExcel = () => {
    const data = tasks.map(t => ({
      'Görev Başlığı': t.title,
      'Açıklama': t.description,
      'Atanan Kişiler': t.assignedToEmails?.join(', ') || '',
      'Durum': t.status === 'completed' ? 'Tamamlandı' : 'Bekliyor',
      'Bitiş Tarihi': format(new Date(t.dueDate), 'dd.MM.yyyy HH:mm'),
      'Tekrarlı': t.isRecurring ? 'Evet' : 'Hayır',
      'Tekrar Aralığı': t.recurrenceInterval,
      'Oluşturulma': format(new Date(t.createdAt), 'dd.MM.yyyy HH:mm')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Görevler');
    XLSX.writeFile(wb, `Gorevler_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (t.assignedToEmails && t.assignedToEmails.some(email => email.toLowerCase().includes(searchQuery.toLowerCase())));
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        const selectedUser = users.find(u => u.uid === userFilter);
        const matchesUser = userFilter === 'all' || (selectedUser && t.assignedToEmails && t.assignedToEmails.includes(selectedUser.email));
        
        if (showArchived) {
          return matchesSearch && matchesStatus && matchesUser && t.isArchived === true;
        }
        
        return matchesSearch && matchesStatus && matchesUser;
      })
      .sort((a, b) => {
        // Archived tasks go to the bottom
        if (a.isArchived && !b.isArchived) return 1;
        if (!a.isArchived && b.isArchived) return -1;
        // Then sort by due date
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [tasks, searchQuery, statusFilter, userFilter, showArchived, users]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col md:flex-row relative">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-100 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 overflow-hidden">
            <Logo />
          </div>
          <h2 className="font-black text-xl leading-none tracking-tighter">
            <span className="text-blue-900">Görev</span>
            <span className="text-orange-500">-in</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setShowBildirin(!showBildirin); setShowArchived(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); setIsMobileMenuOpen(false); }}
            className={`p-2 rounded-xl transition-all ${showBildirin ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <Car className="w-6 h-6" />
          </button>
          <button 
            onClick={() => { setShowTaxCalendar(!showTaxCalendar); setShowArchivedTaxCalendar(false); setShowBildirin(false); setShowArchived(false); setShowCompanyInfo(false); setIsMobileMenuOpen(false); }}
            className={`p-2 rounded-xl transition-all ${showTaxCalendar && !showArchivedTaxCalendar ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <Calendar className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-all"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <MoreVertical className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 left-0 z-50 h-screen w-72 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 shrink-0 overflow-hidden">
              <Logo />
            </div>
            <div>
              <div className="flex items-center select-none">
                <span className="text-2xl font-black text-blue-900 tracking-tighter">Görev</span>
                <span className="text-2xl font-black text-orange-500 tracking-tighter">-in</span>
              </div>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mt-1">Yönetici Paneli</p>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Giriş Yapıldı</p>
            <p className="text-sm font-bold text-gray-800 truncate">{user.email}</p>
            {user.email === 'muhittinoz.ogs@gmail.com' && (
              <p className={`text-[8px] font-black uppercase tracking-widest mt-2 flex items-center gap-1 ${isFirebaseAuth ? 'text-green-500' : 'text-orange-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isFirebaseAuth ? 'bg-green-500' : 'bg-orange-500 animate-pulse'}`} />
                {isFirebaseAuth ? 'Google Doğrulandı' : 'Google Girişi Gerekli'}
              </p>
            )}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button 
            onClick={() => { setStatusFilter('all'); setSearchQuery(''); setIsMobileMenuOpen(false); setShowArchived(false); setShowBildirin(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold ${(!showArchived && !showBildirin && !showTaxCalendar && !showCompanyInfo) ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <div className="w-5 h-5 overflow-hidden">
              <Logo className="w-full h-full rounded-md" />
            </div>
            Aktif Görevler
          </button>
          <button 
            onClick={() => { setShowBildirin(true); setShowArchived(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold ${showBildirin ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Car className="w-5 h-5" />
            Bildir-in
          </button>
          
          <div className="space-y-1">
            <button 
              onClick={() => setIsTaxSubMenuOpen(!isTaxSubMenuOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-semibold ${showTaxCalendar ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5" />
                Takvim-in
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform ${isTaxSubMenuOpen ? 'rotate-90' : ''}`} />
            </button>
            
            <AnimatePresence>
              {isTaxSubMenuOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden pl-8 space-y-1"
                >
                  <button 
                    onClick={() => { setShowTaxCalendar(true); setShowArchivedTaxCalendar(false); setShowBildirin(false); setShowArchived(false); setShowCompanyInfo(false); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all font-semibold ${showTaxCalendar && !showArchivedTaxCalendar ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    Aktif Kayıtlar
                  </button>
                  <button 
                    onClick={() => { setShowTaxCalendar(true); setShowArchivedTaxCalendar(true); setShowBildirin(false); setShowArchived(false); setShowCompanyInfo(false); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all font-semibold ${showTaxCalendar && showArchivedTaxCalendar ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    Arşivlenmiş Kayıtlar
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => { setShowArchived(true); setShowBildirin(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold ${showArchived ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <ClipboardList className="w-5 h-5" />
            Arşivlenmiş Görevler
          </button>
          <button 
            onClick={() => { setShowCompanyInfo(true); setShowBildirin(false); setShowArchived(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold ${showCompanyInfo ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Building2 className="w-5 h-5" />
            Şirket-in
          </button>
          <button 
            onClick={() => { setIsUserModalOpen(true); setIsMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:bg-gray-100 transition-all font-semibold"
          >
            <Users className="w-5 h-5" />
            Kullanıcı Yönetimi
          </button>
          <button 
            onClick={() => { exportToExcel(); setIsMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:bg-gray-100 transition-all font-semibold"
          >
            <Download className="w-5 h-5" />
            Excel'e Aktar
          </button>
        </nav>

        <div className="p-4 mt-auto border-t border-gray-100">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold"
          >
            <LogOut className="w-5 h-5" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-10 overflow-x-hidden">
        {globalError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div className="flex-1">
              <p>{globalError}</p>
              <p className="text-[10px] opacity-70 mt-1">İpucu: Google ile giriş yapmadıysanız yetki hatası alıyor olabilirsiniz.</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="p-2 hover:bg-red-100 rounded-xl transition-all"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* View Toggles */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => { setShowBildirin(false); setShowArchived(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); }}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap ${(!showBildirin && !showArchived && !showTaxCalendar && !showCompanyInfo) ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            Aktif Görevler
          </button>
          <button
            onClick={() => { setShowBildirin(true); setShowArchived(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); }}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap flex items-center gap-2 ${showBildirin ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <Car className="w-5 h-5" />
            Bildir-in
          </button>
          <button
            onClick={() => { setShowTaxCalendar(true); setShowBildirin(false); setShowArchived(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); }}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap flex items-center gap-2 ${showTaxCalendar && !showArchivedTaxCalendar ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <Calendar className="w-5 h-5" />
            Takvim-in
          </button>
          <button
            onClick={() => { setShowTaxCalendar(true); setShowArchivedTaxCalendar(true); setShowBildirin(false); setShowArchived(false); setShowCompanyInfo(false); }}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap flex items-center gap-2 ${showTaxCalendar && showArchivedTaxCalendar ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <Archive className="w-5 h-5" />
            Takvim Arşiv
          </button>
          <button
            onClick={() => { setShowCompanyInfo(true); setShowBildirin(false); setShowArchived(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); }}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap flex items-center gap-2 ${showCompanyInfo ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <Building2 className="w-5 h-5" />
            Şirket-in
          </button>
          <button
            onClick={() => { setShowArchived(true); setShowBildirin(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); }}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap ${showArchived ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            Arşiv
          </button>
        </div>

        {showBildirin ? (
          <Bildirin user={user} />
        ) : showTaxCalendar ? (
          <TaxCalendar user={user} showArchivedOnly={showArchivedTaxCalendar} />
        ) : showCompanyInfo ? (
          <CompanyInfo user={user} />
        ) : (
          <>
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-6">
            <div className="hidden lg:block w-14 h-14 overflow-hidden">
              <Logo />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">
                {showArchived ? 'Arşivlenmiş Görevler' : 'Görevler'}
              </h1>
              <p className="text-gray-500 font-medium mt-1 text-sm md:text-base">
                {showArchived ? 'Tamamlanmış ve arşive gönderilmiş görevler.' : 'Sistemdeki tüm görevleri buradan yönetebilirsiniz.'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsTaskModalOpen(true)}
            className="w-full lg:w-auto bg-orange-500 text-white px-6 py-4 lg:py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Yeni Görev Ekle
          </button>
        </header>

        {/* Filters & Search */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="relative md:col-span-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text"
              placeholder="Görev veya kullanıcı ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all shadow-sm font-medium"
            />
          </div>
          <div className="relative">
            <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select 
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none appearance-none transition-all shadow-sm font-bold text-gray-700"
            >
              <option value="all">Tüm Kullanıcılar</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>{u.displayName}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none appearance-none transition-all shadow-sm font-bold text-gray-700"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="pending">Bekliyor</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </div>
        </div>

        {/* Task Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
              >
                {/* Status Indicator Bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-2 ${task.status === 'completed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${task.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {task.status === 'completed' ? 'Tamamlandı' : 'Bekliyor'}
                      </span>
                      {task.isRecurring && (
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          {task.recurrenceInterval === 'daily' ? 'Günlük' : task.recurrenceInterval === 'weekly' ? 'Haftalık' : 'Aylık'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 leading-tight group-hover:text-black transition-colors">{task.title}</h3>
                    {task.isArchived && task.archivedAt && (
                      <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest mt-1">
                        Arşivlendi: {format(new Date(task.archivedAt), 'MMMM yyyy', { locale: tr })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={() => {
                        setEditingTask(task);
                        setTaskTitle(task.title);
                        setTaskDesc(task.description);
                        setTaskAssignedToEmails(task.assignedToEmails || []);
                        setTaskDueDate(task.dueDate);
                        setTaskIsRecurring(task.isRecurring);
                        setTaskRecurrence(task.recurrenceInterval);
                        setIsTaskModalOpen(true);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-black transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-600 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {task.isArchived && (
                      <button 
                        onClick={() => handleRestoreTask(task.id)}
                        className="p-2 hover:bg-blue-50 rounded-xl text-gray-400 hover:text-blue-600 transition-all"
                        title="Görevi Geri Yükle"
                      >
                        <Repeat className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-gray-500 text-sm mb-4 line-clamp-2 font-medium leading-relaxed">{task.description}</p>

                {task.completionNote && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Tamamlama Notu</p>
                    <p className="text-xs text-gray-700 font-medium italic">"{task.completionNote}"</p>
                  </div>
                )}

                {task.attachments && task.attachments.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {task.attachments.map((file, idx) => (
                      <a 
                        key={idx}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all"
                      >
                        <FileText className="w-3 h-3" />
                        Belge {idx + 1}
                      </a>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Atananlar</p>
                      <p className="text-xs font-bold text-gray-700 truncate">
                        {task.assignedToEmails?.join(', ') || 'Atanmamış'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Bitiş</p>
                      <p className="text-xs font-bold text-gray-700">{format(new Date(task.dueDate), 'dd MMM, HH:mm', { locale: tr })}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </>
    )}

    {/* Task Modal */}
        <AnimatePresence>
          {isTaskModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] md:rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
              >
                <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-gray-900">{editingTask ? 'Görevi Düzenle' : 'Yeni Görev Oluştur'}</h2>
                    <p className="text-gray-500 text-xs md:text-sm font-medium">Lütfen görev detaylarını eksiksiz doldurun.</p>
                  </div>
                  <button onClick={resetTaskForm} className="p-2 md:p-3 hover:bg-white rounded-2xl text-gray-400 hover:text-black transition-all shadow-sm">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <form onSubmit={handleSaveTask} className="p-6 md:p-8 space-y-6 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 col-span-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Görev Başlığı</label>
                      <input 
                        required
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-medium"
                        placeholder="Örn: Haftalık Rapor Hazırlama"
                      />
                    </div>
                    
                    <div className="space-y-2 col-span-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Açıklama</label>
                      <textarea 
                        value={taskDesc}
                        onChange={(e) => setTaskDesc(e.target.value)}
                        rows={3}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-medium resize-none"
                        placeholder="Görev hakkında detaylı bilgi..."
                      />
                    </div>

                    <div className="space-y-2 col-span-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Kullanıcı Ata</label>
                      <div className="max-h-60 overflow-y-auto p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                        {users.map(u => (
                          <label key={u.uid} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-orange-200 hover:bg-orange-50/30 transition-all cursor-pointer group">
                            <input 
                              type="checkbox"
                              checked={taskAssignedToEmails.includes(u.email)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTaskAssignedToEmails([...taskAssignedToEmails, u.email]);
                                } else {
                                  setTaskAssignedToEmails(taskAssignedToEmails.filter(email => email !== u.email));
                                }
                              }}
                              className="w-6 h-6 rounded-lg border-gray-300 text-orange-500 focus:ring-orange-500 transition-all"
                            />
                            <div className="flex flex-col flex-1">
                              <span className="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors">{u.displayName}</span>
                              <span className="text-[10px] text-gray-400 font-medium">{u.email}</span>
                            </div>
                            {taskAssignedToEmails.includes(u.email) && (
                              <CheckCircle2 className="w-4 h-4 text-orange-500" />
                            )}
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium ml-1">Birden fazla kullanıcı seçebilirsiniz.</p>
                    </div>

                    <div className="space-y-2 col-span-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Bitiş Tarihi</label>
                      <input 
                        type="datetime-local"
                        required
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-medium"
                      />
                    </div>

                    <div className="col-span-2 p-6 bg-gray-50 rounded-3xl border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                          <Repeat className="text-blue-500 w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">Tekrarlı Görev</p>
                          <p className="text-xs text-gray-400 font-medium">Bu görev belirli aralıklarla tekrarlansın mı?</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <input 
                          type="checkbox"
                          checked={taskIsRecurring}
                          onChange={(e) => setTaskIsRecurring(e.target.checked)}
                          className="w-6 h-6 rounded-lg border-gray-300 text-black focus:ring-black"
                        />
                        {taskIsRecurring && (
                          <select 
                            value={taskRecurrence}
                            onChange={(e) => setTaskRecurrence(e.target.value as any)}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-xl outline-none font-bold text-sm"
                          >
                            <option value="daily">Günlük</option>
                            <option value="weekly">Haftalık</option>
                            <option value="monthly">Aylık</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={resetTaskForm}
                      className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                    >
                      İptal
                    </button>
                    <button 
                      type="submit"
                      className="flex-[2] py-4 bg-black text-white rounded-2xl font-bold shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {editingTask ? 'Değişiklikleri Kaydet' : 'Görevi Oluştur'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* User Management Modal */}
        <AnimatePresence>
          {isUserModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] md:rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-gray-900">Kullanıcı Yönetimi</h2>
                    <p className="text-gray-500 text-xs md:text-sm font-medium">Sistemdeki alt kullanıcıları buradan yönetebilirsiniz.</p>
                  </div>
                  <button onClick={resetUserForm} className="p-2 md:p-3 hover:bg-white rounded-2xl text-gray-400 hover:text-black transition-all shadow-sm">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* User Form */}
                    <div className="lg:col-span-1 space-y-6">
                      <div className="p-5 md:p-6 bg-gray-50 rounded-3xl border border-gray-100">
                        <h3 className="font-black text-gray-900 mb-6 flex items-center gap-2">
                          <UserPlus className="w-5 h-5 text-orange-500" />
                          {editingUser ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı'}
                        </h3>
                        <form onSubmit={handleSaveUser} className="space-y-4">
                          {successMessage && (
                            <div className="p-4 bg-green-50 text-green-700 rounded-2xl text-sm font-black border border-green-200 mb-6 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 shadow-sm">
                              <CheckCircle2 className="w-5 h-5" />
                              {successMessage}
                            </div>
                          )}
                          {errorMessage && (
                            <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-sm font-black border border-red-200 mb-6 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 shadow-sm">
                              <AlertCircle className="w-5 h-5" />
                              {errorMessage}
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Ad Soyad</label>
                            <input 
                              required
                              value={userDisplayName}
                              onChange={(e) => setUserDisplayName(e.target.value)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black transition-all font-medium"
                              placeholder="Ahmet Yılmaz"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1">E-posta</label>
                            <input 
                              type="email"
                              required
                              value={userEmail}
                              onChange={(e) => setUserEmail(e.target.value)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black transition-all font-medium"
                              placeholder="ahmet@mail.com"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Şifre</label>
                            <input 
                              required
                              value={userPassword}
                              onChange={(e) => setUserPassword(e.target.value)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black transition-all font-medium"
                              placeholder="Varsayılan: 1234"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Yetki</label>
                            <select 
                              value={userRole}
                              onChange={(e) => setUserRole(e.target.value as UserRole)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black transition-all font-medium"
                            >
                              <option value="user">Kullanıcı</option>
                              <option value="admin">Yönetici</option>
                            </select>
                          </div>
                          <button 
                            type="submit"
                            disabled={isSavingUser}
                            className="w-full py-3 bg-black text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {isSavingUser ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              editingUser ? 'Güncelle' : 'Kullanıcı Ekle'
                            )}
                          </button>
                          {editingUser && (
                            <button 
                              type="button"
                              onClick={resetUserForm}
                              className="w-full py-3 bg-gray-200 text-gray-600 rounded-xl font-bold transition-all"
                            >
                              Vazgeç
                            </button>
                          )}
                        </form>
                      </div>
                    </div>

                    {/* User List */}
                    <div className="lg:col-span-2">
                      <div className="space-y-3">
                        {users.map(u => (
                          <div key={u.uid} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center font-black text-gray-400 group-hover:bg-black group-hover:text-white transition-all">
                                {u.displayName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-gray-900">{u.displayName}</h4>
                                <p className="text-xs text-gray-400 font-medium">{u.email}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  setEditingUser(u);
                                  setUserEmail(u.email);
                                  setUserDisplayName(u.displayName);
                                  setUserPassword(u.password || '1234');
                                  setUserRole(u.role);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-black transition-all"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                                {u.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
                              </div>
                              <button 
                                onClick={() => handleDeleteUser(u.uid)}
                                className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* Fixed Footer Bar */}
        <footer className="fixed bottom-0 right-0 left-0 md:left-72 bg-white/80 backdrop-blur-md border-t border-gray-100 py-3 px-6 z-40">
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
      </main>
    </div>
  );
}
