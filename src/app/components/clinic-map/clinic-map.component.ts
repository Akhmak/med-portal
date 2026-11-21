import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { Clinic } from '../../models/medical.models';

@Component({
  selector: 'app-clinic-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-wrapper">
      <div #mapContainer class="map-container"></div>
      <div class="map-legend">
        <span class="legend-item"><span class="dot dot-blue"></span> Клиника</span>
        <span class="legend-item"><span class="dot dot-green"></span> Выбранная клиника</span>
        <span class="legend-hint">Нажмите на метку на карте, чтобы выбрать филиал</span>
      </div>
    </div>
  `,
  styles: [`
    .map-wrapper {
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
    }
    .map-container {
      width: 100%;
      height: 300px;
      z-index: 1;
    }
    .map-legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      padding: 10px 14px;
      background: #f8fafc;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--text-muted);
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      color: var(--text);
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-blue { background: #0f62fe; }
    .dot-green { background: #198038; }
    .legend-hint {
      margin-left: auto;
      font-size: 12px;
    }
  `]
})
export class ClinicMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  @Input() clinics: Clinic[] = [];
  @Input() selectedClinicId: string | null = null;
  @Output() clinicSelected = new EventEmitter<string>();

  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private map: L.Map | null = null;
  private markers = new Map<string, L.Marker>();

  ngAfterViewInit(): void {
    this.initMap();
    this.renderMarkers();
    if (this.selectedClinicId) {
      this.focusClinic(this.selectedClinicId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['clinics'] || changes['selectedClinicId']) {
      this.renderMarkers();
    }
    if (changes['selectedClinicId'] && this.selectedClinicId) {
      this.focusClinic(this.selectedClinicId);
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [55.7558, 37.6173],
      zoom: 11
    });

    this.map.attributionControl.setPrefix(false);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // Корректный пересчёт размеров карты после рендера
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 100);
  }

  private createPinIcon(isSelected: boolean): L.DivIcon {
    const color = isSelected ? '#198038' : '#0f62fe';
    const scale = isSelected ? 'scale(1.2)' : 'scale(1)';
    return L.divIcon({
      className: 'custom-clinic-pin',
      html: `
        <div style="transform:${scale}; transform-origin: bottom center; display:flex; align-items:center; justify-content:center;">
          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.163 0 0 7.163 0 16C0 28 16 40 16 40C16 40 32 28 32 16C32 7.163 24.837 0 16 0Z" fill="${color}"/>
            <circle cx="16" cy="15" r="7" fill="white"/>
            <path d="M16 11.5V18.5M12.5 15H19.5" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </div>
      `,
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -36]
    });
  }

  private renderMarkers(): void {
    if (!this.map) return;

    this.markers.forEach(marker => marker.remove());
    this.markers.clear();

    for (const clinic of this.clinics) {
      const isSelected = clinic.id === this.selectedClinicId;
      const marker = L.marker([clinic.lat, clinic.lng], {
        icon: this.createPinIcon(isSelected)
      }).addTo(this.map);

      marker.bindPopup(`
        <div style="min-width: 190px; font-family: sans-serif;">
          <strong style="font-size: 14px; color: #0b2239;">${clinic.name}</strong><br/>
          <span style="font-size: 12px; color: #525252;">${clinic.address}</span><br/>
          <span style="font-size: 12px;">Тел: ${clinic.phone}</span><br/>
          <span style="font-size: 12px;">Режим: ${clinic.workHours}</span>
        </div>
      `);

      marker.on('click', () => {
        this.ngZone.run(() => {
          this.clinicSelected.emit(clinic.id);
          this.cdr.markForCheck();
        });
      });

      this.markers.set(clinic.id, marker);
    }
  }

  private focusClinic(clinicId: string): void {
    if (!this.map) return;
    const clinic = this.clinics.find(c => c.id === clinicId);
    const marker = this.markers.get(clinicId);
    if (clinic) {
      this.map.flyTo([clinic.lat, clinic.lng], 13, { duration: 0.6 });
    }
    if (marker) {
      marker.openPopup();
    }
  }
}
