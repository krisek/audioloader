import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PopupLoadComponent } from './popup_load.component';

describe('PopupLoadComponent', () => {
  let component: PopupLoadComponent;
  let fixture: ComponentFixture<PopupLoadComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PopupLoadComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PopupLoadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
