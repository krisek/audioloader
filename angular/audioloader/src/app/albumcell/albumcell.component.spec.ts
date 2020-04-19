import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AlbumcellComponent } from './albumcell.component';

describe('AlbumcellComponent', () => {
  let component: AlbumcellComponent;
  let fixture: ComponentFixture<AlbumcellComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AlbumcellComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AlbumcellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
