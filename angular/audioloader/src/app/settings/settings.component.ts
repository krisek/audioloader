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

  mpd_port = "";
  stream = "";
  client_id = "";
  log = "";
  list_from = 60;


  constructor(public activeModal: NgbModal) {}


  ngOnInit(){
    console.log("init NgbdModalSettings");

    if(typeof(localStorage.mpd_port) != "undefined") this.mpd_port = localStorage.mpd_port;
    if(typeof(localStorage.stream) != "undefined") this.stream = localStorage.stream;
    if(typeof(localStorage.client_id) != "undefined") this.client_id = localStorage.client_id;
    if(typeof(localStorage.log) != "undefined") this.log = localStorage.log;
    if(typeof(localStorage.list_from) != "undefined") this.list_from = localStorage.list_from;


  };

  update(variable){
      if(variable == "mpd_port") localStorage.mpd_port = this.mpd_port;
      if(variable == "stream"){
        localStorage.stream = this.stream;
        localStorage.stream_updated = true;
      }
      if(variable == "client_id") localStorage.client_id = this.client_id;
      if(variable == "log") localStorage.log = this.log;
      if(variable == "list_from") localStorage.list_from = this.list_from;
      this.messageEvent.emit(variable);
  };



}
