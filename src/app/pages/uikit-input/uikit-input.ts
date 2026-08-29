import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrimeModule } from '../../shared/prime.module';

@Component({
  selector: 'app-uikit-input',
  standalone: true,
  imports: [CommonModule, FormsModule, PrimeModule],
  templateUrl: './uikit-input.html'
})
export class UIKitInputDemo implements OnInit {
  // InputText
  inputTextDefault: string = 'Default';
  inputTextDisabled: string = 'Disabled';
  inputTextInvalid: string = 'Invalid';

  // Icons
  iconUsername: string = '';
  iconSearch: string = '';

  // Labels
  floatUsername: string = '';
  iftaUsername: string = '';

  // Textarea
  messageText: string = '';

  // AutoComplete
  selectedCountry: any = null;
  filteredCountries: any[] = [];
  countries: any[] = [
    { name: 'Peru', code: 'PE' },
    { name: 'United States', code: 'US' },
    { name: 'Spain', code: 'ES' },
    { name: 'Mexico', code: 'MX' },
    { name: 'Argentina', code: 'AR' },
    { name: 'Colombia', code: 'CO' },
    { name: 'Chile', code: 'CL' },
    { name: 'Germany', code: 'DE' }
  ];

  // DatePicker
  selectedDate: Date | null = null;

  // RadioButton
  selectedRadioCity: string = 'Chicago';

  // Checkbox
  selectedCheckboxCities: string[] = ['Chicago'];

  // ToggleSwitch
  toggleSwitchValue: boolean = true;

  // Listbox
  selectedListboxCity: any = null;
  listboxCities: any[] = [
    { name: 'New York', code: 'NY' },
    { name: 'Rome', code: 'RM' },
    { name: 'London', code: 'LDN' },
    { name: 'Istanbul', code: 'IST' },
    { name: 'Paris', code: 'PRS' }
  ];

  // Select
  selectedSelectCity: any = null;
  selectCities: any[] = [
    { name: 'Lima', code: 'LIM' },
    { name: 'New York', code: 'NY' },
    { name: 'Rome', code: 'RM' },
    { name: 'London', code: 'LDN' },
    { name: 'Paris', code: 'PRS' }
  ];

  // MultiSelect
  selectedMultiCountries: any[] = [];

  ngOnInit(): void {}

  filterCountry(event: any) {
    const query = event.query.toLowerCase();
    this.filteredCountries = this.countries.filter(c => 
      c.name.toLowerCase().includes(query)
    );
  }
}
