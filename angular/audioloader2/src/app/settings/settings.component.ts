import { Component,Input, Output, EventEmitter } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';


@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent {
   @Output() messageEvent = new EventEmitter<string>();

  mpd_socket = "";
  stream = "";
  client_id = "";
  target = "";
  log = "";


  constructor(public activeModal: NgbModal) {}


  ngOnInit(){
    console.log("init NgbdModalSettings");

    if(typeof(localStorage.mpd_socket) != "undefined") this.mpd_socket = localStorage.mpd_socket;
    if(typeof(localStorage.stream) != "undefined") this.stream = localStorage.stream;
    if(typeof(localStorage.client_id) != "undefined") this.client_id = localStorage.client_id;
    if(typeof(localStorage.target) != "undefined") this.target = localStorage.target;
    if(typeof(localStorage.log) != "undefined") this.log = localStorage.log;


  };

  update(variable){
      if(variable == "mpd_socket") localStorage.mpd_socket = this.mpd_socket;
      if(variable == "stream") localStorage.stream = this.stream;
      if(variable == "client_id") localStorage.client_id = this.client_id;
      if(variable == "target") localStorage.target = this.target;
      if(variable == "log") localStorage.log = this.log;
      this.messageEvent.emit(variable);
  };



}
