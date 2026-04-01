import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../firebase';
import { CompanyInfo as CompanyInfoType, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { 
  Building2, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Check, 
  Phone, 
  Mail, 
  MapPin, 
  User, 
  FileText, 
  Hash,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CompanyInfoProps {
  user: UserProfile;
}

const CompanyInfo: React.FC<CompanyInfoProps> = ({ user }) => {
  const [companies, setCompanies] = useState<CompanyInfoType[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<CompanyInfoType | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    taxNo: '',
    sgkNo: '',
    name: '',
    address: '',
    phone: '',
    email: '',
    signatory: ''
  });

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    console.log('CompanyInfo mounted, user:', user, 'Firestore DB:', db);
    const q = query(collection(db, 'companies'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const companyList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CompanyInfoType[];
      setCompanies(companyList);
    }, (error) => {
      console.error('Firestore Snapshot Error:', error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleOpenModal = (company?: CompanyInfoType) => {
    setSaveError(null);
    if (company) {
      setEditingCompany(company);
      setFormData({
        title: company.title || '',
        taxNo: company.taxNo || '',
        sgkNo: company.sgkNo || '',
        name: company.name || '',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        signatory: company.signatory || ''
      });
    } else {
      setEditingCompany(null);
      setFormData({
        title: '',
        taxNo: '',
        sgkNo: '',
        name: '',
        address: '',
        phone: '',
        email: '',
        signatory: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    
    // Manual Validation
    if (!formData.name.trim()) {
      setSaveError('Şirket Adı gereklidir.');
      return;
    }
    if (!formData.title.trim()) {
      setSaveError('Şirket Ünvanı gereklidir.');
      return;
    }
    if (!formData.taxNo.trim()) {
      setSaveError('Vergi No gereklidir.');
      return;
    }

    setIsSaving(true);
    
    console.log('Submitting company form...', { 
      isAdmin, 
      userRole: user.role,
      userEmail: user.email,
      formData 
    });
    
    if (!isAdmin) {
      console.error('Save failed: User is not an admin. Role is:', user.role);
      setSaveError('Bu işlem için yetkiniz yok. (Rolünüz: ' + user.role + ')');
      setIsSaving(false);
      return;
    }

    const data = {
      ...formData,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingCompany) {
        console.log('Attempting to update company:', editingCompany.id, data);
        await updateDoc(doc(db, 'companies', editingCompany.id), data);
      } else {
        console.log('Attempting to add new company:', data);
        await addDoc(collection(db, 'companies'), {
          ...data,
          createdAt: new Date().toISOString()
        });
      }
      console.log('Company saved successfully');
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Error saving company:', error);
      setSaveError('Kaydedilirken bir hata oluştu: ' + (error.message || 'Bilinmeyen hata'));
      try { handleFirestoreError(error, editingCompany ? OperationType.UPDATE : OperationType.CREATE, editingCompany ? `companies/${editingCompany.id}` : 'companies'); } catch (e) {}
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || !window.confirm('Bu şirket kartını silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'companies', id));
    } catch (error) {
      console.error('Error deleting company:', error);
      try { handleFirestoreError(error, OperationType.DELETE, `companies/${id}`); } catch (e) {}
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center select-none">
            <span className="text-4xl font-black text-blue-900 tracking-tighter">Şirket</span>
            <span className="text-4xl font-black text-orange-500 tracking-tighter mx-1">-</span>
            <span className="text-4xl font-black text-blue-900 tracking-tighter">in</span>
            <div className="ml-3 bg-blue-900 p-2 rounded-2xl shadow-lg transform -rotate-6">
              <Building2 className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <p className="text-gray-500 font-medium mt-1">Şirket künye kartları ve resmi bilgiler.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => handleOpenModal()}
            className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Yeni Şirket Tanımla
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {companies.map((company) => (
          <motion.div
            key={company.id}
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => handleOpenModal(company)}
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-lg transition-all group relative overflow-hidden flex items-center gap-4 cursor-pointer"
          >
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-blue-900 group-hover:text-white transition-colors">
              <Building2 className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight truncate">
                {company.name}
              </h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate mt-0.5">
                {company.title}
              </p>
            </div>

            <div className="hidden lg:grid grid-cols-2 gap-x-8 gap-y-1 px-6 border-l border-gray-100 shrink-0">
              <div>
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Vergi No</p>
                <p className="text-[11px] font-black text-gray-900 mt-0.5">{company.taxNo}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Telefon</p>
                <p className="text-[11px] font-black text-gray-900 mt-0.5">{company.phone}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              {isAdmin && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(company.id);
                  }}
                  className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-all">
                <Edit2 className="w-4 h-4" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight leading-tight">
                    {editingCompany ? 'ŞİRKETİ DÜZENLE' : 'YENİ ŞİRKET EKLE'}
                  </h2>
                  <p className="text-gray-500 text-sm font-medium mt-1 uppercase tracking-widest">Şirket künye bilgilerini girin.</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-3 hover:bg-gray-100 rounded-2xl transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} noValidate className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                {saveError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold animate-pulse">
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                    {saveError}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Şirket Adı</label>
                    <input 
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold"
                      placeholder="Örn: ABC Teknoloji"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Şirket Ünvanı</label>
                    <input 
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold"
                      placeholder="Örn: ABC Teknoloji A.Ş."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Vergi No</label>
                    <input 
                      type="text"
                      value={formData.taxNo}
                      onChange={(e) => setFormData({...formData, taxNo: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">SGK Sicil No</label>
                    <input 
                      type="text"
                      value={formData.sgkNo}
                      onChange={(e) => setFormData({...formData, sgkNo: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">İmza Yetkilisi</label>
                    <input 
                      type="text"
                      value={formData.signatory}
                      onChange={(e) => setFormData({...formData, signatory: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Telefon No</label>
                    <input 
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mail Adresi</label>
                    <input 
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Adres</label>
                    <textarea 
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-bold min-h-[100px] resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all uppercase tracking-widest text-sm"
                  >
                    İptal
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className={`flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-bold shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest text-sm ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {isSaving ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                    {isSaving ? 'KAYDEDİLİYOR...' : (editingCompany ? 'GÜNCELLE' : 'KAYDET')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompanyInfo;
