import { NgModule } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { RadioButtonModule } from 'primeng/radiobutton';
import { CardModule } from 'primeng/card';
import { FluidModule } from 'primeng/fluid';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { FloatLabelModule } from 'primeng/floatlabel';
import { IftaLabelModule } from 'primeng/iftalabel';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ListboxModule } from 'primeng/listbox';
import { MultiSelectModule } from 'primeng/multiselect';

const PRIME_MODULES = [
  ButtonModule,
  InputTextModule,
  InputNumberModule,
  TextareaModule,
  SelectModule,
  CheckboxModule,
  RadioButtonModule,
  CardModule,
  FluidModule,
  IconFieldModule,
  InputIconModule,
  FloatLabelModule,
  IftaLabelModule,
  ToggleSwitchModule,
  DatePickerModule,
  AutoCompleteModule,
  ListboxModule,
  MultiSelectModule
];

@NgModule({
  imports: [...PRIME_MODULES],
  exports: [...PRIME_MODULES]
})
export class PrimeModule {}
