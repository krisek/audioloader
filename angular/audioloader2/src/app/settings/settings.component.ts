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
  mpd_server = "";
  mpd_port = "";
  stream = "";
  client_id = "";
  target = "";


  constructor(public activeModal: NgbModal) {}


  ngOnInit(){
    console.log("init NgbdModalSettings");

    if(typeof(localStorage.mpd_server) != "undefined") this.mpd_server = localStorage.mpd_server;
    if(typeof(localStorage.mpd_port) != "undefined") this.mpd_port = localStorage.mpd_port;
    if(typeof(localStorage.stream) != "undefined") this.stream = localStorage.stream;
    if(typeof(localStorage.client_id) != "undefined") this.client_id = localStorage.client_id;
    if(typeof(localStorage.target) != "undefined") this.target = localStorage.target;


  };

  update(variable){
      if(variable == "mpd_server") localStorage.mpd_server = this.mpd_server;
      if(variable == "mpd_port") localStorage.mpd_port = this.mpd_port;
      if(variable == "stream") localStorage.stream = this.stream;
      if(variable == "client_id") localStorage.client_id = this.client_id;
      if(variable == "target") localStorage.target = this.target;
  };



}
