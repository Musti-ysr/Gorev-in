import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where, doc, updateDoc, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { Task, UserProfile, TaskStatus } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardList, LogOut, CheckCircle2, Clock, 
  Calendar, Repeat, Search, Filter, CheckCircle, Circle,
  MessageSquare, Paperclip, X, Send, Archive, FileText, Car, Check, ChevronRight, Building2
} from 'lucide-react';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Logo } from './Logo';
import Bildirin from './Bildirin';
import TaxCalendar from './TaxCalendar';
import CompanyInfo from './CompanyInfo';

interface UserDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function UserDashboard({ user, onLogout }: UserDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showBildirin, setShowBildirin] = useState(false);
  const [showTaxCalendar, setShowTaxCalendar] = useState(false);
  const [showArchivedTaxCalendar, setShowArchivedTaxCalendar] = useState(false);
  const [showCompanyInfo, setShowCompanyInfo] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTaxSubMenuOpen, setIsTaxSubMenuOpen] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(collection(db, 'tasks'), where('assignedToEmails', 'array-contains', user.email));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Task));
      setTasks(taskList);
    }, (error) => {
      console.error('User task sync error:', error);
      handleFirestoreError(error, OperationType.GET, 'tasks');
    });

    return () => unsubscribe();
  }, [user.uid, user.email]);

  const handleToggleStatus = async (task: Task) => {
    if (task.status === 'pending') {
      setSelectedTask(task);
      setCompletionNote('');
      setIsNoteModalOpen(true);
      return;
    }

    const newStatus: TaskStatus = 'pending';
    
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const handleConfirmCompletion = async () => {
    if (!selectedTask || !completionNote.trim()) return;

    try {
      const newStatus: TaskStatus = 'completed';
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        status: newStatus,
        completionNote: completionNote,
        updatedAt: new Date().toISOString()
      });

      // Recurring task logic
      if (selectedTask.isRecurring) {
        let nextDueDate = new Date(selectedTask.dueDate);
        if (selectedTask.recurrenceInterval === 'daily') nextDueDate = addDays(nextDueDate, 1);
        else if (selectedTask.recurrenceInterval === 'weekly') nextDueDate = addWeeks(nextDueDate, 1);
        else if (selectedTask.recurrenceInterval === 'monthly') nextDueDate = addMonths(nextDueDate, 1);

        await addDoc(collection(db, 'tasks'), {
          title: selectedTask.title,
          description: selectedTask.description,
          assignedToEmails: selectedTask.assignedToEmails,
          status: 'pending',
          dueDate: nextDueDate.toISOString(),
          isRecurring: true,
          recurrenceInterval: selectedTask.recurrenceInterval,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      setIsNoteModalOpen(false);
      setSelectedTask(null);
      setCompletionNote('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const handleArchiveTask = async (task: Task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        isArchived: true,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const handleFileUpload = async (task: Task, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `tasks/${task.id}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const updatedAttachments = [...(task.attachments || []), { name: file.name, url, type: file.type }];
      await updateDoc(doc(db, 'tasks', task.id), {
        attachments: updatedAttachments,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    } finally {
      setIsUploading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        
        if (showArchived) {
          return matchesSearch && matchesStatus && t.isArchived === true;
        }
        
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        // Archived tasks go to the bottom
        if (a.isArchived && !b.isArchived) return 1;
        if (!a.isArchived && b.isArchived) return -1;
        // Then sort by due date
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [tasks, searchQuery, statusFilter, showArchived]);

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
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Archive className="w-6 h-6" />}
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
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mt-1">Kullanıcı Paneli</p>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Giriş Yapıldı</p>
            <p className="text-sm font-bold text-gray-800 truncate">{user.email}</p>
            <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              Aktif Oturum
            </p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button 
            onClick={() => { setSearchQuery(''); setIsMobileMenuOpen(false); setShowArchived(false); setShowBildirin(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold ${(!showArchived && !showBildirin && !showTaxCalendar && !showCompanyInfo) ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <ClipboardList className="w-5 h-5" />
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
            onClick={() => { setShowCompanyInfo(true); setShowBildirin(false); setShowArchived(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold ${showCompanyInfo ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Building2 className="w-5 h-5" />
            Şirket-in
          </button>
          <button 
            onClick={() => { setShowArchived(true); setShowBildirin(false); setShowTaxCalendar(false); setShowArchivedTaxCalendar(false); setShowCompanyInfo(false); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold ${showArchived ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Archive className="w-5 h-5" />
            Arşiv
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

      <main className="flex-1 p-4 md:p-10 overflow-x-hidden">
        {/* Welcome Message */}
        <div className="bg-white rounded-[2.5rem] p-8 mb-8 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-gray-900 leading-none">Merhaba, {user.displayName}! 👋</h2>
            <p className="text-gray-500 font-medium mt-2">
              Bugün tamamlaman gereken <span className="text-orange-600 font-bold">{tasks.filter(t => t.status === 'pending').length}</span> görev seni bekliyor.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-3xl border border-gray-100">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
              <Clock className="text-orange-500 w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Sistem Saati</p>
              <p className="text-sm font-black text-gray-900">{format(new Date(), 'HH:mm')}</p>
            </div>
          </div>
        </div>

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

        {/* Filters & Search */}
        {!showBildirin && !showTaxCalendar && (
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text"
                placeholder="Görev ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all shadow-sm font-medium"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {['all', 'pending', 'completed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as any)}
                  className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap ${statusFilter === status ? 'bg-black text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {status === 'all' ? 'Hepsi' : status === 'pending' ? 'Bekleyen' : 'Tamamlanan'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-4">
          {showBildirin ? (
            <Bildirin user={user} />
          ) : showTaxCalendar ? (
            <TaxCalendar user={user} showArchivedOnly={showArchivedTaxCalendar} />
          ) : showCompanyInfo ? (
            <CompanyInfo user={user} />
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center gap-6 group ${task.status === 'completed' ? 'opacity-75' : ''}`}
                >
                  <button 
                    onClick={() => handleToggleStatus(task)}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 ${task.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-gray-50 text-gray-300 hover:bg-black hover:text-white'}`}
                  >
                    {task.status === 'completed' ? <CheckCircle className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${task.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {task.status === 'completed' ? 'Tamamlandı' : 'Bekliyor'}
                      </span>
                      {task.isRecurring && (
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          Tekrarlı
                        </span>
                      )}
                    </div>
                    <h3 className={`text-xl font-bold text-gray-900 leading-tight ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                      {task.title}
                    </h3>
                    <p className="text-gray-500 text-sm mt-1 font-medium">{task.description}</p>
                    
                    {task.completionNote && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          Tamamlama Notu
                        </p>
                        <p className="text-xs text-gray-700 font-medium italic">"{task.completionNote}"</p>
                      </div>
                    )}

                    {task.attachments && task.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {task.attachments.map((file, idx) => (
                          <a 
                            key={idx}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all"
                          >
                            <FileText className="w-3 h-3" />
                            {file.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col md:items-end gap-4 shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-tighter">Bitiş Tarihi</span>
                      </div>
                      <p className={`text-sm font-black ${new Date(task.dueDate) < new Date() && task.status === 'pending' ? 'text-red-500' : 'text-gray-900'}`}>
                        {format(new Date(task.dueDate), 'dd MMMM yyyy, HH:mm', { locale: tr })}
                      </p>
                    </div>

                    {!showArchived && (
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer p-3 bg-gray-50 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-xl transition-all relative">
                          <Paperclip className="w-5 h-5" />
                          <input 
                            type="file" 
                            className="hidden" 
                            onChange={(e) => handleFileUpload(task, e)}
                            disabled={isUploading}
                          />
                        </label>
                        {task.status === 'completed' && (
                          <button 
                            onClick={() => handleArchiveTask(task)}
                            className="p-3 bg-gray-50 hover:bg-orange-50 text-gray-400 hover:text-orange-600 rounded-xl transition-all"
                            title="Arşive Gönder"
                          >
                            <Archive className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-gray-200">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="text-gray-300 w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Görev Bulunamadı</h3>
                <p className="text-gray-500 font-medium">Seçilen kriterlere uygun görev bulunmuyor.</p>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
      </main>

      <footer className="md:ml-72 bg-white/80 backdrop-blur-md border-t border-gray-100 py-3 px-6 z-40">
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

      {/* Note Modal */}
      <AnimatePresence>
        {isNoteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">Görevi Tamamla</h2>
                  <p className="text-gray-500 text-sm font-medium">Lütfen görevle ilgili bir not bırakın.</p>
                </div>
                <button onClick={() => setIsNoteModalOpen(false)} className="p-3 hover:bg-white rounded-2xl text-gray-400 hover:text-black transition-all shadow-sm">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Tamamlama Notu (Zorunlu)</label>
                  <textarea 
                    required
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-medium min-h-[120px]"
                    placeholder="Görevi nasıl tamamladığınızı kısaca açıklayın..."
                  />
                </div>

                <button 
                  onClick={handleConfirmCompletion}
                  disabled={!completionNote.trim()}
                  className="w-full py-4 bg-black text-white rounded-2xl font-black shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Send className="w-5 h-5" />
                  Görevi Onayla ve Tamamla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
