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
  @Input() players;

  @Output() messageEvent = new EventEmitter<object>();

  constructor(public activeModal: NgbModal, private http: HttpClient) {
  }

  ngOnInit(){
    for(let i = 0; i < this.players.length; i++){
          this.players[i]['load'] = false;
    }

  }

  updateLoad(event, location){
    for(let i = 0; i < this.players.length; i++){
      if(this.players[i]['location'] == location){
        if (event.checked) {
          this.players[i]['load'] = true;
        }
        else{
          this.players[i]['load'] = false;

        }
        console.log('load: ' +this.players[i]['location'] + ' ' + this.players[i]['load']);
      }
    }

  };

   addDir(dir){
    var load = new Array();
    for(let i = 0; i < this.players.length; i++){
      if(this.players[i]['load']){
        load.push(i)
      }
    }
    console.log('emit ' + dir + ' enqueue ' + load.join(',') );
    this.messageEvent.emit({'dir': dir, 'load': load});
   };

}
