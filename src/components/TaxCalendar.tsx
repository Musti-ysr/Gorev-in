import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, addDoc, getDocs, where, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TaxEntry, TaxCalendarSettings, TaxSubmission, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  Calendar, RefreshCw, CheckCircle2, Circle, 
  AlertCircle, ChevronRight, Filter, Search,
  Check, Info, Clock, ShieldCheck,
  Plus, X, Edit2, Trash2, FileSpreadsheet, DollarSign
} from 'lucide-react';
import { format, addMonths, setDate } from 'date-fns';
import { tr } from 'date-fns/locale';

interface TaxCalendarProps {
  user: UserProfile;
  showArchivedOnly?: boolean;
}

export default function TaxCalendar({ user, showArchivedOnly = false }: TaxCalendarProps) {
  const [entries, setEntries] = useState<TaxEntry[]>([]);
  const [settings, setSettings] = useState<TaxCalendarSettings | null>(null);
  const [submissions, setSubmissions] = useState<TaxSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showArchivedView, setShowArchivedView] = useState(showArchivedOnly);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TaxEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState<Partial<TaxEntry>>({
    type: '',
    declarationDeadline: format(new Date(), 'yyyy-MM-dd'),
    paymentDeadline: format(new Date(), 'yyyy-MM-dd'),
    isRecurring: false,
    frequency: 'monthly',
    dayOfMonth: 28,
    isArchived: false,
    period: format(new Date(), 'yyyy-MM')
  });
  
  // Submission Form State
  const [isSubmissionModalOpen, setIsSubmissionModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TaxEntry | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [isDeclared, setIsDeclared] = useState(false);
  const [shouldArchive, setShouldArchive] = useState(true);

  useEffect(() => {
    setShowArchivedView(showArchivedOnly);
  }, [showArchivedOnly]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch entries
    const qEntries = query(collection(db, 'taxCalendarEntries'));
    const unsubscribeEntries = onSnapshot(qEntries, (snapshot) => {
      const entryList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TaxEntry));
      setEntries(entryList);
    }, (error) => {
      console.error('Tax entries sync error:', error);
      handleFirestoreError(error, OperationType.GET, 'taxCalendarEntries');
    });

    // Fetch settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'taxCalendar'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as TaxCalendarSettings);
      }
    }, (error) => {
      console.error('Tax settings sync error:', error);
      handleFirestoreError(error, OperationType.GET, 'settings/taxCalendar');
    });

    // Fetch user submissions
    const qSubmissions = user.role === 'admin' 
      ? query(collection(db, 'taxSubmissions'))
      : query(collection(db, 'taxSubmissions'), where('userId', '==', user.uid));
      
    const unsubscribeSubmissions = onSnapshot(qSubmissions, (snapshot) => {
      const submissionList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TaxSubmission));
      setSubmissions(submissionList);
      setLoading(false);
    }, (error) => {
      console.error('Tax submissions sync error:', error);
      handleFirestoreError(error, OperationType.GET, 'taxSubmissions');
    });

    return () => {
      unsubscribeEntries();
      unsubscribeSettings();
      unsubscribeSubmissions();
    };
  }, [user.uid, user.role]);

  const handleToggleSelection = async (taxType: string) => {
    if (user.role !== 'admin') return;
    
    const currentSelected = settings?.selectedTaxTypes || [];
    const newSelected = currentSelected.includes(taxType)
      ? currentSelected.filter(t => t !== taxType)
      : [...currentSelected, taxType];
      
    try {
      await setDoc(doc(db, 'settings', 'taxCalendar'), {
        selectedTaxTypes: newSelected,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/taxCalendar');
    }
  };

  const handleOpenSubmission = (entry: TaxEntry) => {
    const period = format(new Date(entry.declarationDeadline), 'yyyy-MM');
    const existing = submissions.find(s => s.taxType === entry.type && s.period === period);
    setSelectedEntry(entry);
    setAmount(existing?.amount?.toString() || '');
    setIsDeclared(existing?.isDeclared || false);
    setIsSubmissionModalOpen(true);
  };

  const handleSaveSubmission = async () => {
    if (!selectedEntry || !auth.currentUser) return;
    
    const period = selectedEntry.period;
    const existing = submissions.find(s => s.taxType === selectedEntry.type && s.period === period);
    
    const submissionData = {
      userId: user.uid,
      taxType: selectedEntry.type,
      period: period,
      isSubmitted: !!amount && parseFloat(amount) > 0,
      isDeclared: isDeclared,
      amount: amount ? parseFloat(amount) : 0,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      const batch = writeBatch(db);

      // Save submission
      if (existing) {
        batch.update(doc(db, 'taxSubmissions', existing.id), submissionData);
      } else {
        const newSubRef = doc(collection(db, 'taxSubmissions'));
        batch.set(newSubRef, submissionData);
      }

      // Archive current entry if requested
      if (shouldArchive && isDeclared && submissionData.isSubmitted) {
        batch.update(doc(db, 'taxCalendarEntries', selectedEntry.id), {
          isArchived: true,
          archivedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // If recurring, create next period's entry
        if (selectedEntry.isRecurring) {
          const currentDeadline = new Date(selectedEntry.declarationDeadline);
          let nextDeadline: Date;

          switch (selectedEntry.frequency) {
            case 'quarterly':
              nextDeadline = addMonths(currentDeadline, 3);
              break;
            case 'yearly':
              nextDeadline = addMonths(currentDeadline, 12);
              break;
            case 'monthly':
            default:
              nextDeadline = addMonths(currentDeadline, 1);
              break;
          }

          // Ensure the day of month is correct
          if (selectedEntry.dayOfMonth) {
            nextDeadline = setDate(nextDeadline, selectedEntry.dayOfMonth);
          }

          const nextPeriod = format(nextDeadline, 'yyyy-MM');
          
          // Find if an entry for this type and period already exists
          const existingNext = entries.find(e => e.type === selectedEntry.type && e.period === nextPeriod);
          
          if (existingNext) {
            batch.update(doc(db, 'taxCalendarEntries', existingNext.id), {
              isArchived: false,
              archivedAt: null,
              updatedAt: new Date().toISOString()
            });
          } else {
            const nextId = `manual_${selectedEntry.type}_${nextPeriod}`;
            batch.set(doc(db, 'taxCalendarEntries', nextId), {
              ...selectedEntry,
              id: nextId,
              declarationDeadline: format(nextDeadline, 'yyyy-MM-dd'),
              paymentDeadline: format(nextDeadline, 'yyyy-MM-dd'),
              period: nextPeriod,
              isArchived: false,
              archivedAt: null,
              updatedAt: new Date().toISOString()
            });
          }
        }
      }

      await batch.commit();
      setIsSubmissionModalOpen(false);
      setSelectedEntry(null);
      setAmount('');
      setIsDeclared(false);
      setShouldArchive(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'taxSubmissions');
    }
  };

  const handleSaveManualEntry = async () => {
    let finalDeclarationDeadline = manualEntry.declarationDeadline;
    let finalPaymentDeadline = manualEntry.paymentDeadline;

    if (manualEntry.isRecurring && manualEntry.dayOfMonth) {
      const date = new Date(manualEntry.declarationDeadline || new Date());
      const updatedDate = setDate(date, manualEntry.dayOfMonth);
      finalDeclarationDeadline = format(updatedDate, 'yyyy-MM-dd');
      finalPaymentDeadline = format(updatedDate, 'yyyy-MM-dd');
    }

    if (!manualEntry.type || !finalDeclarationDeadline || !finalPaymentDeadline) {
      alert('Lütfen tüm alanları doldurun.');
      return;
    }

    try {
      const period = format(new Date(finalDeclarationDeadline!), 'yyyy-MM');
      const entryId = editingEntry?.id || `manual_${manualEntry.type}_${period}`;
      
      const finalEntry = {
        ...manualEntry,
        declarationDeadline: finalDeclarationDeadline,
        paymentDeadline: finalPaymentDeadline,
        id: entryId,
        period,
        isArchived: false,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'taxCalendarEntries', entryId), finalEntry);
      
      // Auto-select the new type for the admin
      const currentSelected = settings?.selectedTaxTypes || [];
      if (!currentSelected.includes(manualEntry.type!)) {
        await setDoc(doc(db, 'settings', 'taxCalendar'), {
          selectedTaxTypes: [...currentSelected, manualEntry.type],
          updatedAt: new Date().toISOString()
        });
      }

      setIsManualModalOpen(false);
      setEditingEntry(null);
      setManualEntry({
        type: '',
        declarationDeadline: format(new Date(), 'yyyy-MM-dd'),
        paymentDeadline: format(new Date(), 'yyyy-MM-dd'),
        isRecurring: false,
        frequency: 'monthly',
        dayOfMonth: 28,
        isArchived: false,
        period: format(new Date(), 'yyyy-MM')
      });
      alert(editingEntry ? 'Vergi kartı güncellendi.' : 'Yeni vergi türü başarıyla eklendi.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'taxCalendarEntries');
    }
  };

  const handlePermanentDelete = async (entryId: string) => {
    try {
      await deleteDoc(doc(db, 'taxCalendarEntries', entryId));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'taxCalendarEntries');
    }
  };

  const handleArchiveEntry = async (entryId: string) => {
    try {
      await updateDoc(doc(db, 'taxCalendarEntries', entryId), {
        isArchived: true,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'taxCalendarEntries');
    }
  };

  const handleUnarchiveEntry = async (entryId: string) => {
    try {
      await updateDoc(doc(db, 'taxCalendarEntries', entryId), {
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date().toISOString()
      });
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'taxCalendarEntries');
    }
  };

  const handleEditEntry = (entry: TaxEntry) => {
    setEditingEntry(entry);
    setManualEntry({
      type: entry.type,
      declarationDeadline: entry.declarationDeadline,
      paymentDeadline: entry.paymentDeadline,
      isRecurring: entry.isRecurring || false,
      frequency: entry.frequency || 'monthly',
      dayOfMonth: entry.dayOfMonth || 28,
      isArchived: entry.isArchived || false,
      period: entry.period
    });
    setIsManualModalOpen(true);
  };

  const uniqueTypes = useMemo(() => {
    const filteredForView = entries.filter(e => showArchivedView ? e.isArchived : !e.isArchived);
    const types = Array.from(new Set(filteredForView.map(e => e.type)));
    return types.sort();
  }, [entries, showArchivedView]);

  const filteredEntries = useMemo(() => {
    return entries
      .filter(e => {
        if (showArchivedView) {
          if (!e.isArchived) return false;
          // Only show in archive if it has a submission or was explicitly archived (deleted)
          const hasSubmission = submissions.some(s => s.taxType === e.type && s.period === e.period && s.isSubmitted);
          if (!hasSubmission && !e.archivedAt) return false;
        } else {
          if (e.isArchived) return false;
        }
        
        const matchesSearch = e.type.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = selectedType ? e.type === selectedType : true;
        
        return matchesSearch && matchesType;
      })
      .sort((a, b) => new Date(a.declarationDeadline).getTime() - new Date(b.declarationDeadline).getTime());
  }, [entries, submissions, searchQuery, selectedType, showArchivedView]);

  const upcomingDeadlinesByType = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Today at midnight
    const map: Record<string, TaxEntry> = {};
    
    entries.forEach(entry => {
      if (entry.isArchived) return;
      const deadline = new Date(entry.declarationDeadline);
      deadline.setHours(0, 0, 0, 0);
      
      if (deadline >= now) {
        if (!map[entry.type] || deadline < new Date(map[entry.type].declarationDeadline)) {
          map[entry.type] = entry;
        }
      }
    });
    
    return map;
  }, [entries]);

  const handleExportReport = () => {
    if (filteredEntries.length === 0) return;

    const reportData = filteredEntries.map(entry => {
      const submission = submissions.find(s => s.taxType === entry.type && s.period === entry.period);
      return {
        'Vergi Türü': entry.type,
        'Dönem': entry.period,
        'Beyan Son': entry.declarationDeadline,
        'Ödeme Son': entry.paymentDeadline,
        'Durum': submission?.isSubmitted ? 'Beyan Edildi' : 'Bekliyor',
        'Tutar': submission?.amount ? `${submission.amount} TL` : '0 TL'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vergi Raporu');
    
    // Generate buffer and download
    XLSX.writeFile(workbook, `Vergi_Raporu_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Calendar className="text-orange-500 w-7 h-7" />
            Takvim-in
          </h2>
          <p className="text-gray-500 font-medium text-sm mt-1">
            Vergi takviminizi takip edin ve beyannamelerinizi yönetin.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {user.role === 'admin' && (
            <button 
              onClick={() => setIsManualModalOpen(true)}
              className="bg-black text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-5 h-5 text-orange-500" />
              Vergi Kartı Aç
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text"
              placeholder="Vergi türü ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all shadow-sm font-medium"
            />
          </div>
          <div className="flex gap-2">
            {filteredEntries.length > 0 && (
              <button
                onClick={handleExportReport}
                className="px-6 py-4 bg-green-600 text-white rounded-2xl font-bold shadow-sm hover:bg-green-700 transition-all flex items-center gap-2"
              >
                <FileSpreadsheet className="w-5 h-5" />
                Rapor Al (.XLSX)
              </button>
            )}
            {selectedType && (
              <button
                onClick={() => setSelectedType(null)}
                className="px-6 py-4 bg-gray-900 text-white rounded-2xl font-bold shadow-sm hover:bg-black transition-all flex items-center gap-2"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
                Tüm Türler
              </button>
            )}
          </div>
        </div>

        {/* Tax Type Selector (Master Cards) */}
        {!selectedType && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {uniqueTypes
              .filter(type => type.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(type => {
                const isSelected = settings?.selectedTaxTypes?.includes(type);
                const upcoming = upcomingDeadlinesByType[type];
                
                return (
                  <motion.button
                    key={type}
                    layout
                    onClick={() => setSelectedType(type)}
                    className={`p-4 rounded-2xl border transition-all text-left flex flex-col justify-between gap-2 h-full ${isSelected ? 'bg-white border-orange-200 shadow-sm' : 'bg-gray-50/50 border-gray-100 opacity-60 hover:opacity-100'}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] font-black text-gray-900 uppercase leading-tight line-clamp-2">
                        {type}
                      </span>
                      {user.role === 'admin' && (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelection(type);
                            }}
                            className={`p-1 rounded-lg transition-all ${isSelected ? 'text-orange-500' : 'text-gray-300'}`}
                          >
                            {isSelected ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                          </button>
                          {upcoming && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditEntry(upcoming);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-500 transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {upcoming && (
                      <div className="mt-2 grid grid-cols-2 gap-2 bg-orange-50/50 p-2 rounded-xl border border-orange-100/50">
                        <div>
                          <span className="text-[7px] font-bold text-orange-400 uppercase block leading-none mb-0.5">Beyan Son</span>
                          <span className="text-[10px] font-black text-orange-600 leading-none">
                            {format(new Date(upcoming.declarationDeadline), 'dd.MM')}
                          </span>
                        </div>
                        <div className="border-l border-orange-100 pl-2">
                          <span className="text-[7px] font-bold text-orange-400 uppercase block leading-none mb-0.5">Ödeme Son</span>
                          <span className="text-[10px] font-black text-orange-600 leading-none">
                            {format(new Date(upcoming.paymentDeadline), 'dd.MM')}
                          </span>
                        </div>
                      </div>
                    )}
                  </motion.button>
                );
              })}
          </div>
        )}
      </div>

      {/* Grid */}
      {selectedType && (
        <div className="bg-gray-50/50 p-6 rounded-[2.5rem] border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
              <ShieldCheck className="text-orange-500 w-6 h-6" />
              {selectedType} - Beyanname Listesi
            </h3>
            <span className="text-xs font-bold text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-100">
              {filteredEntries.length} Kayıt
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredEntries.map((entry, idx) => {
                const isSelected = settings?.selectedTaxTypes?.includes(entry.type);
                const submission = submissions.find(s => s.taxType === entry.type && s.period === format(new Date(entry.declarationDeadline), 'yyyy-MM'));
                
                return (
                  <motion.div
                    key={`${entry.type}_${entry.declarationDeadline}`}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden ${isSelected ? 'ring-2 ring-orange-500/20' : ''}`}
                  >
                    {/* Status Bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${submission?.isSubmitted && submission?.isDeclared ? 'bg-green-500' : submission?.isDeclared || submission?.isSubmitted ? 'bg-amber-500' : 'bg-gray-300'}`} />
                    
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md uppercase">
                            {format(new Date(entry.declarationDeadline), 'MMMM yyyy', { locale: tr })}
                          </span>
                          <div className="flex items-center gap-1">
                            {submission?.isDeclared && (
                              <div className="bg-blue-50 p-1 rounded-md" title="Beyan Edildi">
                                <Check className="w-3 h-3 text-blue-600" />
                              </div>
                            )}
                            {submission?.isSubmitted && (
                              <div className="bg-green-50 p-1 rounded-md" title="Ödendi">
                                <Check className="w-3 h-3 text-green-600" />
                              </div>
                            )}
                          </div>
                          {user.role === 'admin' && (
                            <div className="flex items-center gap-1 ml-auto">
                              <button 
                                onClick={() => handleEditEntry(entry)}
                                className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setDeletingId(entry.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <h3 className="text-sm font-black text-gray-900 leading-tight line-clamp-2 uppercase tracking-tight">
                          {entry.type}
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Beyan Son:</span>
                        </div>
                        <span className="text-xs font-black text-gray-700">
                          {format(new Date(entry.declarationDeadline), 'dd.MM.yyyy')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ödeme Son:</span>
                        </div>
                        <span className="text-xs font-black text-gray-700">
                          {format(new Date(entry.paymentDeadline), 'dd.MM.yyyy')}
                        </span>
                      </div>
                    </div>

                    {submission?.isDeclared || submission?.isSubmitted ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {submission.isDeclared ? <Check className="w-3.5 h-3.5 text-blue-600" /> : <Info className="w-3.5 h-3.5 text-gray-400" />}
                              <span className={`text-[9px] font-black uppercase tracking-widest ${submission.isDeclared ? 'text-blue-700' : 'text-gray-500'}`}>Beyan</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {submission.isSubmitted ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Info className="w-3.5 h-3.5 text-gray-400" />}
                              <span className={`text-[9px] font-black uppercase tracking-widest ${submission.isSubmitted ? 'text-green-700' : 'text-gray-500'}`}>Ödeme</span>
                            </div>
                          </div>
                          {submission.isSubmitted && (
                            <div className="mt-1 pt-1 border-top border-gray-200 text-right">
                              <span className="text-xs font-black text-gray-800">
                                {submission.amount?.toLocaleString('tr-TR')} TL
                              </span>
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => handleOpenSubmission(entry)}
                          className="text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-all text-center uppercase tracking-widest"
                        >
                          Düzenle
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleOpenSubmission(entry)}
                        className="w-full py-3 bg-gray-50 hover:bg-black hover:text-white text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <Info className="w-4 h-4" />
                        Beyan/Ödeme İşlemi
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {!selectedType && (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
          <Calendar className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-black text-gray-400 uppercase tracking-widest">Vergi Türü Seçin</h3>
          <p className="text-gray-400 text-sm font-medium">Detayları görmek için yukarıdaki kartlardan birine tıklayın.</p>
        </div>
      )}

      {/* Manual Entry Modal */}
      <AnimatePresence>
        {isManualModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight leading-tight">
                    {editingEntry ? 'Vergi Kartını Düzenle' : 'Yeni Vergi Kartı'}
                  </h2>
                  <p className="text-gray-500 text-sm font-medium mt-1">
                    {editingEntry ? 'Mevcut vergi tarihlerini güncelleyin.' : 'Özel bir vergi türü ve tarihleri tanımlayın.'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setIsManualModalOpen(false);
                    setEditingEntry(null);
                  }} 
                  className="p-2 hover:bg-gray-200 rounded-full transition-all"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Vergi Türü Adı</label>
                  <input 
                    type="text"
                    value={manualEntry.type}
                    onChange={(e) => setManualEntry({ ...manualEntry, type: e.target.value })}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-bold"
                    placeholder="Örn: Katma Değer Vergisi"
                  />
                </div>

                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                  <input 
                    type="checkbox"
                    id="isRecurring"
                    checked={manualEntry.isRecurring}
                    onChange={(e) => setManualEntry({ ...manualEntry, isRecurring: e.target.checked })}
                    className="w-5 h-5 accent-orange-500"
                  />
                  <label htmlFor="isRecurring" className="text-sm font-bold text-orange-900 cursor-pointer">
                    Tekrarlayan Vergi (Otomatik Yeni Dönem Aç)
                  </label>
                </div>

                {manualEntry.isRecurring && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Tekrarlama Sıklığı</label>
                      <select 
                        value={manualEntry.frequency}
                        onChange={(e) => setManualEntry({ ...manualEntry, frequency: e.target.value as any })}
                        className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-bold text-sm"
                      >
                        <option value="monthly">Her Ay</option>
                        <option value="quarterly">3 Ayda Bir</option>
                        <option value="yearly">Yılda Bir</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Başlangıç Ayı</label>
                      <input 
                        type="month"
                        value={manualEntry.period}
                        onChange={(e) => {
                          const period = e.target.value;
                          const [year, month] = period.split('-').map(Number);
                          const date = new Date(year, month - 1, manualEntry.dayOfMonth || 28);
                          setManualEntry({ 
                            ...manualEntry, 
                            period,
                            declarationDeadline: format(date, 'yyyy-MM-dd'),
                            paymentDeadline: format(date, 'yyyy-MM-dd')
                          });
                        }}
                        className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-bold text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">
                      {manualEntry.isRecurring ? 'Ayın Kaçıncı Günü?' : 'Beyan Son Günü'}
                    </label>
                    {manualEntry.isRecurring ? (
                      <input 
                        type="number"
                        min="1"
                        max="31"
                        value={manualEntry.dayOfMonth}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          const date = new Date(manualEntry.declarationDeadline || new Date());
                          const updatedDate = setDate(date, val);
                          setManualEntry({ 
                            ...manualEntry, 
                            dayOfMonth: val,
                            declarationDeadline: format(updatedDate, 'yyyy-MM-dd'),
                            paymentDeadline: format(updatedDate, 'yyyy-MM-dd')
                          });
                        }}
                        className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-bold text-sm"
                      />
                    ) : (
                      <input 
                        type="date"
                        value={manualEntry.declarationDeadline}
                        onChange={(e) => setManualEntry({ ...manualEntry, declarationDeadline: e.target.value })}
                        className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-bold text-sm"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">
                      {manualEntry.isRecurring ? 'Ödeme Günü (Aynı Gün)' : 'Ödeme Son Günü'}
                    </label>
                    <input 
                      type={manualEntry.isRecurring ? "text" : "date"}
                      readOnly={manualEntry.isRecurring}
                      value={manualEntry.isRecurring ? manualEntry.dayOfMonth : manualEntry.paymentDeadline}
                      onChange={(e) => !manualEntry.isRecurring && setManualEntry({ ...manualEntry, paymentDeadline: e.target.value })}
                      className={`w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-bold text-sm ${manualEntry.isRecurring ? 'opacity-50' : ''}`}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => {
                      setIsManualModalOpen(false);
                      setEditingEntry(null);
                    }}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                  >
                    İptal
                  </button>
                  <button 
                    onClick={handleSaveManualEntry}
                    className="flex-[2] py-4 bg-black text-white rounded-2xl font-black shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {editingEntry ? 'Değişiklikleri Kaydet' : 'Kartı Oluştur'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submission Modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">
                Vergi Kaydı İşlemi
              </h3>
              <p className="text-gray-500 text-sm font-medium mb-8">
                Bu kayıt için ne yapmak istersiniz?
              </p>
              
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={showArchivedView ? () => handleUnarchiveEntry(deletingId) : () => handleArchiveEntry(deletingId)}
                    className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${showArchivedView ? 'bg-orange-500 shadow-orange-200 hover:bg-orange-600' : 'bg-amber-500 shadow-amber-200 hover:bg-amber-600'}`}
                  >
                    {showArchivedView ? 'Aktife Al' : 'Arşive At'}
                  </button>
                  <button 
                    onClick={() => handlePermanentDelete(deletingId)}
                    className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200 hover:bg-red-600"
                  >
                    Tamamen Sil
                  </button>
                </div>
                <button 
                  onClick={() => setDeletingId(null)}
                  className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submission Modal */}
      <AnimatePresence>
        {isSubmissionModalOpen && selectedEntry && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight leading-tight">
                  {selectedEntry.type}
                </h2>
                <p className="text-gray-500 text-sm font-medium mt-1">Beyan ve ödeme tutarını girin.</p>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isDeclared ? 'bg-blue-500 text-white' : 'bg-white text-blue-500'}`}>
                        <Check className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-blue-900 uppercase tracking-tight">Beyanname Oluşturuldu</p>
                        <p className="text-[10px] font-bold text-blue-700 uppercase">Beyan işlemini onaylayın</p>
                      </div>
                    </div>
                    <input 
                      type="checkbox"
                      checked={isDeclared}
                      onChange={(e) => setIsDeclared(e.target.checked)}
                      className="w-6 h-6 rounded-lg border-blue-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Ödeme Tutarı (Opsiyonel)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input 
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black transition-all font-black text-xl"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </div>

                {isDeclared && amount && parseFloat(amount) > 0 && (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <input 
                      type="checkbox"
                      id="shouldArchive"
                      checked={shouldArchive}
                      onChange={(e) => setShouldArchive(e.target.checked)}
                      className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor="shouldArchive" className="text-sm font-bold text-amber-900 cursor-pointer">
                      İşlemler tamamlandı, kartı arşive gönder
                    </label>
                  </div>
                )}

                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsSubmissionModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                  >
                    İptal
                  </button>
                  <button 
                    onClick={handleSaveSubmission}
                    className="flex-[2] py-4 bg-black text-white rounded-2xl font-black shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Kaydet ve Onayla
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
