import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  AppNotification,
  Appointment,
  Clinic,
  Doctor,
  MedicalRecord,
  ReminderSettings,
  TimeSlot,
  UserRole
} from '../models/medical.models';

interface PersistedState {
  slots: TimeSlot[];
  appointments: Appointment[];
  medicalRecord: MedicalRecord;
  reminderSettings: ReminderSettings;
}

const STORAGE_KEY = 'med_portal_state_v1';

@Injectable({
  providedIn: 'root'
})
export class MedicalDataService {
  private readonly initialClinics: Clinic[] = [
    {
      id: 'c1',
      name: 'Клиника «Здоровье Плюс» (Центр)',
      address: 'г. Москва, ул. Тверская, д. 18',
      phone: '+7 (495) 111-22-33',
      workHours: '08:00 – 21:00',
      lat: 55.7652,
      lng: 37.6042
    },
    {
      id: 'c2',
      name: 'МедЦентр «МедЛайф» (Юг)',
      address: 'г. Москва, Ленинский проспект, д. 72',
      phone: '+7 (495) 222-33-44',
      workHours: '08:00 – 20:00',
      lat: 55.6895,
      lng: 37.5416
    },
    {
      id: 'c3',
      name: 'Семейная клиника «Северная»',
      address: 'г. Москва, проспект Мира, д. 112',
      phone: '+7 (495) 333-44-55',
      workHours: '09:00 – 21:00',
      lat: 55.8058,
      lng: 37.6378
    }
  ];

  private readonly initialDoctors: Doctor[] = [
    { id: 'd1', clinicId: 'c1', fullName: 'Иванова Елена Сергеевна', specialty: 'Терапевт', experienceYears: 12, rating: 4.9, room: 'Каб. 204' },
    { id: 'd2', clinicId: 'c1', fullName: 'Смирнов Алексей Викторович', specialty: 'Кардиолог', experienceYears: 15, rating: 4.8, room: 'Каб. 310' },
    { id: 'd3', clinicId: 'c2', fullName: 'Козлова Марина Андреевна', specialty: 'Невролог', experienceYears: 9, rating: 4.7, room: 'Каб. 105' },
    { id: 'd4', clinicId: 'c2', fullName: 'Петров Дмитрий Николаевич', specialty: 'Офтальмолог', experienceYears: 11, rating: 4.9, room: 'Каб. 212' },
    { id: 'd5', clinicId: 'c3', fullName: 'Волкова Ольга Игоревна', specialty: 'Терапевт', experienceYears: 7, rating: 4.8, room: 'Каб. 101' },
    { id: 'd6', clinicId: 'c3', fullName: 'Морозов Игорь Павлович', specialty: 'Эндокринолог', experienceYears: 14, rating: 4.9, room: 'Каб. 305' }
  ];

