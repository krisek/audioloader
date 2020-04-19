import { TestBed } from '@angular/core/testing';

import { ToastServiceService } from './toast-service.service';

describe('ToastServiceService', () => {
  let service: ToastServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
