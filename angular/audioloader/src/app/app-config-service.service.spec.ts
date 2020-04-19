import { TestBed } from '@angular/core/testing';

import { AppConfigServiceService } from './app-config-service.service';

describe('AppConfigServiceService', () => {
  let service: AppConfigServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AppConfigServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
