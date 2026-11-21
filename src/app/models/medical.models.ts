export type UserRole = 'patient' | 'admin';

export interface Clinic {
  id: string;
  name: string;
  address: string;
  phone: string;
  workHours: string;
  lat: number;
  lng: number;
}

export interface Doctor {
  id: string;
  clinicId: string;
  fullName: string;
  specialty: string;
  experienceYears: number;
  rating: number;
  room: string;
}

export type SlotStatus = 'available' | 'booked' | 'blocked';

export interface TimeSlot {
  id: string;
  doctorId: string;
  date: string; // формат YYYY-MM-DD
  time: string; // формат HH:mm
  status: SlotStatus;
}

export type AppointmentStatus = 'confirmed' | 'cancelled' | 'rescheduled' | 'completed';

export interface Appointment {
  id: string;
  slotId: string;
  doctorId: string;
  clinicId: string;
  date: string;
  time: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  policyNumber: string;
  birthDate: string;
  complaints: string;
  status: AppointmentStatus;
  createdAt: string;
  reminderMinutesBefore: number;
}

export interface MedicalHistoryEntry {
  id: string;
  date: string;
  doctorName: string;
  specialty: string;
  diagnosis: string;
  recommendations: string;
}

export interface MedicalRecord {
  patientName: string;
  birthDate: string;
  phone: string;
  email: string;
  policyNumber: string;
  bloodType: string;
  allergies: string;
  chronicDiseases: string;
  history: MedicalHistoryEntry[];
}

export interface ReminderSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  defaultMinutesBefore: number;
}

export interface AppNotification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
}
