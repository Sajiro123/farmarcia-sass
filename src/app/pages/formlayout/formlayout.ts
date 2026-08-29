import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrimeModule } from '../../shared/prime.module';

@Component({
  selector: 'app-formlayout',
  standalone: true,
  imports: [CommonModule, FormsModule, PrimeModule],
  templateUrl: './formlayout.html'
})
export class FormlayoutDemo implements OnInit {
  // Form models
  verticalName: string = '';
  verticalEmail: string = '';
  verticalAge: number | null = null;

  gridName: string = '';
  gridEmail: string = '';
  gridAge: number | null = null;

  horizontalName: string = '';
  horizontalEmail: string = '';

  inlineFirstname: string = '';
  inlineLastname: string = '';

  helpUsername: string = '';

  advFirstname: string = '';
  advLastname: string = '';
  advAddress: string = '';
  advCity: string = '';
  advState: any = null;
  advZip: string = '';

  floatValue: string = '';
  iconSearchValue: string = '';
  selectedDropdown: any = null;

  states: any[] = [
    { name: 'Lima', code: 'LIM' },
    { name: 'Arequipa', code: 'ARE' },
    { name: 'Cusco', code: 'CUZ' },
    { name: 'La Libertad (Trujillo)', code: 'LAL' },
    { name: 'Piura', code: 'PIU' },
    { name: 'Lambayeque (Chiclayo)', code: 'LAM' },
    { name: 'Junín (Huancayo)', code: 'JUN' }
  ];

  dropdownOptions: any[] = [
    { label: 'Opción 1 - Estándar', value: 1 },
    { label: 'Opción 2 - Genérico', value: 2 },
    { label: 'Opción 3 - Institucional', value: 3 }
  ];

  ngOnInit(): void {}
}
