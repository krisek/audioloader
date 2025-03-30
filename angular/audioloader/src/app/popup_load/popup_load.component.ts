import { Component,Input, Output, EventEmitter } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';


@Component({
  selector: 'app-popup-load',
  templateUrl: './popup_load.component.html',
  styleUrls: ['./popup_load.component.css']
})
export class PopupLoadComponent {

  @Input() name;
  @Input() action;
  @Input() stream;
  @Input() players;
  @Input() favicon;
  @Input() url;


  @Output() messageEvent = new EventEmitter<object>();

  constructor(public activeModal: NgbModal, private http: HttpClient) {
  }

  ngOnInit(){
    console.log(this.players);
    
    for(let i = 0; i < this.players.length; i++){
          this.players[i]['load'] = null;
    }

  }

  updateLoad(event, location){
    for(let i = 0; i < this.players.length; i++){
      if(this.players[i]['location'] == location){
        if (event.value == true) {
          this.players[i]['load'] = true;
        }
        if (event.value == false) {
          this.players[i]['load'] = false;
        }
        console.log('load: ' +this.players[i]['location'] + ' ' + this.players[i]['load']);
      }
    }

  };


   addDir(){
    console.log('popup_load emit enqueue ' + this.players );
    this.messageEvent.emit({'players': this.players});
   };

}