  private clinicsSubject = new BehaviorSubject<Clinic[]>(this.initialClinics);
  private doctorsSubject = new BehaviorSubject<Doctor[]>(this.initialDoctors);
  private slotsSubject = new BehaviorSubject<TimeSlot[]>([]);
  private appointmentsSubject = new BehaviorSubject<Appointment[]>([]);
  private medicalRecordSubject = new BehaviorSubject<MedicalRecord>(this.createDefaultMedicalRecord());
  private reminderSettingsSubject = new BehaviorSubject<ReminderSettings>({
    emailEnabled: true,
    smsEnabled: true,
    defaultMinutesBefore: 60
  });
  private roleSubject = new BehaviorSubject<UserRole>('patient');
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);

  clinics$ = this.clinicsSubject.asObservable();
  doctors$ = this.doctorsSubject.asObservable();
  slots$ = this.slotsSubject.asObservable();
  appointments$ = this.appointmentsSubject.asObservable();
  medicalRecord$ = this.medicalRecordSubject.asObservable();
  reminderSettings$ = this.reminderSettingsSubject.asObservable();
  role$ = this.roleSubject.asObservable();
  notifications$ = this.notificationsSubject.asObservable();

  constructor() {
    this.loadState();

    // Синхронизация между вкладками для защиты от параллельного двойного бронирования
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.loadState();
      }
    });
  }

  setRole(role: UserRole): void {
    this.roleSubject.next(role);
    this.pushNotification(
      role === 'admin' ? 'Включён режим администратора расписания' : 'Включён режим пациента',
      'info'
    );
  }

  getRoleSnapshot(): UserRole {
    return this.roleSubject.value;
  }

  getClinicById(id: string): Clinic | undefined {
    return this.clinicsSubject.value.find(c => c.id === id);
  }

  getDoctorById(id: string): Doctor | undefined {
    return this.doctorsSubject.value.find(d => d.id === id);
  }

  // Бронирование с атомарной проверкой отсутствия двойного бронирования
  bookAppointment(payload: {
    slotId: string;
    patientName: string;
    patientPhone: string;
    patientEmail: string;
    policyNumber: string;
    birthDate: string;
    complaints: string;
    reminderMinutesBefore: number;
  }): { success: boolean; message: string; appointment?: Appointment } {
    // Всегда читаем самое свежее состояние из localStorage
    this.loadState();

    const slots = [...this.slotsSubject.value];
    const appointments = [...this.appointmentsSubject.value];
    const slotIndex = slots.findIndex(s => s.id === payload.slotId);

    if (slotIndex === -1) {
      return { success: false, message: 'Выбранный слот не найден.' };
    }

    const slot = slots[slotIndex];
    if (slot.status !== 'available') {
      return {
        success: false,
        message: 'Двойное бронирование запрещено: этот слот уже занят или заблокирован!'
      };
    }

    const alreadyBooked = appointments.some(
      a => a.slotId === slot.id && (a.status === 'confirmed' || a.status === 'rescheduled')
    );
    if (alreadyBooked) {
      return {
        success: false,
        message: 'На это время уже существует активная запись.'
      };
    }

    const doctor = this.getDoctorById(slot.doctorId);
    if (!doctor) {
      return { success: false, message: 'Врач не найден.' };
    }

    // Бронируем слот
    slots[slotIndex] = { ...slot, status: 'booked' };

    const newAppointment: Appointment = {
      id: 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      slotId: slot.id,
      doctorId: doctor.id,
      clinicId: doctor.clinicId,
      date: slot.date,
      time: slot.time,
      patientName: payload.patientName.trim(),
      patientPhone: payload.patientPhone.trim(),
      patientEmail: payload.patientEmail.trim(),
      policyNumber: payload.policyNumber.replace(/\s+/g, ''),
      birthDate: payload.birthDate,
      complaints: payload.complaints.trim(),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      reminderMinutesBefore: payload.reminderMinutesBefore
    };

    appointments.unshift(newAppointment);

    this.slotsSubject.next(slots);
    this.appointmentsSubject.next(appointments);
    this.saveState();

    this.pushNotification(
      `Запись подтверждена: ${doctor.fullName}, ${this.formatDateRu(slot.date)} в ${slot.time}.`,
      'success'
    );
    return { success: true, message: 'Вы успешно записаны на приём!', appointment: newAppointment };
  }

  // Отмена записи с освобождением слота
  cancelAppointment(appointmentId: string): { success: boolean; message: string } {
    this.loadState();
    const appointments = [...this.appointmentsSubject.value];
    const slots = [...this.slotsSubject.value];

    const appIndex = appointments.findIndex(a => a.id === appointmentId);
    if (appIndex === -1) {
      return { success: false, message: 'Запись не найдена.' };
    }

    const app = appointments[appIndex];
    if (app.status === 'cancelled') {
      return { success: false, message: 'Запись уже отменена.' };
    }

    appointments[appIndex] = { ...app, status: 'cancelled' };

    const slotIndex = slots.findIndex(s => s.id === app.slotId);
    if (slotIndex !== -1 && slots[slotIndex].status === 'booked') {
      slots[slotIndex] = { ...slots[slotIndex], status: 'available' };
    }

    this.appointmentsSubject.next(appointments);
    this.slotsSubject.next(slots);
    this.saveState();

    this.pushNotification(`Запись на ${this.formatDateRu(app.date)} ${app.time} отменена. Слот освобождён.`, 'warning');
    return { success: true, message: 'Запись отменена.' };
  }

  // Перенос записи на новый свободный слот без риска двойного бронирования
  rescheduleAppointment(appointmentId: string, newSlotId: string): { success: boolean; message: string } {
    this.loadState();
    const appointments = [...this.appointmentsSubject.value];
    const slots = [...this.slotsSubject.value];

    const appIndex = appointments.findIndex(a => a.id === appointmentId);
    if (appIndex === -1) {
      return { success: false, message: 'Запись не найдена.' };
    }

    const newSlotIndex = slots.findIndex(s => s.id === newSlotId);
    if (newSlotIndex === -1) {
      return { success: false, message: 'Новый слот не найден.' };
    }

    if (slots[newSlotIndex].status !== 'available') {
      return { success: false, message: 'Выбранный новый слот уже занят или заблокирован.' };
    }

    const oldApp = appointments[appIndex];
    const oldSlotIndex = slots.findIndex(s => s.id === oldApp.slotId);
    if (oldSlotIndex !== -1) {
      slots[oldSlotIndex] = { ...slots[oldSlotIndex], status: 'available' };
    }

    const newSlot = slots[newSlotIndex];
    const newDoctor = this.getDoctorById(newSlot.doctorId);
    slots[newSlotIndex] = { ...newSlot, status: 'booked' };

    appointments[appIndex] = {
      ...oldApp,
      slotId: newSlot.id,
      doctorId: newSlot.doctorId,
      clinicId: newDoctor ? newDoctor.clinicId : oldApp.clinicId,
      date: newSlot.date,
      time: newSlot.time,
      status: 'rescheduled'
    };

    this.appointmentsSubject.next(appointments);
    this.slotsSubject.next(slots);
    this.saveState();

    this.pushNotification(`Приём перенесён на ${this.formatDateRu(newSlot.date)} в ${newSlot.time}.`, 'success');
    return { success: true, message: 'Запись успешно перенесена.' };
  }

  // Обновление электронной медкарты
  updateMedicalRecord(record: MedicalRecord): void {
    this.medicalRecordSubject.next(record);
    this.saveState();
    this.pushNotification('Электронная медкарта обновлена.', 'success');
  }

  // Обновление настроек напоминаний (с применением к активным записям)
  updateReminderSettings(settings: ReminderSettings): void {
    this.reminderSettingsSubject.next(settings);

    const updatedAppointments = this.appointmentsSubject.value.map(app =>
      app.status === 'confirmed' || app.status === 'rescheduled'
        ? { ...app, reminderMinutesBefore: settings.defaultMinutesBefore }
        : app
    );
    this.appointmentsSubject.next(updatedAppointments);

    this.saveState();
    this.pushNotification('Настройки напоминаний сохранены и применены к активным записям.', 'success');
  }

  // Админ: генерация слотов на дату
  generateSlots(doctorId: string, date: string, startHour: number, endHour: number, stepMinutes: number): number {
    this.loadState();
    const slots = [...this.slotsSubject.value];
    let addedCount = 0;

    let currentMinutes = startHour * 60;
    const endMinutes = endHour * 60;

    while (currentMinutes < endMinutes) {
      const h = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
      const m = (currentMinutes % 60).toString().padStart(2, '0');
      const timeStr = `${h}:${m}`;

      const exists = slots.some(s => s.doctorId === doctorId && s.date === date && s.time === timeStr);
      if (!exists) {
        slots.push({
          id: `slot_${doctorId}_${date}_${timeStr}`,
          doctorId,
          date,
          time: timeStr,
          status: 'available'
        });
        addedCount++;
      }
      currentMinutes += stepMinutes;
    }

    slots.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    this.slotsSubject.next(slots);
    this.saveState();

    if (addedCount > 0) {
      this.pushNotification(`Добавлено новых слотов: ${addedCount}.`, 'success');
    } else {
      this.pushNotification('Все слоты на выбранный интервал уже существуют.', 'info');
    }
    return addedCount;
  }

  // Админ: блокировка / разблокировка свободного слота
  toggleSlotBlock(slotId: string): { success: boolean; message: string } {
    this.loadState();
    const slots = [...this.slotsSubject.value];
    const index = slots.findIndex(s => s.id === slotId);
    if (index === -1) return { success: false, message: 'Слот не найден.' };

    const slot = slots[index];
    if (slot.status === 'booked') {
      return { success: false, message: 'Нельзя заблокировать слот с активной записью. Сначала отмените запись.' };
    }

    slots[index] = {
      ...slot,
      status: slot.status === 'blocked' ? 'available' : 'blocked'
    };
    this.slotsSubject.next(slots);
    this.saveState();
    return { success: true, message: 'Статус слота изменён.' };
  }

  // Админ: удаление незанятого слота
  deleteSlot(slotId: string): { success: boolean; message: string } {
    this.loadState();
    const slots = [...this.slotsSubject.value];
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return { success: false, message: 'Слот не найден.' };
    if (slot.status === 'booked') {
      return { success: false, message: 'Нельзя удалить забронированный слот.' };
    }

    this.slotsSubject.next(slots.filter(s => s.id !== slotId));
    this.saveState();
    return { success: true, message: 'Слот удалён.' };
  }

  pushNotification(message: string, type: AppNotification['type'] = 'info', durationMs = 4000): void {
    const notification: AppNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      message,
      type,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
    const list = [notification, ...this.notificationsSubject.value].slice(0, 5);
    this.notificationsSubject.next(list);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, durationMs);
    }
  }

  dismissNotification(id: string): void {
    this.notificationsSubject.next(this.notificationsSubject.value.filter(n => n.id !== id));
  }

  formatDateRu(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
  }

  private loadState(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: PersistedState = JSON.parse(raw);
        this.slotsSubject.next(parsed.slots || []);
        this.appointmentsSubject.next(parsed.appointments || []);
        if (parsed.medicalRecord) this.medicalRecordSubject.next(parsed.medicalRecord);
        if (parsed.reminderSettings) this.reminderSettingsSubject.next(parsed.reminderSettings);
        return;
      } catch {
        // Если данные повреждены — пересоздадим начальные
      }
    }

    const defaultSlots = this.createInitialSlots();
    this.slotsSubject.next(defaultSlots);
    this.appointmentsSubject.next([]);
    this.medicalRecordSubject.next(this.createDefaultMedicalRecord());
    this.saveState();
  }

  private saveState(): void {
    const state: PersistedState = {
      slots: this.slotsSubject.value,
      appointments: this.appointmentsSubject.value,
      medicalRecord: this.medicalRecordSubject.value,
      reminderSettings: this.reminderSettingsSubject.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private createInitialSlots(): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '12:00', '14:00', '14:30', '15:00', '16:00'];
    const today = new Date();

    for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
      const d = new Date(today);
      d.setDate(today.getDate() + dayOffset);
      const dateStr = d.toISOString().split('T')[0];

      for (const doctor of this.initialDoctors) {
        for (const time of times) {
          slots.push({
            id: `slot_${doctor.id}_${dateStr}_${time}`,
            doctorId: doctor.id,
            date: dateStr,
            time,
            status: 'available'
          });
        }
      }
    }
    return slots;
  }

  private createDefaultMedicalRecord(): MedicalRecord {
    return {
      patientName: 'Соколов Артём Дмитриевич',
      birthDate: '1995-04-12',
      phone: '+7 (916) 555-44-33',
      email: 'sokolov@example.ru',
      policyNumber: '1234567890123456',
      bloodType: 'II (A) Rh+',
      allergies: 'Пенициллин, пыльца берёзы',
      chronicDiseases: 'Хронический ринит (в ремиссии)',
      history: [
        {
          id: 'h1',
          date: '2025-01-15',
          doctorName: 'Иванова Елена Сергеевна',
          specialty: 'Терапевт',
          diagnosis: 'ОРВИ лёгкой степени',
          recommendations: 'Обильное тёплое питьё, покой 3 дня, контроль температуры.'
        },
        {
          id: 'h2',
          date: '2024-11-04',
          doctorName: 'Смирнов Алексей Викторович',
          specialty: 'Кардиолог',
          diagnosis: 'Профилактический осмотр — норма',
          recommendations: 'ЭКГ без патологий. Повторный чекап через 1 год.'
        }
      ]
    };
  }
}
