export type UserRole = 'admin' | 'user';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  password?: string; // Stored as plain text per user request for admin management
}

export type TaskStatus = 'pending' | 'completed';
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'none';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedToEmails: string[];
  status: TaskStatus;
  dueDate: string; // ISO string
  isRecurring: boolean;
  recurrenceInterval: RecurrenceInterval;
  createdAt: string;
  updatedAt: string;
  completionNote?: string;
  isArchived?: boolean;
  archivedAt?: string;
  attachments?: { name: string; url: string; type: string }[];
}

export interface Vehicle {
  id: string;
  plateNo: string;
  brand: string;
  model: string;
  modelYear?: string;
  registrationSerialNo?: string;
  owner?: string;
  
  // Inspection (Muayene)
  firstInspectionDate?: string;
  firstInspectionEnteredBy?: string; // Name
  firstInspectionApproved?: boolean;
  
  repeatInspectionDate?: string;
  repeatInspectionReason?: string;
  
  // Insurance (Sigorta)
  insurancePolicyDate?: string;
  insuranceAmount?: number;
  
  // Kasko
  kaskoDate?: string;
  kaskoAmount?: number;
  
  createdAt: string;
  updatedAt: string;
}

export interface TaxCalendarSettings {
  selectedTaxTypes: string[];
  updatedAt: string;
}

export interface TaxSubmission {
  id: string;
  userId: string;
  taxType: string;
  period: string; // e.g., 2026-03
  isSubmitted: boolean;
  isDeclared?: boolean;
  amount?: number;
  submittedAt?: string;
  updatedAt: string;
}

export interface TaxEntry {
  id: string;
  type: string;
  declarationDeadline: string;
  paymentDeadline: string;
  isRecurring: boolean;
  frequency?: 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth?: number; // The day of the month for the deadline
  isArchived?: boolean;
  period: string; // e.g., 2026-03
  updatedAt: string;
}

export interface CompanyInfo {
  id: string;
  title: string; // Şirket Ünvanı
  taxNo: string; // Vergi No
  sgkNo: string; // SGK Sicil No
  name: string; // Şirket Adı
  address: string; // Adres
  phone: string; // Telefon No
  email: string; // Mail Adresi
  signatory: string; // İmza Yetkilisi
  createdAt: string;
  updatedAt: string;
}
