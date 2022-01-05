import { Component, ViewChild } from '@angular/core';
import { NavController } from '@ionic/angular';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { TitleBarForegroundMode, TitleBarIcon, TitleBarMenuItem } from 'src/app/components/titlebar/titlebar.types';
import { transparentPixelIconDataUrl } from 'src/app/helpers/picture.helpers';
import { App } from 'src/app/model/app.enum';
import { GlobalNavService } from 'src/app/services/global.nav.service';
import { Packet } from '../../model/packets.model';
import { PacketService } from '../../services/packet.service';

@Component({
  selector: 'page-home',
  templateUrl: 'home.html',
  styleUrls: ['./home.scss'],
})
export class HomePage {
  // UI components
  @ViewChild(TitleBarComponent, { static: true }) titleBar: TitleBarComponent;

  // Logic
  public fetchingPublicPackets = true;

  // Model
  public publicPackets: Packet[] = [];

  // Callbacks
  public titleBarIconClickedListener: (icon: TitleBarIcon | TitleBarMenuItem) => void;

  constructor(
    public navCtrl: NavController,
    private globalNavService: GlobalNavService,
    public packetService: PacketService
  ) { }

  ionViewWillEnter() {
    this.titleBar.setTitle("Red Packets");
    this.titleBar.setBackgroundColor("#701919");
    this.titleBar.setForegroundMode(TitleBarForegroundMode.LIGHT);

    this.titleBar.setMenuVisibility(true);
    this.titleBar.setupMenuItems([
      {
        key: "my-packets",
        iconPath: transparentPixelIconDataUrl(),
        title: "My packets"
      },
      {
        key: "opened-packets",
        iconPath: transparentPixelIconDataUrl(),
        title: "Opened packets"
      }
    ]);

    this.titleBar.addOnItemClickedListener(this.titleBarIconClickedListener = (icon) => {
      switch (icon.key) {
        case "my-packets":
          void this.globalNavService.navigateTo(App.RED_PACKETS, "/redpackets/my-packets");
          break;
        case "opened-packets":
          void this.globalNavService.navigateTo(App.RED_PACKETS, "/redpackets/opened-packets");
          break;
      }
    });
  }

  async ionViewDidEnter() {
    this.fetchingPublicPackets = true;
    this.publicPackets = await this.packetService.getPublicPackets();
    this.fetchingPublicPackets = false;
  }

  ionViewWillLeave() {
    this.titleBar.removeOnItemClickedListener(this.titleBarIconClickedListener);
  }

  public newPacket() {
    void this.globalNavService.navigateTo(App.RED_PACKETS, "/redpackets/new");
  }

  public openPacket(packet: Packet) {
    void this.globalNavService.navigateTo(App.RED_PACKETS, "/redpackets/packet-details", {
      state: {
        packet: packet
      }
    });
  }
}
