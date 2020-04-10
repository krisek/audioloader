import { Component,Input } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import {CommonModule} from '@angular/common';
import { AppConfigService } from './app-config-service.service';
import {NgbModal, NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';



@Component({
  selector: 'ngbd-modal-content',
  template: `
    <div class="modal-header" id="addPopup">
      <h5 style="text-align: center;" class="modal-title">Play {{name}}?</h5>

    </div>
    <div class="modal-body">

      <p style="text-align: center;"><img src="{{ servicesBasePath }}/cover?directory={{ encoded }}" height="92"/></p>

    </div>
    <div class="modal-footer">

      <button type="button" ngbAutofocus class="btn btn-primary" (click)="addDir(name);activeModal.close('Close click')">Yes</button>
      <button type="button" class="btn " (click)="activeModal.close('Close click')">Cancel</button>
    </div>

  `
})
export class NgbdModalContent {
  @Input() name;
  @Input() encoded;
  @Input() servicesBasePath;
  @Input() stream;
  @Input() target;



  constructor(public activeModal: NgbActiveModal, private http: HttpClient) {}

   addDir(dir){
    console.log("addDir: " + dir);


    this.http.get<any>(this.servicesBasePath + '/add?directory=' + encodeURIComponent(dir)).subscribe(data => {
      console.log(data);

    })
  };

}


@Component({
  selector: 'ngbd-modal-settings',
  template: `
    <div class="modal-header" id="settings">
      <h4 style="text-align: center;" class="modal-title">Settings</h4>

    </div>
    <div class="modal-body">

      MPD server: <input id="mpd_server" class="form-control" placeholder="localhost" name="mpd_server" [value]="mpd_server" (input)="mpd_server = $event.target.value; update('mpd_server')" onfocus="this.select();"><br/>
      MPD port: <input id="mpd_port" class="form-control" placeholder="6600" name="mpd_port" [value]="mpd_port" (input)="mpd_port = $event.target.value; update('mpd_port')" onfocus="this.select();"><br/>
      Stream (in MPD config): <input id="stream" class="form-control" placeholder="http://box.lxs.cloud:18080" name="stream" [value]="stream" (input)="stream = $event.target.value; update('stream')" onfocus="this.select();"><br/>
      Client: <input id="client_id" class="form-control" placeholder="x" name="client_id" [value]="client_id" (input)="client_id = $event.target.value; update('client_id')" onfocus="this.select();"><br/>
      Target: <input id="target" class="form-control" placeholder="kodi" name="target" [value]="target" (input)="target = $event.target.value; update('target')" onfocus="this.select();"><br/><br/>

    </div>
    <div class="modal-footer">
      <button type="button" class="btn " (click)="activeModal.close('Close click')">Close</button>
    </div>

  `
})
export class NgbdModalSettings {
  mpd_server = "";
  mpd_port = "";
  stream = "";
  client_id = "";
  target = "";


  constructor(public activeModal: NgbActiveModal) {}


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


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  //title = 'audioloader2';

  last_directory = '.';

  dir = '';
  encoded = '';
  title = '';
  short = '';
  path = [];
  tree_dir = {};
  tree_file = {};
  dirs = false;
  showlist = false;
  dircount = 0;
  list_dir = [];
  list_dir_alpha = {};
  list_alpha = [];
  lookfor = "";
  servicesBasePath = "";

  isMenuCollapsed = true;

  constructor(private environment: AppConfigService, private http: HttpClient, private modalService: NgbModal) {
    this.servicesBasePath = environment.config.servicesBasePath;
    }

  ngOnInit(){
    console.log("init");

    if(typeof(localStorage.last_directory) != "undefined"){
      this.last_directory = localStorage.last_directory;
    }
    this.showDir(this.last_directory);
  };



  displayTree(data){
    console.log('displayTree called');

    var ls = data;
    this.tree_dir = {};
    this.tree_file = {};
    this.dirs = false;

    this.showlist = false;
    this.dircount = 0;
    this.list_dir = new Array();
    this.list_dir_alpha = {};
    this.list_alpha = [];


    for(var i in ls.tree) {
      if('directory' in ls.tree[i]){
        this.dirs = true;
        var album = ls.tree[i].directory;
        this.dircount++;

        this.tree_dir[album] = ls.tree[i].count;
        this.tree_dir[album]['name'] = album;

        this.tree_dir[album]['encoded'] = encodeURIComponent(album);
        this.tree_dir[album]['title'] = this.baseName(album);
        this.tree_dir[album]['short'] = this.truncate(this.tree_dir[album]['title']);


        this.list_dir.push(album);
        var alpha = this.tree_dir[album]['title'].substring(0, 1);
          if(! (alpha in this.list_dir_alpha)){
            this.list_dir_alpha[alpha] = [];
          }
        this.list_dir_alpha[alpha].push(album)
        this.list_dir_alpha[alpha].sort(this.compareNC);
        this.list_alpha.push(alpha);
        this.list_alpha = Array.from(new Set(this.list_alpha))
        this.list_alpha.sort(this.compareNC);
        this.list_dir.sort(this.compareNC);
        this.list_dir = Array.from(new Set(this.list_dir))


      }
      if('file' in ls.tree[i]){
         if( ! ('title' in ls.tree[i])){
          ls.tree[i]['title'] = this.baseName(ls.tree[i]['file']);
         }


        this.tree_file[ls.tree[i]['file']] = ls.tree[i];

      }
    }

    if(this.dircount > 60){
      this.showlist = true;
    }
    console.log(this.tree_dir);
    console.log('tree_file');
    console.log(this.tree_file);
    //console.log(this.list_dir);




  };



  showDir(dir){
    console.log("showDir: " + dir);

    this.http.get<any>(this.servicesBasePath + '/ls?directory=' + encodeURIComponent(dir)).subscribe(data => {
      //console.log(data);
      this.displayTree(data);
    })

    this.updateDir(dir);

  };

  searchItem(lookfor){
    if(lookfor.length < 4) return;
    console.log("searchItem " + lookfor);

    this.http.get<any>(this.servicesBasePath + '/search?pattern=' + encodeURIComponent(lookfor)).subscribe(data => {
      console.log(data);
      this.displayTree(data);
    })
    this.last_directory = '.';
    if(typeof(localStorage.last_directory) != "undefined"){
      this.last_directory = localStorage.last_directory;
    }
    this.updateDir(this.last_directory);
  }



  addDir(dir){
    console.log("addDir: " + dir);


    this.http.get<any>(this.servicesBasePath + '/add?directory=' + encodeURIComponent(dir)).subscribe(data => {
      console.log("enqueued dir " + dir);
      this.http.get<any>(this.servicesBasePath + '/play').subscribe(data => {
      console.log("played dir");
      })

    })
  };



  updateDir(dir) {
    this.dir = dir;
    this.encoded = encodeURIComponent(dir);
    this.title = this.baseName(dir);
    this.short = this.truncate(dir);

    this.path = [];
    var pathcrawl = dir;
    while(pathcrawl.length > 0){
      this.path.push({'name': this.baseName(pathcrawl), 'dir': pathcrawl});
      if(pathcrawl == this.dirName(pathcrawl))break;

      pathcrawl = this.dirName(pathcrawl);

    }
    if(dir != '.') this.path.push({'name': '.', 'dir': '.'});

    this.path = this.path.reverse();

    localStorage.setItem('last_directory', dir);

    };


 openModal(dir) {
    const modalRef = this.modalService.open(NgbdModalContent);
    modalRef.componentInstance.name = dir;
    modalRef.componentInstance.encoded = encodeURIComponent(dir);
    modalRef.componentInstance.servicesBasePath = this.servicesBasePath;
  }

 openSettings() {
    console.log("openSettings");
    const modalRefSettings = this.modalService.open(NgbdModalSettings);
  }

  coverPress(dir){
    if(this.tree_dir[dir]['playtime']<7200){
      this.openModal(dir);
    }
    else{
      this.showDir(dir);
    }

  }

 dirName(path) {
    return path.replace(/\\/g,'/').replace(/\/[^\/]*$/, '');;
};

 baseName(path) {
    return path.replace(/\\/g,'/').replace( /.*\//, '' );
};

 compareNC(a, b) {
    var strA = a.toUpperCase();
    var strB = b.toUpperCase();

    return strA.localeCompare(strB);
};


  truncate(str, length?, ending?) {
    if (length == null) {
      length = 30;
    }
    if (ending == null) {
      ending = '…';
    }
    if (str.length > length) {
      return str.substring(0, length - ending.length) + ending;
    } else {
      return str;
    }
  };


}
