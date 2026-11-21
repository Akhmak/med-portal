import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { BookingComponent } from './components/booking/booking.component';
import { PatientCabinetComponent } from './components/patient-cabinet/patient-cabinet.component';
import { AdminPanelComponent } from './components/admin-panel/admin-panel.component';
import { MedicalDataService } from './services/medical-data.service';

export const adminGuard: CanActivateFn = () => {
  const dataService = inject(MedicalDataService);
  const router = inject(Router);
  if (dataService.getRoleSnapshot() === 'admin') {
    return true;
  }
  dataService.pushNotification('Для доступа к админ-панели переключите роль на «Администратор».', 'warning');
  return router.createUrlTree(['/booking']);
};

export const routes: Routes = [
  { path: '', redirectTo: 'booking', pathMatch: 'full' },
  { path: 'booking', component: BookingComponent },
  { path: 'cabinet', component: PatientCabinetComponent },
  { path: 'admin', component: AdminPanelComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: 'booking' }
];
