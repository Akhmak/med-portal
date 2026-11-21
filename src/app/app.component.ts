import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { MedicalDataService } from './services/medical-data.service';
import { AppNotification, Appointment, UserRole } from './models/medical.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <div class="header-inner">
        <a routerLink="/booking" class="brand">
          <span class="brand-icon">+</span>
          <div>
            <div class="brand-title">МедПортал</div>
            <div class="brand-sub">Сервис записи к врачу</div>
          </div>
        </a>

        <nav class="nav">
          <a routerLink="/booking" routerLinkActive="active" class="nav-link">Запись на приём</a>
          <a routerLink="/cabinet" routerLinkActive="active" class="nav-link">
            Личный кабинет и медкарта
            <span *ngIf="activeAppointmentsCount > 0" class="nav-badge">{{ activeAppointmentsCount }}</span>
          </a>
          <a *ngIf="role === 'admin'" routerLink="/admin" routerLinkActive="active" class="nav-link nav-admin">
            Админ-панель
          </a>
        </nav>

        <div class="role-switcher">
          <span class="role-label">Режим:</span>
          <button
            type="button"
            class="role-btn"
            [class.active]="role === 'patient'"
            (click)="switchRole('patient')">
            Пациент
          </button>
          <button
            type="button"
            class="role-btn"
            [class.active]="role === 'admin'"
            (click)="switchRole('admin')">
            Администратор
          </button>
        </div>
      </div>
    </header>

    <!-- Панель уведомлений -->
    <div class="toast-stack" *ngIf="notifications.length > 0">
      <div *ngFor="let n of notifications" class="toast" [ngClass]="'toast-' + n.type">
        <div class="toast-body">
          <span class="toast-time">{{ n.createdAt }}</span>
          <span>{{ n.message }}</span>
        </div>
        <button type="button" class="toast-close" (click)="dismiss(n.id)">&times;</button>
      </div>
    </div>

    <main class="container">
      <!-- Баннер ближайшего напоминания -->
      <div *ngIf="nearestAppointment" class="reminder-banner">
        <div>
          <strong>Напоминание о приёме:</strong>
          {{ dataService.formatDateRu(nearestAppointment.date) }} в {{ nearestAppointment.time }} —
          {{ getDoctorName(nearestAppointment.doctorId) }}
          ({{ getClinicName(nearestAppointment.clinicId) }}).
          Уведомление придёт за {{ nearestAppointment.reminderMinutesBefore }} мин.
        </div>
        <a routerLink="/cabinet" class="btn btn-secondary btn-sm">Управлять записью</a>
      </div>

      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    .header {
      background: #0b2239;
      color: #fff;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 12px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: #fff;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 9px;
      background: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
    }
    .brand-title {
      font-size: 17px;
      font-weight: 700;
      line-height: 1.1;
    }
    .brand-sub {
      font-size: 11px;
      color: #9fb3c8;
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .nav-link {
      color: #d9e2ec;
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .nav-link:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .nav-link.active {
      background: var(--primary);
      color: #fff;
    }
    .nav-admin.active {
      background: #198038;
    }
    .nav-badge {
      background: #fff;
      color: var(--primary);
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 999px;
    }
    .role-switcher {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.08);
      padding: 4px;
      border-radius: 8px;
    }
    .role-label {
      font-size: 12px;
      color: #bcccdc;
      padding: 0 6px;
    }
    .role-btn {
      border: none;
      background: transparent;
      color: #d9e2ec;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
    }
    .role-btn.active {
      background: #fff;
      color: #0b2239;
    }
    .toast-stack {
      position: fixed;
      top: 76px;
      right: 20px;
      z-index: 999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 360px;
    }
    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
      font-size: 13px;
      background: #fff;
      border-left: 4px solid var(--primary);
    }
    .toast-success { border-left-color: var(--success); background: #f3fff6; }
    .toast-warning { border-left-color: var(--warning); background: #fffdf0; }
    .toast-error { border-left-color: var(--danger); background: #fff5f5; }
    .toast-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .toast-time {
      font-size: 11px;
      color: var(--text-muted);
    }
    .toast-close {
      border: none;
      background: none;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      color: var(--text-muted);
    }
    .reminder-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: var(--primary-light);
      border: 1px solid #a6c8ff;
      color: #002d9c;
      padding: 12px 16px;
      border-radius: 10px;
      margin-bottom: 20px;
      font-size: 14px;
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  dataService = inject(MedicalDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  role: UserRole = 'patient';
  notifications: AppNotification[] = [];
  activeAppointmentsCount = 0;
  nearestAppointment: Appointment | null = null;

  private subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(
      this.dataService.role$.subscribe(role => {
        this.role = role;
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.notifications$.subscribe(list => {
        this.notifications = list;
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.dataService.appointments$.subscribe(apps => {
        const active = apps
          .filter(a => a.status === 'confirmed' || a.status === 'rescheduled')
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        this.activeAppointmentsCount = active.length;
        this.nearestAppointment = active.length > 0 ? active[0] : null;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  switchRole(role: UserRole): void {
    this.dataService.setRole(role);
    if (role === 'patient' && this.router.url.startsWith('/admin')) {
      this.router.navigate(['/booking']);
    } else if (role === 'admin') {
      this.router.navigate(['/admin']);
    }
  }

  dismiss(id: string): void {
    this.dataService.dismissNotification(id);
  }

  getDoctorName(id: string): string {
    return this.dataService.getDoctorById(id)?.fullName || 'Врач';
  }

  getClinicName(id: string): string {
    return this.dataService.getClinicById(id)?.name || 'Клиника';
  }
}
