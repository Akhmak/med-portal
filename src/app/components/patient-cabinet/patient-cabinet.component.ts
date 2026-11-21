import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { MedicalDataService } from '../../services/medical-data.service';
import { CustomValidators } from '../../validators/custom-validators';
import { Appointment, MedicalRecord, ReminderSettings, TimeSlot } from '../../models/medical.models';

@Component({
  selector: 'app-patient-cabinet',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>Личный кабинет пациента</h1>
      <p class="subtitle">Управление записями на приём, напоминаниями и электронной медицинской картой.</p>
    </div>

    <div class="tabs">
      <button
        type="button"
        class="tab-btn"
        [class.active]="activeTab === 'appointments'"
        (click)="activeTab = 'appointments'">
        Мои записи ({{ activeAppointments.length }})
      </button>
      <button
        type="button"
        class="tab-btn"
        [class.active]="activeTab === 'reminders'"
        (click)="activeTab = 'reminders'">
        Напоминания о приёме
      </button>
      <button
        type="button"
        class="tab-btn"
        [class.active]="activeTab === 'card'"
        (click)="activeTab = 'card'">
        Электронная медкарта
      </button>
    </div>

    <!-- ВКЛАДКА 1: МОИ ЗАПИСИ -->
    <section *ngIf="activeTab === 'appointments'">
      <div *ngIf="appointments.length === 0" class="card empty-box">
        <h3>У вас пока нет записей</h3>
        <p>Выберите клинику, специалиста и удобное время на странице записи.</p>
        <a routerLink="/booking" class="btn btn-primary">Записаться к врачу</a>
      </div>

      <!-- Панель переноса записи -->
      <div *ngIf="reschedulingAppointment" class="card reschedule-card">
        <div class="reschedule-head">
          <h3>Перенос записи: {{ getDoctorName(reschedulingAppointment.doctorId) }}</h3>
          <button type="button" class="btn btn-secondary btn-sm" (click)="cancelReschedule()">Закрыть</button>
        </div>
        <p class="muted">
          Текущее время:
          <strong>{{ dataService.formatDateRu(reschedulingAppointment.date) }} в {{ reschedulingAppointment.time }}</strong>.
          Выберите новую дату и свободный слот:
        </p>

        <div class="date-pills">
          <button
            type="button"
            *ngFor="let d of rescheduleDates"
            class="pill-btn"
            [class.active]="d === rescheduleDate"
            (click)="selectRescheduleDate(d)">
            {{ dataService.formatDateRu(d) }}
          </button>
        </div>

        <div *ngIf="availableSlotsForReschedule.length === 0" class="empty-inline">
          На выбранную дату нет свободных слотов у этого врача.
        </div>

        <div class="slots-mini-grid">
          <button
            type="button"
            *ngFor="let slot of availableSlotsForReschedule"
            class="slot-mini"
            [class.selected]="slot.id === selectedNewSlotId"
            (click)="selectedNewSlotId = slot.id">
            {{ slot.time }}
          </button>
        </div>

        <div class="reschedule-actions">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="!selectedNewSlotId"
            (click)="confirmReschedule()">
            Подтвердить перенос
          </button>
          <button type="button" class="btn btn-secondary" (click)="cancelReschedule()">Отмена</button>
        </div>
      </div>

      <!-- Список записей -->
      <div class="appointments-list">
        <div *ngFor="let app of appointments" class="card appointment-card" [class.cancelled]="app.status === 'cancelled'">
          <div class="app-top">
            <div>
              <span class="badge" [ngClass]="getStatusBadgeClass(app.status)">
                {{ getStatusLabel(app.status) }}
              </span>
              <span class="app-date">
                {{ dataService.formatDateRu(app.date) }} в {{ app.time }}
              </span>
            </div>
            <div class="app-actions" *ngIf="app.status === 'confirmed' || app.status === 'rescheduled'">
              <button type="button" class="btn btn-secondary btn-sm" (click)="startReschedule(app)">
                Перенести
              </button>
              <button type="button" class="btn btn-danger btn-sm" (click)="cancelAppointment(app.id)">
                Отменить
              </button>
            </div>
          </div>

          <div class="app-body">
            <div>
              <div class="app-doc">{{ getDoctorName(app.doctorId) }} ({{ getDoctorSpecialty(app.doctorId) }})</div>
              <div class="app-meta">{{ getClinicName(app.clinicId) }} &bull; {{ getDoctorRoom(app.doctorId) }}</div>
            </div>
            <div class="app-patient">
              <div><strong>Пациент:</strong> {{ app.patientName }}</div>
              <div><strong>Полис ОМС:</strong> {{ app.policyNumber }} &bull; <strong>Тел:</strong> {{ app.patientPhone }}</div>
              <div *ngIf="app.complaints"><strong>Жалобы:</strong> {{ app.complaints }}</div>
              <div class="muted">Напоминание: за {{ app.reminderMinutesBefore }} мин. до приёма</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ВКЛАДКА 2: НАПОМИНАНИЯ -->
    <section *ngIf="activeTab === 'reminders'" class="grid-2">
      <div class="card">
        <h2>Настройки напоминаний</h2>
        <form [formGroup]="reminderForm" (ngSubmit)="saveReminders()">
          <div class="form-group">
            <label class="checkbox-row">
              <input type="checkbox" formControlName="emailEnabled">
              <span>Отправлять напоминания на Email ({{ medicalRecord?.email }})</span>
            </label>
          </div>

          <div class="form-group">
            <label class="checkbox-row">
              <input type="checkbox" formControlName="smsEnabled">
              <span>Отправлять SMS-напоминания ({{ medicalRecord?.phone }})</span>
            </label>
          </div>

          <div class="form-group">
            <label class="form-label">За сколько времени напоминать по умолчанию *</label>
            <select class="form-control" formControlName="defaultMinutesBefore">
              <option [ngValue]="30">За 30 минут</option>
              <option [ngValue]="60">За 1 час</option>
              <option [ngValue]="180">За 3 часа</option>
              <option [ngValue]="1440">За 24 часа</option>
            </select>
          </div>

          <button type="submit" class="btn btn-primary" [disabled]="reminderForm.invalid">
            Сохранить настройки
          </button>
        </form>
      </div>

      <div class="card">
        <h2>Ближайшие напоминания</h2>
        <div *ngIf="activeAppointments.length === 0" class="empty-inline">
          Нет активных предстоящих приёмов.
        </div>

        <div *ngFor="let app of activeAppointments" class="reminder-item">
          <div>
            <strong>{{ dataService.formatDateRu(app.date) }} в {{ app.time }}</strong> — {{ getDoctorName(app.doctorId) }}
            <div class="muted">
              Уведомление сработает за {{ app.reminderMinutesBefore }} мин. до визита
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" (click)="sendTestReminder(app)">
            Тест уведомления
          </button>
        </div>
      </div>
    </section>

    <!-- ВКЛАДКА 3: ЭЛЕКТРОННАЯ МЕДКАРТА -->
    <section *ngIf="activeTab === 'card'" class="grid-2">
      <div class="card">
        <h2>Данные электронной медкарты</h2>
        <form [formGroup]="recordForm" (ngSubmit)="saveMedicalRecord()" novalidate>
          <div class="form-group">
            <label class="form-label">ФИО пациента *</label>
            <input
              type="text"
              class="form-control"
              formControlName="patientName"
              [class.is-invalid]="isRecordInvalid('patientName')">
            <span class="error-text" *ngIf="hasRecordError('patientName', 'required')">Введите ФИО.</span>
            <span class="error-text" *ngIf="hasRecordError('patientName', 'invalidFullName')">
              ФИО должно состоять минимум из 2 слов кириллицей.
            </span>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Дата рождения *</label>
              <input
                type="date"
                class="form-control"
                formControlName="birthDate"
                [class.is-invalid]="isRecordInvalid('birthDate')">
              <span class="error-text" *ngIf="hasRecordError('birthDate', 'required')">Укажите дату рождения.</span>
              <span class="error-text" *ngIf="hasRecordError('birthDate', 'futureBirthDate')">Дата не может быть в будущем.</span>
              <span class="error-text" *ngIf="hasRecordError('birthDate', 'tooOldBirthDate')">Некорректный год рождения.</span>
            </div>

            <div class="form-group">
              <label class="form-label">Группа крови *</label>
              <select class="form-control" formControlName="bloodType">
                <option value="I (0) Rh+">I (0) Rh+</option>
                <option value="I (0) Rh-">I (0) Rh-</option>
                <option value="II (A) Rh+">II (A) Rh+</option>
                <option value="II (A) Rh-">II (A) Rh-</option>
                <option value="III (B) Rh+">III (B) Rh+</option>
                <option value="III (B) Rh-">III (B) Rh-</option>
                <option value="IV (AB) Rh+">IV (AB) Rh+</option>
                <option value="IV (AB) Rh-">IV (AB) Rh-</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Полис ОМС (16 цифр) *</label>
            <input
              type="text"
              class="form-control"
              formControlName="policyNumber"
              maxlength="16"
              [class.is-invalid]="isRecordInvalid('policyNumber')">
            <span class="error-text" *ngIf="hasRecordError('policyNumber', 'required')">Введите номер полиса.</span>
            <span class="error-text" *ngIf="hasRecordError('policyNumber', 'invalidPolicy')">Полис должен содержать 16 цифр.</span>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Телефон *</label>
              <input
                type="tel"
                class="form-control"
                formControlName="phone"
                [class.is-invalid]="isRecordInvalid('phone')">
              <span class="error-text" *ngIf="hasRecordError('phone', 'required')">Введите телефон.</span>
              <span class="error-text" *ngIf="hasRecordError('phone', 'invalidPhone')">Некорректный телефон РФ.</span>
            </div>

            <div class="form-group">
              <label class="form-label">Email *</label>
              <input
                type="email"
                class="form-control"
                formControlName="email"
                [class.is-invalid]="isRecordInvalid('email')">
              <span class="error-text" *ngIf="hasRecordError('email', 'required')">Введите email.</span>
              <span class="error-text" *ngIf="hasRecordError('email', 'email')">Некорректный формат email.</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Аллергические реакции</label>
            <input
              type="text"
              class="form-control"
              formControlName="allergies"
              placeholder="Например: нет или пенициллин"
              [class.is-invalid]="isRecordInvalid('allergies')">
            <span class="error-text" *ngIf="hasRecordError('allergies', 'maxlength')">Максимум 300 символов.</span>
          </div>

          <div class="form-group">
            <label class="form-label">Хронические заболевания</label>
            <textarea
              rows="2"
              class="form-control"
              formControlName="chronicDiseases"
              [class.is-invalid]="isRecordInvalid('chronicDiseases')"></textarea>
            <span class="error-text" *ngIf="hasRecordError('chronicDiseases', 'maxlength')">Максимум 300 символов.</span>
          </div>

          <button type="submit" class="btn btn-primary">Сохранить медкарту</button>
        </form>
      </div>

      <div class="card">
        <h2>История посещений и диагнозы</h2>
        <div *ngIf="!medicalRecord || medicalRecord.history.length === 0" class="empty-inline">
          История посещений пока пуста.
        </div>

        <div *ngFor="let item of medicalRecord?.history" class="history-card">
          <div class="history-head">
            <span class="badge badge-primary">{{ item.specialty }}</span>
            <span class="muted">{{ dataService.formatDateRu(item.date) }}</span>
          </div>
          <div class="history-doc">{{ item.doctorName }}</div>
          <div class="history-diag"><strong>Заключение:</strong> {{ item.diagnosis }}</div>
          <div class="history-rec"><strong>Рекомендации:</strong> {{ item.recommendations }}</div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page-header { margin-bottom: 16px; }
    .subtitle { color: var(--text-muted); margin-top: -6px; }
    .muted { font-size: 13px; color: var(--text-muted); }

    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .tab-btn {
      padding: 10px 18px;
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .tab-btn.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .empty-box {
      text-align: center;
      padding: 36px 20px;
    }
    .empty-inline {
      padding: 14px;
      background: #f8fafc;
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 13px;
    }

    .appointments-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .appointment-card.cancelled {
      opacity: 0.65;
      background: #fafafa;
    }
    .app-top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 12px;
    }
    .app-date {
      font-weight: 700;
      font-size: 15px;
      margin-left: 10px;
    }
    .app-actions {
      display: flex;
      gap: 8px;
    }
    .app-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 768px) {
      .app-body { grid-template-columns: 1fr; }
    }
    .app-doc { font-weight: 700; font-size: 15px; }
    .app-meta { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .app-patient { font-size: 13px; display: flex; flex-direction: column; gap: 3px; }

    .reschedule-card {
      border: 2px solid var(--primary);
      background: #f8fbff;
    }
    .reschedule-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .reschedule-head h3 { margin: 0; }
    .date-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }
    .pill-btn {
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #fff;
      cursor: pointer;
      font-size: 13px;
    }
    .pill-btn.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .slots-mini-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }
    .slot-mini {
      padding: 8px 14px;
      border: 1px solid #198038;
      background: #f3fff6;
      color: #0e6027;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
    }
    .slot-mini.selected {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
    }
    .reschedule-actions {
      display: flex;
      gap: 10px;
      margin-top: 12px;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      cursor: pointer;
    }
    .reminder-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 10px;
    }

    .history-card {
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 12px;
      background: #fafcff;
    }
    .history-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .history-doc { font-weight: 700; margin-bottom: 4px; }
    .history-diag, .history-rec { font-size: 13px; margin-top: 3px; }
  `]
})
export class PatientCabinetComponent implements OnInit, OnDestroy {
  dataService = inject(MedicalDataService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  activeTab: 'appointments' | 'reminders' | 'card' = 'appointments';

  appointments: Appointment[] = [];
  slots: TimeSlot[] = [];
  medicalRecord: MedicalRecord | null = null;

  reschedulingAppointment: Appointment | null = null;
  rescheduleDates: string[] = [];
  rescheduleDate = '';
  selectedNewSlotId: string | null = null;

  recordForm!: FormGroup;
  reminderForm!: FormGroup;
  recordSubmitted = false;

  private subs = new Subscription();

  ngOnInit(): void {
    this.recordForm = this.fb.group({
      patientName: ['', [Validators.required, CustomValidators.fullNameRu()]],
      birthDate: ['', [Validators.required, CustomValidators.birthDateRange()]],
      bloodType: ['II (A) Rh+', [Validators.required]],
      policyNumber: ['', [Validators.required, CustomValidators.omsPolicy()]],
      phone: ['', [Validators.required, CustomValidators.russianPhone()]],
      email: ['', [Validators.required, Validators.email]],
      allergies: ['', [Validators.maxLength(300)]],
      chronicDiseases: ['', [Validators.maxLength(300)]]
    });

    this.reminderForm = this.fb.group({
      emailEnabled: [true],
      smsEnabled: [true],
      defaultMinutesBefore: [60, [Validators.required]]
    });

    this.subs.add(
      this.dataService.appointments$.subscribe(apps => {
        this.appointments = apps;
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.slots$.subscribe(slots => {
        this.slots = slots;
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.medicalRecord$.subscribe(rec => {
        this.medicalRecord = rec;
        this.recordForm.patchValue({
          patientName: rec.patientName,
          birthDate: rec.birthDate,
          bloodType: rec.bloodType,
          policyNumber: rec.policyNumber,
          phone: rec.phone,
          email: rec.email,
          allergies: rec.allergies,
          chronicDiseases: rec.chronicDiseases
        });
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.reminderSettings$.subscribe((settings: ReminderSettings) => {
        this.reminderForm.patchValue(settings);
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get activeAppointments(): Appointment[] {
    return this.appointments.filter(a => a.status === 'confirmed' || a.status === 'rescheduled');
  }

  get availableSlotsForReschedule(): TimeSlot[] {
    if (!this.reschedulingAppointment || !this.rescheduleDate) return [];
    return this.slots
      .filter(
        s =>
          s.doctorId === this.reschedulingAppointment!.doctorId &&
          s.date === this.rescheduleDate &&
          s.status === 'available'
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  startReschedule(app: Appointment): void {
    this.reschedulingAppointment = app;
    this.selectedNewSlotId = null;
    const dates = Array.from(
      new Set(
        this.slots
          .filter(s => s.doctorId === app.doctorId && s.status === 'available')
          .map(s => s.date)
      )
    ).sort();
    this.rescheduleDates = dates;
    this.rescheduleDate = dates.length > 0 ? dates[0] : '';
  }

  selectRescheduleDate(d: string): void {
    this.rescheduleDate = d;
    this.selectedNewSlotId = null;
  }

  cancelReschedule(): void {
    this.reschedulingAppointment = null;
    this.selectedNewSlotId = null;
  }

  confirmReschedule(): void {
    if (!this.reschedulingAppointment || !this.selectedNewSlotId) return;
    const res = this.dataService.rescheduleAppointment(this.reschedulingAppointment.id, this.selectedNewSlotId);
    if (!res.success) {
      this.dataService.pushNotification(res.message, 'error');
      return;
    }
    this.cancelReschedule();
  }

  cancelAppointment(appointmentId: string): void {
    if (confirm('Вы уверены, что хотите отменить запись? Слот станет доступным для других пациентов.')) {
      this.dataService.cancelAppointment(appointmentId);
      if (this.reschedulingAppointment?.id === appointmentId) {
        this.cancelReschedule();
      }
    }
  }

  saveReminders(): void {
    if (this.reminderForm.invalid) return;
    this.dataService.updateReminderSettings(this.reminderForm.value);
  }

  sendTestReminder(app: Appointment): void {
    const settings = this.reminderForm.value;
    const channels: string[] = [];
    if (settings.emailEnabled) channels.push('Email');
    if (settings.smsEnabled) channels.push('SMS');
    const channelText = channels.length > 0 ? channels.join(' и ') : 'в личном кабинете';

    this.dataService.pushNotification(
      `Напоминание (${channelText}): приём у ${this.getDoctorName(app.doctorId)} ${this.dataService.formatDateRu(app.date)} в ${app.time}.`,
      'info'
    );
  }

  saveMedicalRecord(): void {
    this.recordSubmitted = true;
    if (this.recordForm.invalid) {
      this.recordForm.markAllAsTouched();
      this.dataService.pushNotification('Проверьте корректность заполнения полей медкарты.', 'error');
      return;
    }

    const v = this.recordForm.value;
    const updated: MedicalRecord = {
      patientName: v.patientName.trim(),
      birthDate: v.birthDate,
      bloodType: v.bloodType,
      policyNumber: v.policyNumber.trim(),
      phone: v.phone.trim(),
      email: v.email.trim(),
      allergies: (v.allergies || '').trim(),
      chronicDiseases: (v.chronicDiseases || '').trim(),
      history: this.medicalRecord?.history || []
    };
    this.dataService.updateMedicalRecord(updated);
    this.recordSubmitted = false;
  }

  isRecordInvalid(controlName: string): boolean {
    const ctrl = this.recordForm.get(controlName);
    return !!(ctrl && ctrl.invalid && (ctrl.touched || ctrl.dirty || this.recordSubmitted));
  }

  hasRecordError(controlName: string, code: string): boolean {
    const ctrl = this.recordForm.get(controlName);
    return !!(ctrl && ctrl.hasError(code) && (ctrl.touched || ctrl.dirty || this.recordSubmitted));
  }

  getStatusLabel(status: Appointment['status']): string {
    switch (status) {
      case 'confirmed': return 'Подтверждена';
      case 'rescheduled': return 'Перенесена';
      case 'cancelled': return 'Отменена';
      case 'completed': return 'Завершена';
    }
  }

  getStatusBadgeClass(status: Appointment['status']): string {
    switch (status) {
      case 'confirmed': return 'badge-success';
      case 'rescheduled': return 'badge-primary';
      case 'cancelled': return 'badge-danger';
      case 'completed': return 'badge-warning';
    }
  }

  getDoctorName(id: string): string {
    return this.dataService.getDoctorById(id)?.fullName || 'Врач';
  }

  getDoctorSpecialty(id: string): string {
    return this.dataService.getDoctorById(id)?.specialty || '';
  }

  getDoctorRoom(id: string): string {
    return this.dataService.getDoctorById(id)?.room || '';
  }

  getClinicName(id: string): string {
    return this.dataService.getClinicById(id)?.name || 'Клиника';
  }
}
