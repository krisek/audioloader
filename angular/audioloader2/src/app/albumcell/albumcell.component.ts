import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-albumcell',
  templateUrl: './albumcell.component.html',
  styleUrls: ['./albumcell.component.css']
})
export class AlbumcellComponent implements OnInit {
  @Input() album;
  @Input() area;
  @Input() servicesBasePath;

  @Output() messageEvent = new EventEmitter<object>();
  constructor() { }

  ngOnInit(): void {
  }

  processAction(action){
    console.log('emit ' + this.album['name'] + ' action ' + action + ' area:'+this.area);
    this.messageEvent.emit({'dir': this.album['name'], 'playtime': this.album['playtime'],'action': action, 'area': this.area});
  };




}
