import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export class CustomValidators {
  // Проверка ФИО: минимум 2 слова на кириллице
  static fullNameRu(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value || '').trim();
      if (!value) return null;
      const pattern = /^[А-ЯЁа-яё\-]+(\s+[А-ЯЁа-яё\-]+){1,2}$/;
      return pattern.test(value) ? null : { invalidFullName: true };
    };
  }

  // Проверка российского номера телефона (+7 (999) 123-45-67 или +79991234567 или 89991234567)
  static russianPhone(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const raw = (control.value || '').trim();
      if (!raw) return null;
      const digits = raw.replace(/\D/g, '');
      const valid = digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'));
      return valid ? null : { invalidPhone: true };
    };
  }

  // Проверка полиса ОМС: ровно 16 цифр
  static omsPolicy(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const raw = (control.value || '').trim();
      if (!raw) return null;
      const digits = raw.replace(/\s+/g, '');
      return /^\d{16}$/.test(digits) ? null : { invalidPolicy: true };
    };
  }

  // Проверка даты рождения: не в будущем и возраст от 0 до 120 лет
  static birthDateRange(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!value) return null;
      const date = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (isNaN(date.getTime())) {
        return { invalidDate: true };
      }
      if (date > today) {
        return { futureBirthDate: true };
      }
      const minDate = new Date();
      minDate.setFullYear(today.getFullYear() - 120);
      if (date < minDate) {
        return { tooOldBirthDate: true };
      }
      return null;
    };
  }

  // Проверка даты расписания (нельзя создавать слоты в прошлом)
  static notPastDate(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!value) return null;
      const selected = new Date(value + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return selected >= today ? null : { pastDate: true };
    };
  }
}
