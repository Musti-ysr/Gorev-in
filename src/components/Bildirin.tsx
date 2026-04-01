import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Vehicle, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Car, ShieldCheck, CalendarCheck, Trash2, Edit2, 
  X, AlertCircle, CheckCircle2, Info, User, Shield,
  CheckCircle, AlertTriangle, Download, Search
} from 'lucide-react';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { Logo } from './Logo';

interface BildirinProps {
  user: UserProfile;
}

export default function Bildirin({ user }: BildirinProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Form State
  const [plateNo, setPlateNo] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [modelYear, setModelYear] = useState('');
  const [registrationSerialNo, setRegistrationSerialNo] = useState('');
  const [owner, setOwner] = useState('');

  // User Update State
  const [updatingVehicle, setUpdatingVehicle] = useState<Vehicle | null>(null);
  const [firstInspectionDate, setFirstInspectionDate] = useState('');
  const [repeatInspectionDate, setRepeatInspectionDate] = useState('');
  const [repeatInspectionReason, setRepeatInspectionReason] = useState('');
  const [insurancePolicyDate, setInsurancePolicyDate] = useState('');
  const [insuranceAmount, setInsuranceAmount] = useState('');
  const [kaskoDate, setKaskoDate] = useState('');
  const [kaskoAmount, setKaskoAmount] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'vehicles'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Vehicle)));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'vehicles');
    });
    return () => unsubscribe();
  }, []);

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const vehicleData = {
      plateNo: plateNo.toUpperCase(),
      brand,
      model,
      modelYear,
      registrationSerialNo,
      owner,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingVehicle) {
        await updateDoc(doc(db, 'vehicles', editingVehicle.id), vehicleData);
        setSuccess('Araç başarıyla güncellendi.');
      } else {
        await addDoc(collection(db, 'vehicles'), {
          ...vehicleData,
          createdAt: new Date().toISOString(),
        });
        setSuccess('Araç başarıyla eklendi.');
      }
      setIsModalOpen(false);
      resetAdminForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, editingVehicle ? OperationType.UPDATE : OperationType.CREATE, 'vehicles');
    }
  };

  const resetAdminForm = () => {
    setPlateNo('');
    setBrand('');
    setModel('');
    setModelYear('');
    setRegistrationSerialNo('');
    setOwner('');
    setEditingVehicle(null);
  };

  const handleDeleteVehicle = async (id: string) => {
    if (confirm('Bu aracı silmek istediğinize emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'vehicles', id));
        setSuccess('Araç silindi.');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'vehicles');
      }
    }
  };

  const handleUserUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingVehicle) return;

    setError(null);

    // Validation
    if (repeatInspectionDate && !repeatInspectionReason) {
      setError('Muayene tekrarı için sebep girmek zorunludur.');
      return;
    }

    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    // Only update if changed and allowed
    if (firstInspectionDate) {
      // If not approved, or if admin, allow change
      if (!updatingVehicle.firstInspectionApproved || user.role === 'admin') {
        updateData.firstInspectionDate = firstInspectionDate;
        if (!updatingVehicle.firstInspectionDate) {
          updateData.firstInspectionEnteredBy = user.displayName;
        }
      }
    }

    if (repeatInspectionDate) {
      updateData.repeatInspectionDate = repeatInspectionDate;
      updateData.repeatInspectionReason = repeatInspectionReason;
    }

    if (insurancePolicyDate) updateData.insurancePolicyDate = insurancePolicyDate;
    if (insuranceAmount) updateData.insuranceAmount = Number(insuranceAmount);
    if (kaskoDate) updateData.kaskoDate = kaskoDate;
    if (kaskoAmount) updateData.kaskoAmount = Number(kaskoAmount);

    try {
      await updateDoc(doc(db, 'vehicles', updatingVehicle.id), updateData);
      setSuccess('Bilgiler güncellendi.');
      setUpdatingVehicle(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'vehicles');
    }
  };

  const handleApproveInspection = async (vehicle: Vehicle) => {
    if (confirm('Muayene tarihini onaylıyor musunuz? Onayladıktan sonra sadece yönetici değiştirebilir.')) {
      try {
        await updateDoc(doc(db, 'vehicles', vehicle.id), {
          firstInspectionApproved: true,
          updatedAt: new Date().toISOString()
        });
        setSuccess('Muayene tarihi onaylandı.');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'vehicles');
      }
    }
  };

  const handleExportToExcel = () => {
    const data = vehicles.map(v => ({
      'Plaka No': v.plateNo,
      'Marka': v.brand,
      'Model': v.model,
      'Model Yılı': v.modelYear || '-',
      'Ruhsat Seri No': v.registrationSerialNo || '-',
      'Araç Sahibi': v.owner || 'Belirtilmedi',
      'İlk Muayene': v.firstInspectionDate ? format(new Date(v.firstInspectionDate), 'dd.MM.yyyy') : '-',
      'Muayene Onaylı': v.firstInspectionApproved ? 'Evet' : 'Hayır',
      'Muayene Tekrar': v.repeatInspectionDate ? format(new Date(v.repeatInspectionDate), 'dd.MM.yyyy') : '-',
      'Sigorta Tarihi': v.insurancePolicyDate ? format(new Date(v.insurancePolicyDate), 'dd.MM.yyyy') : '-',
      'Sigorta Tutarı': v.insuranceAmount ? `${v.insuranceAmount} TL` : '-',
      'Kasko Tarihi': v.kaskoDate ? format(new Date(v.kaskoDate), 'dd.MM.yyyy') : '-',
      'Kasko Tutarı': v.kaskoAmount ? `${v.kaskoAmount} TL` : '-',
      'Oluşturulma': format(new Date(v.createdAt), 'dd.MM.yyyy HH:mm'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Araçlar');
    XLSX.writeFile(workbook, `Arac_Raporu_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const getInspectionStatus = (vehicle: Vehicle) => {
    const inspectionDate = vehicle.repeatInspectionDate || vehicle.firstInspectionDate;
    if (!inspectionDate) return { color: 'bg-white', text: null, textColor: 'text-gray-500' };

    const days = differenceInDays(startOfDay(new Date(inspectionDate)), startOfDay(new Date()));
    
    if (days > 30) return { color: 'bg-green-50/50 border-green-100', text: null, textColor: 'text-green-600' };
    if (days >= 15) return { color: 'bg-yellow-50/50 border-yellow-100', text: `Muayeneye son ${days} gün kaldı`, textColor: 'text-yellow-700' };
    return { color: 'bg-red-50/50 border-red-100', text: days < 0 ? 'Muayene tarihi geçti!' : `Muayeneye son ${days} gün kaldı`, textColor: 'text-red-700' };
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center select-none">
            <span className="text-4xl font-black text-blue-900 tracking-tighter">Bildir</span>
            <span className="text-4xl font-black text-orange-500 tracking-tighter mx-1">-</span>
            <span className="text-4xl font-black text-blue-900 tracking-tighter">in</span>
            <div className="ml-3 bg-blue-900 p-2 rounded-2xl shadow-lg transform -rotate-6">
              <Car className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <p className="text-gray-500 font-medium mt-1">Araç muayene, sigorta ve kasko takibi.</p>
        </div>
        {user.role === 'admin' && (
          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text"
                placeholder="Plaka ile ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all shadow-sm font-bold text-sm"
              />
            </div>
            <button 
              onClick={handleExportToExcel}
              className="bg-white text-gray-700 border border-gray-200 px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-gray-50 transition-all"
            >
              <Download className="w-5 h-5" />
              Excel Raporu Al
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Yeni Araç Tanımla
            </button>
          </div>
        )}
      </header>

      {success && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-700 font-bold"
        >
          <CheckCircle2 className="w-6 h-6" />
          {success}
        </motion.div>
      )}

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 font-bold"
        >
          <AlertCircle className="w-6 h-6" />
          {error}
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[...vehicles]
          .filter(v => v.plateNo.toLowerCase().includes(searchQuery.toLowerCase()))
          .sort((a, b) => {
            const dateA = a.repeatInspectionDate || a.firstInspectionDate;
            const dateB = b.repeatInspectionDate || b.firstInspectionDate;
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return new Date(dateA).getTime() - new Date(dateB).getTime();
          })
          .map((vehicle) => {
            const status = getInspectionStatus(vehicle);
            return (
              <motion.div
                key={vehicle.id}
                layout
                className={`${status.color} rounded-2xl p-4 border shadow-sm hover:shadow-md transition-all group relative overflow-hidden`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${status.color.includes('white') ? 'bg-gray-100' : 'bg-white/50'} rounded-xl flex items-center justify-center ${status.textColor} shrink-0`}>
                      <Car className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-gray-900 truncate">{vehicle.plateNo}</h3>
                        {vehicle.firstInspectionApproved && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 font-bold uppercase truncate">
                        {vehicle.brand} {vehicle.model} {vehicle.modelYear && `(${vehicle.modelYear})`}
                      </p>
                      {vehicle.owner && (
                        <p className="text-[10px] text-orange-600 font-black flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3" /> {vehicle.owner}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    {user.role === 'admin' && (
                      <>
                        <button 
                          onClick={() => {
                            setEditingVehicle(vehicle);
                            setPlateNo(vehicle.plateNo);
                            setBrand(vehicle.brand);
                            setModel(vehicle.model);
                            setModelYear(vehicle.modelYear || '');
                            setRegistrationSerialNo(vehicle.registrationSerialNo || '');
                            setOwner(vehicle.owner || '');
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-white/50 rounded-lg text-gray-400 hover:text-black transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteVehicle(vehicle.id)}
                          className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white/40 rounded-xl border border-gray-100/50 space-y-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <CalendarCheck className="w-3 h-3" /> Muayene
                    </p>
                    <p className={`text-xs font-bold ${status.textColor}`}>
                      {vehicle.repeatInspectionDate 
                        ? format(new Date(vehicle.repeatInspectionDate), 'dd.MM.yyyy')
                        : vehicle.firstInspectionDate 
                          ? format(new Date(vehicle.firstInspectionDate), 'dd.MM.yyyy')
                          : 'Girilmedi'}
                    </p>
                    {status.text && (
                      <p className="text-[9px] font-bold uppercase tracking-tighter leading-tight">
                        {status.text}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-white/40 rounded-xl border border-gray-100/50 space-y-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Sigorta & Kasko
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold text-gray-700 leading-tight">
                          Sigorta Bitiş: {vehicle.insurancePolicyDate ? format(new Date(vehicle.insurancePolicyDate), 'dd.MM.yyyy') : '-'}
                        </p>
                        {vehicle.insuranceAmount && (
                          <p className="text-[8px] font-medium text-gray-500 leading-tight">
                            Tutar: {vehicle.insuranceAmount.toLocaleString('tr-TR')} TL
                          </p>
                        )}
                      </div>
                      <div className="space-y-0.5 border-l border-gray-100/50 pl-2">
                        <p className="text-[9px] font-bold text-gray-700 leading-tight">
                          Kasko Bitiş: {vehicle.kaskoDate ? format(new Date(vehicle.kaskoDate), 'dd.MM.yyyy') : '-'}
                        </p>
                        {vehicle.kaskoAmount && (
                          <p className="text-[8px] font-medium text-gray-500 leading-tight">
                            Tutar: {vehicle.kaskoAmount.toLocaleString('tr-TR')} TL
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button 
                    onClick={() => {
                      setUpdatingVehicle(vehicle);
                      setFirstInspectionDate(vehicle.firstInspectionDate || '');
                      setRepeatInspectionDate(vehicle.repeatInspectionDate || '');
                      setRepeatInspectionReason(vehicle.repeatInspectionReason || '');
                      setInsurancePolicyDate(vehicle.insurancePolicyDate || '');
                      setInsuranceAmount(vehicle.insuranceAmount?.toString() || '');
                      setKaskoDate(vehicle.kaskoDate || '');
                      setKaskoAmount(vehicle.kaskoAmount?.toString() || '');
                    }}
                    className="flex-1 bg-gray-900/5 hover:bg-gray-900/10 text-gray-900 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                  >
                    <Edit2 className="w-3 h-3" />
                    Güncelle
                  </button>
                  {vehicle.firstInspectionDate && !vehicle.firstInspectionApproved && (
                    <button 
                      onClick={() => handleApproveInspection(vehicle)}
                      className="bg-green-500 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-green-600 transition-all flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Onayla
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
      </div>

      {/* Admin Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">{editingVehicle ? 'Aracı Düzenle' : 'Yeni Araç Tanımla'}</h2>
                  <p className="text-gray-500 text-sm font-medium">Araç temel bilgilerini girin.</p>
                </div>
                <button onClick={() => { setIsModalOpen(false); resetAdminForm(); }} className="p-3 hover:bg-white rounded-2xl text-gray-400 hover:text-black transition-all shadow-sm">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSaveVehicle} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Plaka No</label>
                    <input 
                      required
                      value={plateNo}
                      onChange={(e) => setPlateNo(e.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-black uppercase"
                      placeholder="34 ABC 123"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Marka</label>
                    <input 
                      required
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                      placeholder="Örn: Ford"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Model</label>
                    <input 
                      required
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                      placeholder="Örn: Focus"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">Model Yılı</label>
                      <input 
                        value={modelYear}
                        onChange={(e) => setModelYear(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                        placeholder="Örn: 2023"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">Ruhsat Seri No</label>
                      <input 
                        value={registrationSerialNo}
                        onChange={(e) => setRegistrationSerialNo(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                        placeholder="Örn: AA123456"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Araç Sahibi</label>
                    <input 
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                      placeholder="Örn: Ahmet Yılmaz"
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => { setIsModalOpen(false); resetAdminForm(); }}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                  >
                    İptal
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-black text-white rounded-2xl font-bold shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {editingVehicle ? 'Güncelle' : 'Tanımla'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Update Modal */}
      <AnimatePresence>
        {updatingVehicle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">{updatingVehicle.plateNo} - Güncelleme</h2>
                  <p className="text-gray-500 text-sm font-medium">Muayene, sigorta ve kasko bilgilerini güncelleyin.</p>
                </div>
                <button onClick={() => setUpdatingVehicle(null)} className="p-3 hover:bg-white rounded-2xl text-gray-400 hover:text-black transition-all shadow-sm">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleUserUpdate} className="p-8 space-y-8 overflow-y-auto">
                {/* Muayene Section */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-orange-600 uppercase tracking-widest flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5" />
                    Muayene Bilgileri
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">İlk Muayene Tarihi</label>
                      <input 
                        type="date"
                        disabled={updatingVehicle.firstInspectionApproved && user.role !== 'admin'}
                        value={firstInspectionDate}
                        onChange={(e) => setFirstInspectionDate(e.target.value)}
                        className={`w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold ${updatingVehicle.firstInspectionApproved && user.role !== 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      {updatingVehicle.firstInspectionApproved && user.role !== 'admin' && (
                        <p className="text-[10px] text-orange-500 font-medium mt-1 flex items-center gap-1">
                          <Info className="w-3 h-3" /> Onaylı tarih sadece yönetici tarafından değiştirilebilir.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">Muayene Tekrar Tarihi</label>
                      <input 
                        type="date"
                        value={repeatInspectionDate}
                        onChange={(e) => setRepeatInspectionDate(e.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                      />
                    </div>
                    {repeatInspectionDate && (
                      <div className="space-y-1 col-span-2">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1 flex items-center gap-1">
                          Muayene Tekrar Sebebi <AlertTriangle className="w-3 h-3 text-red-500" />
                        </label>
                        <textarea 
                          required
                          value={repeatInspectionReason}
                          onChange={(e) => setRepeatInspectionReason(e.target.value)}
                          rows={2}
                          className="w-full px-5 py-4 bg-red-50/50 border border-red-100 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none transition-all font-medium resize-none"
                          placeholder="Tekrar sebebini giriniz..."
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Sigorta & Kasko Section */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Sigorta & Kasko Bilgileri
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1">Sigorta Poliçe Tarihi</label>
                        <input 
                          type="date"
                          value={insurancePolicyDate}
                          onChange={(e) => setInsurancePolicyDate(e.target.value)}
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1">Sigorta Tutarı (TL)</label>
                        <input 
                          type="number"
                          value={insuranceAmount}
                          onChange={(e) => setInsuranceAmount(e.target.value)}
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1">Kasko Tarihi</label>
                        <input 
                          type="date"
                          value={kaskoDate}
                          onChange={(e) => setKaskoDate(e.target.value)}
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1">Kasko Tutarı (TL)</label>
                        <input 
                          type="number"
                          value={kaskoAmount}
                          onChange={(e) => setKaskoAmount(e.target.value)}
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-bold"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 shrink-0">
                  <button 
                    type="button"
                    onClick={() => setUpdatingVehicle(null)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                  >
                    İptal
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-black text-white rounded-2xl font-bold shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Bilgileri Kaydet
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
