import { Component,Input, Output, EventEmitter } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-popup',
  templateUrl: './popup.component.html',
  styleUrls: ['./popup.component.css']
})
export class PopupComponent {

  @Input() name;
  @Input() encoded;
  @Input() servicesBasePath;
  @Input() stream;
  @Input() target;

  @Output() messageEvent = new EventEmitter<string>();

  constructor(public activeModal: NgbModal, private http: HttpClient) {}

   addDir(dir){
    console.log('emit ' + dir);
    this.messageEvent.emit(dir);
   };

}
