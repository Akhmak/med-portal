import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClinicMapComponent } from '../clinic-map/clinic-map.component';
import { MedicalDataService } from '../../services/medical-data.service';
import { CustomValidators } from '../../validators/custom-validators';
import { Appointment, Clinic, Doctor, MedicalRecord, TimeSlot } from '../../models/medical.models';

interface CalendarDay {
  iso: string;
  label: string;
  weekday: string;
  availableCount: number;
}

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ClinicMapComponent],
  template: `
    <div class="page-header">
      <h1>Запись на приём к врачу</h1>
      <p class="subtitle">Выберите клинику на карте, подходящего специалиста и свободный слот времени.</p>
    </div>

    <!-- Уведомление об успешной записи -->
    <div *ngIf="lastBookedAppointment" class="card success-box">
      <div class="success-content">
        <div>
          <h3>Запись успешно оформлена!</h3>
          <p>
            Пациент: <strong>{{ lastBookedAppointment.patientName }}</strong><br>
            Врач: <strong>{{ getDoctorName(lastBookedAppointment.doctorId) }}</strong><br>
            Клиника: <strong>{{ getClinicName(lastBookedAppointment.clinicId) }}</strong><br>
            Дата и время: <strong>{{ dataService.formatDateRu(lastBookedAppointment.date) }} в {{ lastBookedAppointment.time }}</strong>
          </p>
        </div>
        <div class="success-actions">
          <a routerLink="/cabinet" class="btn btn-primary">Мои записи и напоминания</a>
          <button type="button" class="btn btn-secondary" (click)="lastBookedAppointment = null">Скрыть</button>
        </div>
      </div>
    </div>

    <!-- Блок 1: Выбор клиники + Карта -->
    <section class="card">
      <div class="section-head">
        <h2>1. Выбор клиники</h2>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          *ngIf="selectedClinicId"
          (click)="selectClinic(null)">
          Показать все клиники
        </button>
      </div>

      <div class="grid-2">
        <div class="clinic-list">
          <div
            *ngFor="let clinic of clinics"
            class="clinic-card"
            [class.selected]="clinic.id === selectedClinicId"
            (click)="selectClinic(clinic.id)">
            <div class="clinic-title">{{ clinic.name }}</div>
            <div class="clinic-meta">{{ clinic.address }}</div>
            <div class="clinic-meta">Тел: {{ clinic.phone }} &bull; Часы: {{ clinic.workHours }}</div>
          </div>
        </div>

        <app-clinic-map
          [clinics]="clinics"
          [selectedClinicId]="selectedClinicId"
          (clinicSelected)="selectClinic($event)">
        </app-clinic-map>
      </div>
    </section>

    <!-- Блок 2: Выбор специалиста -->
    <section class="card">
      <div class="section-head">
        <h2>2. Выбор специалиста</h2>
        <div class="specialty-filters">
          <button
            type="button"
            class="chip"
            [class.active]="selectedSpecialty === ''"
            (click)="selectSpecialty('')">
            Все специальности
          </button>
          <button
            type="button"
            *ngFor="let spec of specialties"
            class="chip"
            [class.active]="selectedSpecialty === spec"
            (click)="selectSpecialty(spec)">
            {{ spec }}
          </button>
        </div>
      </div>

      <div *ngIf="filteredDoctors.length === 0" class="empty-state">
        По выбранным фильтрам специалисты не найдены. Попробуйте сбросить фильтр специальности или клиники.
      </div>

      <div class="doctors-grid">
        <div
          *ngFor="let doc of filteredDoctors"
          class="doctor-card"
          [class.selected]="doc.id === selectedDoctorId"
          (click)="selectDoctor(doc.id)">
          <div class="doctor-top">
            <span class="badge badge-primary">{{ doc.specialty }}</span>
            <span class="rating">★ {{ doc.rating }}</span>
          </div>
          <div class="doctor-name">{{ doc.fullName }}</div>
          <div class="doctor-meta">{{ getClinicName(doc.clinicId) }}</div>
          <div class="doctor-meta">Стаж: {{ doc.experienceYears }} лет &bull; {{ doc.room }}</div>
          <div class="doctor-slots-count">
            Свободных слотов: <strong>{{ countAvailableSlotsForDoctor(doc.id) }}</strong>
          </div>
        </div>
      </div>
    </section>

    <!-- Блок 3 и 4: Календарь слотов + Форма записи -->
    <div class="grid-2" *ngIf="selectedDoctor">
      <!-- Календарь слотов -->
      <section class="card">
        <h2>3. Календарь свободных слотов</h2>
        <p class="selected-doc-label">
          Врач: <strong>{{ selectedDoctor.fullName }}</strong> ({{ selectedDoctor.specialty }})
        </p>

        <div class="calendar-strip">
          <button
            type="button"
            *ngFor="let day of calendarDays"
            class="day-btn"
            [class.active]="day.iso === selectedDate"
            [class.empty]="day.availableCount === 0"
            (click)="selectDate(day.iso)">
            <span class="day-week">{{ day.weekday }}</span>
            <span class="day-num">{{ day.label }}</span>
            <span class="day-count">{{ day.availableCount }} своб.</span>
          </button>
        </div>

        <div class="slots-legend">
          <span class="legend-dot free"></span> Свободно
          <span class="legend-dot busy"></span> Занято
          <span class="legend-dot blocked"></span> Недоступно
        </div>

        <div *ngIf="slotsForSelectedDate.length === 0" class="empty-state">
          На выбранную дату расписание ещё не сформировано. Выберите другой день.
        </div>

        <div class="slots-grid">
          <button
            type="button"
            *ngFor="let slot of slotsForSelectedDate"
            class="slot-btn"
            [class.selected]="slot.id === selectedSlotId"
            [class.booked]="slot.status === 'booked'"
            [class.blocked]="slot.status === 'blocked'"
            [disabled]="slot.status !== 'available'"
            (click)="selectSlot(slot)">
            <span class="slot-time">{{ slot.time }}</span>
            <span class="slot-status">
              {{ slot.status === 'available' ? 'Свободно' : slot.status === 'booked' ? 'Занято' : 'Закрыто' }}
            </span>
          </button>
        </div>
      </section>

      <!-- Форма записи (Reactive Forms) -->
      <section class="card">
        <div class="section-head">
          <h2>4. Данные пациента</h2>
          <button type="button" class="btn btn-secondary btn-sm" (click)="fillFromMedicalRecord()">
            Заполнить из медкарты
          </button>
        </div>

        <div *ngIf="!selectedSlotId" class="hint-box">
          Выберите свободный слот времени в календаре слева, чтобы завершить запись.
        </div>

        <div *ngIf="selectedSlot" class="selected-slot-banner">
          Выбрано время: <strong>{{ dataService.formatDateRu(selectedSlot.date) }} в {{ selectedSlot.time }}</strong>
        </div>

        <div *ngIf="bookingError" class="error-banner">
          {{ bookingError }}
        </div>

        <form [formGroup]="bookingForm" (ngSubmit)="submitBooking()" novalidate>
          <div class="form-group">
            <label class="form-label">ФИО пациента *</label>
            <input
              type="text"
              class="form-control"
              formControlName="patientName"
              placeholder="Иванов Иван Иванович"
              [class.is-invalid]="isInvalid('patientName')">
            <span class="error-text" *ngIf="hasError('patientName', 'required')">
              Введите ФИО пациента.
            </span>
            <span class="error-text" *ngIf="hasError('patientName', 'invalidFullName')">
              Укажите фамилию и имя кириллицей (минимум 2 слова).
            </span>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Дата рождения *</label>
              <input
                type="date"
                class="form-control"
                formControlName="birthDate"
                [class.is-invalid]="isInvalid('birthDate')">
              <span class="error-text" *ngIf="hasError('birthDate', 'required')">
                Укажите дату рождения.
              </span>
              <span class="error-text" *ngIf="hasError('birthDate', 'futureBirthDate')">
                Дата рождения не может быть в будущем.
              </span>
              <span class="error-text" *ngIf="hasError('birthDate', 'tooOldBirthDate')">
                Указан некорректный год рождения.
              </span>
            </div>

            <div class="form-group">
              <label class="form-label">Полис ОМС (16 цифр) *</label>
              <input
                type="text"
                class="form-control"
                formControlName="policyNumber"
                placeholder="1234567890123456"
                maxlength="19"
                [class.is-invalid]="isInvalid('policyNumber')">
              <span class="error-text" *ngIf="hasError('policyNumber', 'required')">
                Введите номер полиса ОМС.
              </span>
              <span class="error-text" *ngIf="hasError('policyNumber', 'invalidPolicy')">
                Полис ОМС должен содержать ровно 16 цифр.
              </span>
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Телефон *</label>
              <input
                type="tel"
                class="form-control"
                formControlName="patientPhone"
                placeholder="+7 (999) 123-45-67"
                [class.is-invalid]="isInvalid('patientPhone')">
              <span class="error-text" *ngIf="hasError('patientPhone', 'required')">
                Укажите номер телефона.
              </span>
              <span class="error-text" *ngIf="hasError('patientPhone', 'invalidPhone')">
                Введите корректный номер РФ (11 цифр, начинается с +7 или 8).
              </span>
            </div>

            <div class="form-group">
              <label class="form-label">Email *</label>
              <input
                type="email"
                class="form-control"
                formControlName="patientEmail"
                placeholder="name@example.ru"
                [class.is-invalid]="isInvalid('patientEmail')">
              <span class="error-text" *ngIf="hasError('patientEmail', 'required')">
                Укажите email для уведомлений.
              </span>
              <span class="error-text" *ngIf="hasError('patientEmail', 'email')">
                Некорректный формат email.
              </span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Напоминание о приёме *</label>
            <select class="form-control" formControlName="reminderMinutesBefore">
              <option [ngValue]="30">За 30 минут до приёма</option>
              <option [ngValue]="60">За 1 час до приёма</option>
              <option [ngValue]="180">За 3 часа до приёма</option>
              <option [ngValue]="1440">За 24 часа до приёма</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Жалобы / комментарий (необязательно)</label>
            <textarea
              rows="2"
              class="form-control"
              formControlName="complaints"
              placeholder="Кратко опишите причину обращения..."
              [class.is-invalid]="isInvalid('complaints')"></textarea>
            <span class="error-text" *ngIf="hasError('complaints', 'maxlength')">
              Максимум 500 символов.
            </span>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" formControlName="consent">
              <span>Я согласен(а) на обработку персональных и медицинских данных *</span>
            </label>
            <span class="error-text" *ngIf="isInvalid('consent')">
              Необходимо подтвердить согласие на обработку данных.
            </span>
          </div>

          <button
            type="submit"
            class="btn btn-primary submit-btn"
            [disabled]="!selectedSlotId || isSubmitting">
            {{ isSubmitting ? 'Оформление...' : 'Подтвердить запись на приём' }}
          </button>
        </form>
      </section>
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 18px; }
    .subtitle { color: var(--text-muted); margin-top: -6px; }
    .section-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .section-head h2 { margin-bottom: 0; }
    .clinic-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .clinic-card {
      padding: 14px;
      border: 2px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .clinic-card:hover { border-color: #9bbcff; background: #fafcff; }
    .clinic-card.selected {
      border-color: var(--success);
      background: #f3fff6;
    }
    .clinic-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
    .clinic-meta { font-size: 13px; color: var(--text-muted); }

    .specialty-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      border: 1px solid var(--border);
      background: #fff;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .chip.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .doctors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    }
    .doctor-card {
      border: 2px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .doctor-card:hover { border-color: #9bbcff; }
    .doctor-card.selected {
      border-color: var(--primary);
      background: var(--primary-light);
    }
    .doctor-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .rating { font-weight: 700; color: #b28600; font-size: 13px; }
    .doctor-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
    .doctor-meta { font-size: 13px; color: var(--text-muted); }
    .doctor-slots-count {
      margin-top: 10px;
      font-size: 13px;
      color: var(--success);
    }

    .selected-doc-label {
      margin-top: -6px;
      margin-bottom: 14px;
      color: var(--text-muted);
      font-size: 14px;
    }
    .calendar-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .day-btn {
      min-width: 82px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #fff;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .day-btn.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .day-btn.empty:not(.active) {
      opacity: 0.55;
    }
    .day-week { font-size: 11px; text-transform: uppercase; }
    .day-num { font-size: 14px; font-weight: 700; }
    .day-count { font-size: 11px; }

    .slots-legend {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      display: inline-block;
      margin-right: -8px;
    }
    .legend-dot.free { background: #e8f5e9; border: 1px solid #198038; }
    .legend-dot.busy { background: #fff1f1; border: 1px solid #da1e28; }
    .legend-dot.blocked { background: #eceff1; border: 1px solid #90a4ae; }

    .slots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(105px, 1fr));
      gap: 10px;
    }
    .slot-btn {
      padding: 10px 8px;
      border-radius: 8px;
      border: 1px solid #198038;
      background: #f3fff6;
      color: #0e6027;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: all 0.15s;
    }
    .slot-btn:hover:not(:disabled) {
      background: #defbe6;
    }
    .slot-btn.selected {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
    }
    .slot-btn.booked {
      background: var(--danger-bg);
      border-color: #ffb3b8;
      color: var(--danger);
      cursor: not-allowed;
    }
    .slot-btn.blocked {
      background: #f2f4f8;
      border-color: #cfd5de;
      color: #6f7782;
      cursor: not-allowed;
    }
    .slot-time { font-weight: 700; font-size: 15px; }
    .slot-status { font-size: 11px; }

    .hint-box {
      padding: 10px 14px;
      background: #f8fafc;
      border: 1px dashed var(--border);
      border-radius: 8px;
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 14px;
    }
    .selected-slot-banner {
      padding: 10px 14px;
      background: var(--success-bg);
      color: var(--success);
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 14px;
    }
    .error-banner {
      padding: 10px 14px;
      background: var(--danger-bg);
      border: 1px solid #ffb3b8;
      color: var(--danger);
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 14px;
    }
    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;
    }
    .submit-btn {
      width: 100%;
      padding: 12px;
      font-size: 15px;
    }
    .success-box {
      background: #f3fff6;
      border-color: #6fdc8c;
    }
    .success-content {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .success-actions {
      display: flex;
      gap: 10px;
    }
    .empty-state {
      padding: 16px;
      text-align: center;
      color: var(--text-muted);
      background: #f8fafc;
      border-radius: 8px;
      font-size: 14px;
    }
  `]
})
export class BookingComponent implements OnInit, OnDestroy {
  dataService = inject(MedicalDataService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  clinics: Clinic[] = [];
  doctors: Doctor[] = [];
  slots: TimeSlot[] = [];
  medicalRecord: MedicalRecord | null = null;

  selectedClinicId: string | null = null;
  selectedSpecialty = '';
  selectedDoctorId: string | null = null;
  selectedDate = '';
  selectedSlotId: string | null = null;

  isSubmitting = false;
  submitted = false;
  bookingError = '';
  lastBookedAppointment: Appointment | null = null;

  bookingForm!: FormGroup;
  private subs = new Subscription();

  ngOnInit(): void {
    this.bookingForm = this.fb.group({
      patientName: ['', [Validators.required, CustomValidators.fullNameRu()]],
      birthDate: ['', [Validators.required, CustomValidators.birthDateRange()]],
      policyNumber: ['', [Validators.required, CustomValidators.omsPolicy()]],
      patientPhone: ['', [Validators.required, CustomValidators.russianPhone()]],
      patientEmail: ['', [Validators.required, Validators.email]],
      reminderMinutesBefore: [60, [Validators.required]],
      complaints: ['', [Validators.maxLength(500)]],
      consent: [false, [Validators.requiredTrue]]
    });

    this.subs.add(
      this.dataService.clinics$.subscribe(clinics => {
        this.clinics = clinics;
        if (!this.selectedClinicId && clinics.length > 0) {
          this.selectedClinicId = clinics[0].id;
        }
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.doctors$.subscribe(doctors => {
        this.doctors = doctors;
        this.ensureDoctorSelection();
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.slots$.subscribe(slots => {
        this.slots = slots;
        // Проверка на случай, если выбранный слот заняли в другой вкладке
        if (this.selectedSlotId) {
          const current = slots.find(s => s.id === this.selectedSlotId);
          if (!current || current.status !== 'available') {
            this.selectedSlotId = null;
            this.bookingError = 'Внимание: выбранный слот только что был занят или заблокирован. Выберите другое время.';
          }
        }
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.medicalRecord$.subscribe(rec => {
        this.medicalRecord = rec;
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.reminderSettings$.subscribe(settings => {
        this.bookingForm.patchValue({ reminderMinutesBefore: settings.defaultMinutesBefore });
      })
    );

    this.selectedDate = this.getTodayIso();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get specialties(): string[] {
    const base = this.selectedClinicId
      ? this.doctors.filter(d => d.clinicId === this.selectedClinicId)
      : this.doctors;
    return Array.from(new Set(base.map(d => d.specialty)));
  }

  get filteredDoctors(): Doctor[] {
    return this.doctors.filter(d => {
      const matchClinic = !this.selectedClinicId || d.clinicId === this.selectedClinicId;
      const matchSpec = !this.selectedSpecialty || d.specialty === this.selectedSpecialty;
      return matchClinic && matchSpec;
    });
  }

  get selectedDoctor(): Doctor | undefined {
    return this.doctors.find(d => d.id === this.selectedDoctorId);
  }

  get selectedSlot(): TimeSlot | undefined {
    return this.slots.find(s => s.id === this.selectedSlotId);
  }

  get calendarDays(): CalendarDay[] {
    const days: CalendarDay[] = [];
    const today = new Date();
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const availableCount = this.selectedDoctorId
        ? this.slots.filter(s => s.doctorId === this.selectedDoctorId && s.date === iso && s.status === 'available').length
        : 0;

      days.push({
        iso,
        weekday: weekdays[d.getDay()],
        label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        availableCount
      });
    }
    return days;
  }

  get slotsForSelectedDate(): TimeSlot[] {
    if (!this.selectedDoctorId || !this.selectedDate) return [];
    return this.slots
      .filter(s => s.doctorId === this.selectedDoctorId && s.date === this.selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  selectClinic(clinicId: string | null): void {
    this.selectedClinicId = clinicId;
    this.selectedSpecialty = '';
    this.ensureDoctorSelection();
  }

  selectSpecialty(spec: string): void {
    this.selectedSpecialty = spec;
    this.ensureDoctorSelection();
  }

  selectDoctor(doctorId: string): void {
    this.selectedDoctorId = doctorId;
    this.selectedSlotId = null;
    this.bookingError = '';
  }

  selectDate(iso: string): void {
    this.selectedDate = iso;
    this.selectedSlotId = null;
    this.bookingError = '';
  }

  selectSlot(slot: TimeSlot): void {
    if (slot.status !== 'available') return;
    this.selectedSlotId = slot.id;
    this.bookingError = '';
  }

  countAvailableSlotsForDoctor(doctorId: string): number {
    return this.slots.filter(s => s.doctorId === doctorId && s.status === 'available').length;
  }

  fillFromMedicalRecord(): void {
    if (!this.medicalRecord) return;
    this.bookingForm.patchValue({
      patientName: this.medicalRecord.patientName,
      birthDate: this.medicalRecord.birthDate,
      policyNumber: this.medicalRecord.policyNumber,
      patientPhone: this.medicalRecord.phone,
      patientEmail: this.medicalRecord.email
    });
    this.bookingForm.markAllAsTouched();
  }

  submitBooking(): void {
    this.submitted = true;
    this.bookingError = '';

    if (this.bookingForm.invalid) {
      this.bookingForm.markAllAsTouched();
      this.bookingError = 'Пожалуйста, исправьте ошибки валидации в форме.';
      return;
    }

    if (!this.selectedSlotId) {
      this.bookingError = 'Выберите свободный слот времени.';
      return;
    }

    this.isSubmitting = true;
    const val = this.bookingForm.value;

    const result = this.dataService.bookAppointment({
      slotId: this.selectedSlotId,
      patientName: val.patientName,
      patientPhone: val.patientPhone,
      patientEmail: val.patientEmail,
      policyNumber: val.policyNumber,
      birthDate: val.birthDate,
      complaints: val.complaints || '',
      reminderMinutesBefore: val.reminderMinutesBefore
    });

    this.isSubmitting = false;

    if (!result.success) {
      this.bookingError = result.message;
      this.selectedSlotId = null;
      return;
    }

    this.lastBookedAppointment = result.appointment || null;
    this.selectedSlotId = null;
    this.submitted = false;
    this.bookingForm.patchValue({ complaints: '', consent: false });
    this.bookingForm.markAsPristine();
    this.bookingForm.markAsUntouched();
  }

  isInvalid(controlName: string): boolean {
    const ctrl = this.bookingForm.get(controlName);
    return !!(ctrl && ctrl.invalid && (ctrl.touched || ctrl.dirty || this.submitted));
  }

  hasError(controlName: string, errorCode: string): boolean {
    const ctrl = this.bookingForm.get(controlName);
    return !!(ctrl && ctrl.hasError(errorCode) && (ctrl.touched || ctrl.dirty || this.submitted));
  }

  getDoctorName(id: string): string {
    return this.dataService.getDoctorById(id)?.fullName || 'Врач';
  }

  getClinicName(id: string): string {
    return this.dataService.getClinicById(id)?.name || 'Клиника';
  }

  private ensureDoctorSelection(): void {
    const list = this.filteredDoctors;
    if (list.length === 0) {
      this.selectedDoctorId = null;
      this.selectedSlotId = null;
      return;
    }
    if (!this.selectedDoctorId || !list.some(d => d.id === this.selectedDoctorId)) {
      this.selectedDoctorId = list[0].id;
      this.selectedSlotId = null;
    }
  }

  private getTodayIso(): string {
    return new Date().toISOString().split('T')[0];
  }
}
