import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { MedicalDataService } from '../../services/medical-data.service';
import { CustomValidators } from '../../validators/custom-validators';
import { Appointment, Doctor, TimeSlot } from '../../models/medical.models';

function hourRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = Number(group.get('startHour')?.value);
  const end = Number(group.get('endHour')?.value);
  if (!isNaN(start) && !isNaN(end) && end <= start) {
    return { invalidHourRange: true };
  }
  return null;
}

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="page-header">
      <h1>Админ-панель расписания</h1>
      <p class="subtitle">Генерация слотов приёма, блокировка окон и управление записями пациентов.</p>
    </div>

    <!-- Статистика -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val">{{ totalSlots }}</div>
        <div class="stat-lbl">Всего слотов</div>
      </div>
      <div class="stat-card stat-green">
        <div class="stat-val">{{ availableSlotsCount }}</div>
        <div class="stat-lbl">Свободных слотов</div>
      </div>
      <div class="stat-card stat-blue">
        <div class="stat-val">{{ activeAppointmentsCount }}</div>
        <div class="stat-lbl">Активных записей</div>
      </div>
      <div class="stat-card stat-gray">
        <div class="stat-val">{{ blockedSlotsCount }}</div>
        <div class="stat-lbl">Заблокировано</div>
      </div>
    </div>

    <div class="grid-2">
      <!-- Генератор расписания -->
      <section class="card">
        <h2>Генерация расписания</h2>

        <form [formGroup]="generateForm" (ngSubmit)="onGenerate()" novalidate>
          <div class="form-group">
            <label class="form-label">Врач *</label>
            <select
              class="form-control"
              formControlName="doctorId"
              [class.is-invalid]="isInvalid('doctorId')">
              <option *ngFor="let doc of doctors" [value]="doc.id">
                {{ doc.fullName }} ({{ doc.specialty }} — {{ getClinicName(doc.clinicId) }})
              </option>
            </select>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Дата приёма *</label>
              <input
                type="date"
                class="form-control"
                formControlName="date"
                [class.is-invalid]="isInvalid('date')">
              <span class="error-text" *ngIf="hasError('date', 'required')">Укажите дату.</span>
              <span class="error-text" *ngIf="hasError('date', 'pastDate')">
                Нельзя создавать расписание на прошедшую дату.
              </span>
            </div>

            <div class="form-group">
              <label class="form-label">Длительность слота *</label>
              <select class="form-control" formControlName="stepMinutes">
                <option [ngValue]="15">15 минут</option>
                <option [ngValue]="20">20 минут</option>
                <option [ngValue]="30">30 минут</option>
                <option [ngValue]="60">60 минут</option>
              </select>
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Начало приёма (час) *</label>
              <input
                type="number"
                class="form-control"
                formControlName="startHour"
                min="7"
                max="20"
                [class.is-invalid]="isInvalid('startHour') || generateForm.hasError('invalidHourRange')">
              <span class="error-text" *ngIf="hasError('startHour', 'min') || hasError('startHour', 'max')">
                Допустимо с 7 до 20 часов.
              </span>
            </div>

            <div class="form-group">
              <label class="form-label">Конец приёма (час) *</label>
              <input
                type="number"
                class="form-control"
                formControlName="endHour"
                min="8"
                max="22"
                [class.is-invalid]="isInvalid('endHour') || generateForm.hasError('invalidHourRange')">
              <span class="error-text" *ngIf="hasError('endHour', 'min') || hasError('endHour', 'max')">
                Допустимо с 8 до 22 часов.
              </span>
            </div>
          </div>

          <span class="error-text range-error" *ngIf="generateForm.hasError('invalidHourRange')">
            Время окончания приёма должно быть строго больше времени начала.
          </span>

          <button type="submit" class="btn btn-primary" [disabled]="generateForm.invalid">
            Сгенерировать слоты
          </button>
        </form>
      </section>

      <!-- Управление слотами на дату -->
      <section class="card">
        <h2>Управление слотами</h2>

        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Врач</label>
            <select class="form-control" [(ngModel)]="filterDoctorId">
              <option *ngFor="let doc of doctors" [value]="doc.id">
                {{ doc.fullName }} ({{ doc.specialty }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Дата</label>
            <input type="date" class="form-control" [(ngModel)]="filterDate">
          </div>
        </div>

        <div *ngIf="filteredSlots.length === 0" class="empty-inline">
          На выбранную дату у врача нет слотов. Сгенерируйте их в форме слева.
        </div>

        <div class="admin-slots-list">
          <div *ngFor="let slot of filteredSlots" class="admin-slot-row">
            <div>
              <strong class="slot-time-lbl">{{ slot.time }}</strong>
              <span class="badge" [ngClass]="getSlotBadgeClass(slot.status)">
                {{ getSlotStatusText(slot.status) }}
              </span>
            </div>

            <div class="slot-row-actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                [disabled]="slot.status === 'booked'"
                (click)="toggleBlock(slot)">
                {{ slot.status === 'blocked' ? 'Разблокировать' : 'Заблокировать' }}
              </button>
              <button
                type="button"
                class="btn btn-danger btn-sm"
                [disabled]="slot.status === 'booked'"
                (click)="removeSlot(slot)">
                Удалить
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Журнал записей -->
    <section class="card">
      <div class="table-head">
        <h2>Журнал записей пациентов</h2>
        <div class="filter-pills">
          <button
            type="button"
            class="chip"
            [class.active]="appointmentFilter === 'all'"
            (click)="appointmentFilter = 'all'">
            Все ({{ appointments.length }})
          </button>
          <button
            type="button"
            class="chip"
            [class.active]="appointmentFilter === 'active'"
            (click)="appointmentFilter = 'active'">
            Активные ({{ activeAppointmentsCount }})
          </button>
          <button
            type="button"
            class="chip"
            [class.active]="appointmentFilter === 'cancelled'"
            (click)="appointmentFilter = 'cancelled'">
            Отменённые
          </button>
        </div>
      </div>

      <div *ngIf="filteredAppointments.length === 0" class="empty-inline">
        Записи по выбранному фильтру отсутствуют.
      </div>

      <div class="table-wrap" *ngIf="filteredAppointments.length > 0">
        <table class="table">
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Врач / Клиника</th>
              <th>Пациент</th>
              <th>Контакты / Полис</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let app of filteredAppointments">
              <td>
                <strong>{{ dataService.formatDateRu(app.date) }}</strong><br>
                <span>{{ app.time }}</span>
              </td>
              <td>
                <div>{{ getDoctorName(app.doctorId) }}</div>
                <div class="muted">{{ getClinicName(app.clinicId) }}</div>
              </td>
              <td>
                <div><strong>{{ app.patientName }}</strong></div>
                <div class="muted" *ngIf="app.complaints">Жалобы: {{ app.complaints }}</div>
              </td>
              <td>
                <div>{{ app.patientPhone }}</div>
                <div class="muted">ОМС: {{ app.policyNumber }}</div>
              </td>
              <td>
                <span class="badge" [ngClass]="getAppBadgeClass(app.status)">
                  {{ getAppStatusLabel(app.status) }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-danger btn-sm"
                  *ngIf="app.status === 'confirmed' || app.status === 'rescheduled'"
                  (click)="cancelByAdmin(app.id)">
                  Отменить
                </button>
                <span *ngIf="app.status === 'cancelled'" class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .page-header { margin-bottom: 18px; }
    .subtitle { color: var(--text-muted); margin-top: -6px; }
    .muted { font-size: 12px; color: var(--text-muted); }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 20px;
    }
    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-card {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .stat-val { font-size: 26px; font-weight: 800; color: #0b2239; }
    .stat-lbl { font-size: 13px; color: var(--text-muted); }
    .stat-green .stat-val { color: var(--success); }
    .stat-blue .stat-val { color: var(--primary); }
    .stat-gray .stat-val { color: #6f7782; }

    .range-error {
      margin-top: -8px;
      margin-bottom: 14px;
    }

    .admin-slots-list {
      max-height: 310px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .admin-slot-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fafcff;
    }
    .slot-time-lbl {
      margin-right: 10px;
      font-size: 15px;
    }
    .slot-row-actions {
      display: flex;
      gap: 6px;
    }

    .table-head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .table-head h2 { margin-bottom: 0; }
    .filter-pills { display: flex; gap: 8px; }
    .chip {
      border: 1px solid var(--border);
      background: #fff;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      cursor: pointer;
    }
    .chip.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .table-wrap { overflow-x: auto; }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .table th, .table td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .table th {
      background: #f8fafc;
      font-weight: 700;
      color: #262626;
    }

    .empty-inline {
      padding: 14px;
      background: #f8fafc;
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 13px;
      text-align: center;
    }
  `]
})
export class AdminPanelComponent implements OnInit, OnDestroy {
  dataService = inject(MedicalDataService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  doctors: Doctor[] = [];
  slots: TimeSlot[] = [];
  appointments: Appointment[] = [];

  filterDoctorId = 'd1';
  filterDate = new Date().toISOString().split('T')[0];
  appointmentFilter: 'all' | 'active' | 'cancelled' = 'all';

  generateForm!: FormGroup;
  submitted = false;
  private subs = new Subscription();

  ngOnInit(): void {
    const todayIso = new Date().toISOString().split('T')[0];

    this.generateForm = this.fb.group(
      {
        doctorId: ['d1', [Validators.required]],
        date: [todayIso, [Validators.required, CustomValidators.notPastDate()]],
        startHour: [9, [Validators.required, Validators.min(7), Validators.max(20)]],
        endHour: [17, [Validators.required, Validators.min(8), Validators.max(22)]],
        stepMinutes: [30, [Validators.required]]
      },
      { validators: hourRangeValidator }
    );

    this.subs.add(
      this.dataService.doctors$.subscribe(docs => {
        this.doctors = docs;
        if (docs.length > 0 && !docs.some(d => d.id === this.filterDoctorId)) {
          this.filterDoctorId = docs[0].id;
          this.generateForm.patchValue({ doctorId: docs[0].id });
        }
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
      this.dataService.appointments$.subscribe(apps => {
        this.appointments = apps;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get totalSlots(): number {
    return this.slots.length;
  }

  get availableSlotsCount(): number {
    return this.slots.filter(s => s.status === 'available').length;
  }

  get blockedSlotsCount(): number {
    return this.slots.filter(s => s.status === 'blocked').length;
  }

  get activeAppointmentsCount(): number {
    return this.appointments.filter(a => a.status === 'confirmed' || a.status === 'rescheduled').length;
  }

  get filteredSlots(): TimeSlot[] {
    return this.slots
      .filter(s => s.doctorId === this.filterDoctorId && s.date === this.filterDate)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  get filteredAppointments(): Appointment[] {
    if (this.appointmentFilter === 'active') {
      return this.appointments.filter(a => a.status === 'confirmed' || a.status === 'rescheduled');
    }
    if (this.appointmentFilter === 'cancelled') {
      return this.appointments.filter(a => a.status === 'cancelled');
    }
    return this.appointments;
  }

  onGenerate(): void {
    this.submitted = true;
    if (this.generateForm.invalid) {
      this.generateForm.markAllAsTouched();
      return;
    }

    const { doctorId, date, startHour, endHour, stepMinutes } = this.generateForm.value;
    this.dataService.generateSlots(doctorId, date, Number(startHour), Number(endHour), Number(stepMinutes));
    this.filterDoctorId = doctorId;
    this.filterDate = date;
    this.submitted = false;
  }

  toggleBlock(slot: TimeSlot): void {
    const res = this.dataService.toggleSlotBlock(slot.id);
    if (!res.success) {
      this.dataService.pushNotification(res.message, 'error');
    }
  }

  removeSlot(slot: TimeSlot): void {
    const res = this.dataService.deleteSlot(slot.id);
    if (!res.success) {
      this.dataService.pushNotification(res.message, 'error');
    }
  }

  cancelByAdmin(appointmentId: string): void {
    if (confirm('Отменить запись пациента? Слот снова станет свободным.')) {
      this.dataService.cancelAppointment(appointmentId);
    }
  }

  isInvalid(controlName: string): boolean {
    const ctrl = this.generateForm.get(controlName);
    return !!(ctrl && ctrl.invalid && (ctrl.touched || ctrl.dirty || this.submitted));
  }

  hasError(controlName: string, code: string): boolean {
    const ctrl = this.generateForm.get(controlName);
    return !!(ctrl && ctrl.hasError(code) && (ctrl.touched || ctrl.dirty || this.submitted));
  }

  getSlotStatusText(status: TimeSlot['status']): string {
    switch (status) {
      case 'available': return 'Свободен';
      case 'booked': return 'Занят';
      case 'blocked': return 'Заблокирован';
    }
  }

  getSlotBadgeClass(status: TimeSlot['status']): string {
    switch (status) {
      case 'available': return 'badge-success';
      case 'booked': return 'badge-danger';
      case 'blocked': return 'badge-warning';
    }
  }

  getAppStatusLabel(status: Appointment['status']): string {
    switch (status) {
      case 'confirmed': return 'Подтверждена';
      case 'rescheduled': return 'Перенесена';
      case 'cancelled': return 'Отменена';
      case 'completed': return 'Завершена';
    }
  }

  getAppBadgeClass(status: Appointment['status']): string {
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

  getClinicName(id: string): string {
    return this.dataService.getClinicById(id)?.name || 'Клиника';
  }
}
