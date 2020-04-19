import { Component,Input, Output, EventEmitter } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { AppConfigService } from './app-config-service.service';
import { SettingsComponent } from './settings/settings.component';
import { PopupComponent } from './popup/popup.component';
import { ToastComponent } from './toast/toast.component';
import { AlbumcellComponent } from './albumcell/albumcell.component';

import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { trigger, state, style, animate, transition } from '@angular/animations';

import { ToastService } from './toast-service.service';

@Component({
  selector: 'app-root',
  animations: [
    trigger('loadingTrigger', [
      state('normal', style({
        //backgroundColor: 'yellow'
      })),
      state('loading', style({
        color: '#c0c0c0',
        background: '#555555',
        backgroundColor: '#555555'

      })),
      transition('normal => loading', [
        animate('1s')
      ]),
      transition('loading => normal', [
        animate('1s')
      ]),
    ]),



  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  //title = 'audioloader2';


  loading = {
    'kodiload': false,
    'kodistop': false,
    'play': false,
    'pause': false,
    'stop': false,
    'prev': false,
    'next': false,
    'currentsong': false
  }



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
  list_dir_dash = {
    history: [],
    randomset: []
  }


  list_dir_alpha = {};
  list_alpha = [];
  lookfor = "";
  servicesBasePath = "";

  isMenuCollapsed = true;

  settings = {}

  currentsong = {'title': 'not playing', 'active': false, 'title_short': 'not playing', 'album': '', 'track': '', 'artist': ''};

  dash = false;
  active_area = "browser";

  constructor(private environment: AppConfigService, private http: HttpClient, private modalService: NgbModal, private http2: HttpClient, public toastService: ToastService) {
    this.servicesBasePath = environment.config.servicesBasePath;
    }

  ngOnInit(){
    console.log("init");

    if(typeof(localStorage.last_directory) != "undefined"){
      this.last_directory = localStorage.last_directory;
    }

    this.settings['mpd_socket'] = localStorage['mpd_socket'];
    this.settings['stream'] = localStorage['stream'];
    this.settings['client_id'] = localStorage['client_id'];
    this.settings['target'] = localStorage['target'];
    this.settings['log'] = localStorage['log'];




    if(typeof(this.settings['client_id']) == 'undefined' || this.settings['client_id'] == ""){
      this.settings['client_id'] = 'guest';
    }

    if(typeof(this.settings['mpd_socket']) == 'undefined' || this.settings['mpd_socket'] == ""){
      this.settings['mpd_socket'] = '/run/mpd/socket';
    }



    this.dir = this.last_directory;
    //this.showDir(this.last_directory);
    this.showDash();

    this.pollCurrentsong();

  };

  delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  };

  pollCurrentsong(){
    this.http2.get<any>(this.servicesBasePath + '/poll_currentsong').subscribe(data => {
      //console.log(data);
      this.currentsong = data;
      this.currentsong['title_short'] = this.truncate(this.currentsong['title'], 28);
      if(this.settings['log'] == 'debug'){
          console.log(this.currentsong);
      }
      this.pollCurrentsong();
    },
    async error => {
      console.log('error polling currentsong');
      await this.delay(5000);
      this.pollCurrentsong();
    });


  };

  updateCurrentSong(){
    this.loading['currentsong'] = true;

    this.http.get<any>(this.servicesBasePath + '/currentsong').subscribe(data => {
      //console.log(data);

      this.currentsong = data;
      this.loading['currentsong'] = false;
      this.currentsong['title_short'] = this.truncate(this.currentsong['title'], 28);
      console.log(this.currentsong);
    })

  };

  showSuccess(text) {
    this.toastService.show(text, { classname: 'bg-success text-light', delay: 2000 });
  }

  showDanger(text) {
    this.toastService.show(text, { classname: 'bg-danger text-light', delay: 5000 });
  }

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

  updateSpec(spec){

    this.http.get<any>(this.servicesBasePath + '/'+ spec +'?client_id=' + this.settings['client_id']).subscribe(data => {
        console.log('got ' + spec);
        console.log(data);
        this.list_dir_dash[spec] = [];
        for(var i in data.tree){
          if('directory' in data.tree[i]){

            var album = data.tree[i].directory;
            var album_title = this.baseName(album);
            this.list_dir_dash[spec].push({
                    'name': album,
                    'encoded': encodeURIComponent(album),
                    'title': album_title,
                    'short': this.truncate(album_title),
                    'playhours': data.tree[i].count.playhours,
                    'playtime': data.tree[i].count.playtime
                    }
            );
          }
        }
      })


  }

  newSet(){

    this.http.get<any>(this.servicesBasePath + '/generate_randomset?client_id=' + this.settings['client_id']).subscribe(data => {
      this.updateSpec('randomset');
      this.showSuccess('new set generated');
    });

  }



  showDash(){
    this.dash = true;
    console.log('show Dash called');


    var specs = ['history', 'randomset'];
    for(var i = 0; i < specs.length; i++){
      console.log(specs[i]);
      var spec = specs[i];
      this.updateSpec(spec);
    }



  };

  showDir(dir){
    console.log("showDir: " + dir);
    this.dash = false;
    this.http.get<any>(this.servicesBasePath + '/ls?directory=' + encodeURIComponent(dir)).subscribe(data => {
      //console.log(data);
      this.displayTree(data);
    })

    this.updateDir(dir);

  };

  searchItem(lookfor){
    if(lookfor.length < 4) return;
    console.log("searchItem " + lookfor);
    this.dash = false;
    this.active_area = "browser";
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



  addDir(addObject){
    console.log("addDir: " + addObject['dir']);


    this.http.get<any>(this.servicesBasePath + '/addplay?directory=' + encodeURIComponent(addObject['dir']) + '&client_id=' + this.settings['client_id']  ).subscribe(data => {
      console.log("enqueued dir ");
      this.showSuccess('loaded ' + this.truncate(this.baseName(addObject['dir']), 10))
      this.updateSpec('history');

      this.updateCurrentSong();
      if(addObject['load']){
        this.openStream();
      }

    })
  };

  sendCommand(command){
    console.log("sendCommand: " + command);
    this.loading[command] = true;

    this.http.get<any>(this.servicesBasePath + '/' + command).subscribe(data => {
      console.log("returned " + command);
      this.loading[command] = false;
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

  processAlbumCellAction(event){
    switch(event['action']){
      case 'showDir':
        this.dash = false;
        this.active_area = "browser";
        this.showDir(event['dir']);
        break;
      case  'openModal':
        this.openModal(event['dir']);
        break;
      case 'coverPress':
        this.coverPressArea(event['dir'], event['playtime']);
        break;
      }


  }

  openModal(dir) {
    const modalRef = this.modalService.open(PopupComponent);
    modalRef.componentInstance.name = dir;
    modalRef.componentInstance.encoded = encodeURIComponent(dir);
    modalRef.componentInstance.servicesBasePath = this.servicesBasePath;

    modalRef.componentInstance.messageEvent.subscribe((receivedEntry) => {
      console.log("openModal returned: " + receivedEntry['dir'] + " " + receivedEntry['load']);
      this.addDir(receivedEntry);
    })

  }

 openSettings() {
    console.log("openSettings");
    const modalRefSettings = this.modalService.open(SettingsComponent);

    modalRefSettings.componentInstance.messageEvent.subscribe((receivedEntry) => {
      console.log("openModal returned: " + receivedEntry);
      this.settings[receivedEntry] = localStorage[receivedEntry];
    })

  }

  openStream(){
    console.log("openStream");
    this.loading['kodiload'] = true;
    //http://localhost:5000/kodi?server=192.168.1.51&action=Player.Open&stream=http://192.168.1.185:18080/audio.mp3"
    this.http.get<any>(this.servicesBasePath + '/kodi?action=Player.Open&server=' + localStorage['target'] + "&stream=" + localStorage['stream']).subscribe(data => {
      this.loading['kodiload'] = false;
      console.log("stream opened ");
      this.showSuccess('loaded to kodi');
    },
    async error => {
      console.log('error open stream');
      this.showDanger('error loading to kodi');
    })

  }

  stopStream(){
    console.log("stopStream");
        this.loading['kodistop'] = true;

    this.http.get<any>(this.servicesBasePath + '/kodi?action=Player.Stop&server=' + localStorage['target'] + "&stream=" + localStorage['stream']).subscribe(data => {
      this.loading['kodistop'] = false;
      console.log("stream stopped");
      this.showSuccess('unloaded from kodi');
    })

  }



  coverPressArea(dir, playtime){
    if(playtime<7200){
      this.openModal(dir);
    }
    else{
      this.showDir(dir);
    }
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
