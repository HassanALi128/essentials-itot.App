import { Component, OnInit, ViewChild } from '@angular/core';
import { ToastController, PopoverController, ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';

import { GlobalStorageService } from 'src/app/services/global.storage.service';
import { AppTheme, GlobalThemeService } from 'src/app/services/global.theme.service';

import * as moment from 'moment';
import { OptionsComponent } from '../../components/options/options.component';
import { DIDManagerService } from '../../services/didmanager.service';
import { AppmanagerService } from '../../services/appmanager.service';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { GlobalNavService } from 'src/app/services/global.nav.service';
import { GlobalPreferencesService } from 'src/app/services/global.preferences.service';
import { TitleBarIconSlot, BuiltInIcon, TitleBarMenuItem, TitleBarIcon, TitleBarForegroundMode } from 'src/app/components/titlebar/titlebar.types';
import { Logger } from 'src/app/logger';
import { NotificationsPage } from '../notifications/notifications.page';
import { GlobalAppBackgroundService } from 'src/app/services/global.appbackground.service';
import { WalletManager, WalletStateOperation } from 'src/app/wallet/services/wallet.service';
import { Subscription } from 'rxjs';
import { GlobalDIDSessionsService } from 'src/app/services/global.didsessions.service';
import { GlobalHiveService } from 'src/app/services/global.hive.service';
import { GlobalNetworksService, MAINNET_TEMPLATE, TESTNET_TEMPLATE } from 'src/app/services/global.networks.service';
import { MasterWallet } from 'src/app/wallet/model/wallets/MasterWallet';
import { GlobalWalletConnectService } from 'src/app/services/global.walletconnect.service';
import WalletConnect from '@walletconnect/client';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})

export class HomePage implements OnInit {
  @ViewChild(TitleBarComponent, { static: true }) titleBar: TitleBarComponent;

  private popover: any = null;
  private modal: any = null;
  public identityNeedsBackup = false;
  private titleBarIconClickedListener: (icon: TitleBarIcon | TitleBarMenuItem) => void;
  private walletServiceSub: Subscription = null; // Subscription to wallet service initialize completion event
  private walletStateSub: Subscription = null; // Subscription to wallet service to know when a wallet is created, deleted
  private vaultStatusSub: Subscription = null; // Subscription to vault link status event
  private walletConnectSub: Subscription = null; // Subscription to wallet connect active sessions

  // Widget data
  private mainWallet: MasterWallet = null;
  public mainWalletName = "";
  public mainWalletELABalance: string = null; // Balance to display under the wallet menu item.
  public hiveVaultLinked = false;
  public hiveVaultStorageStats: {
    usedStorage: string; // Used storage, formatted for display, in GB
    maxStorage: string;  // Max storage, formatted for display, in GB
    usageRatio: number // usedStorage / maxStorage ratio, 0-1 numeric range
    percentUsage: string; // usedStorage / maxStorage ratio, 0-100% string
  } = null;
  public walletConnectConnectors: WalletConnect[] = [];

  constructor(
    public toastCtrl: ToastController,
    private popoverCtrl: PopoverController,
    public translate: TranslateService,
    public storage: GlobalStorageService,
    public theme: GlobalThemeService,
    public splashScreen: SplashScreen,
    public appService: AppmanagerService,
    public didService: DIDManagerService,
    private nav: GlobalNavService,
    private modalCtrl: ModalController,
    private appBackGroundService: GlobalAppBackgroundService,
    private walletService: WalletManager,
    private globalNetworksService: GlobalNetworksService,
    private globalHiveService: GlobalHiveService,
    private globalWalletConnectService: GlobalWalletConnectService,
    private didSessions: GlobalDIDSessionsService) {
  }

  ngOnInit() {
  }

  async ionViewWillEnter() {
   /*  setTimeout(()=>{
      const notification = {
        key: 'storagePlanExpiring',
        title: 'Storage Plan Expiring',
        message: 'You have a storage plan expiring soon. Please renew your plan before the expiration time.',
        app: App.WALLET
      };
      this.globalNotifications.sendNotification(notification);
    }, 2000); */

    this.titleBar.setTitle(this.translate.instant('common.elastos-essentials'));
    this.titleBar.setNavigationMode(null);
    this.titleBar.setIcon(TitleBarIconSlot.OUTER_RIGHT, {
      key: "notifications",
      iconPath:  BuiltInIcon.NOTIFICATIONS
    });
    this.titleBar.addOnItemClickedListener(this.titleBarIconClickedListener = (icon) => {
      if(icon.key === 'notifications') {
        void this.showNotifications();
      }
    });

    if(this.theme.darkMode) {
      this.titleBar.setTheme('#121212', TitleBarForegroundMode.LIGHT);
    } else {
      this.titleBar.setTheme('#F5F5FD', TitleBarForegroundMode.DARK);
    }

    this.identityNeedsBackup = !(await this.didSessions.activeIdentityWasBackedUp());

    if (this.didService.signedIdentity) { // Should not happend, just in case - for ionic hot reload
      this.globalNetworksService.activeNetworkTemplate.subscribe(template => {
        switch (template) {
          case MAINNET_TEMPLATE:
            this.titleBar.setTitle(this.translate.instant('common.elastos-essentials'));
          break;
          case TESTNET_TEMPLATE:
            this.titleBar.setTitle('TEST NET Active');
          break;
          case 'RegTest':
            this.titleBar.setTitle('Regression Net Active');
          break;
          case 'PrvNet':
            this.titleBar.setTitle('Private Net Active');
            break;
          case 'LrwNet':
            this.titleBar.setTitle('CR Private Net Active');
          break;
        }
      });
    }

    // Wait for wallet service to be initialized (existing wallets loaded) so we can display some balance
    // on the wallet widget.
    this.walletServiceSub = this.walletService.walletServiceStatus.subscribe((initializationComplete) => {
      if (initializationComplete) {
        this.updateWidgetMainWallet();
      }
    });

    this.walletStateSub = this.walletService.walletStateChanges.subscribe(state => {
      // If the wallet displayed on the widget is deleted, we update our screen
      if (this.mainWallet && state.operation == WalletStateOperation.DELETED && state.wallet.id == this.mainWallet.id) {
        this.updateWidgetMainWallet();
      }
      // Also re-enable the widget if we had no wallet and one just got created
      else if (!this.mainWallet && state.operation == WalletStateOperation.CREATED) {
        this.updateWidgetMainWallet();
      }
    });

    // Wait to know user's hive vault status to show the hive storage widget
    this.vaultStatusSub = this.globalHiveService.vaultStatus.subscribe((vaultStatus) => {
      if (vaultStatus && vaultStatus.publishedInfo && vaultStatus.publishedInfo.vaultAddress && vaultStatus.publishedInfo.activePricingPlan) {

        let usedStorageGb = (vaultStatus.publishedInfo.activePricingPlan.getCurrentDatabaseStorageUsed() + vaultStatus.publishedInfo.activePricingPlan.getCurrentFileStorageUsed()) / 1000;
        let maxStorageGb = vaultStatus.publishedInfo.activePricingPlan.getMaxStorage()/1000;

        this.hiveVaultStorageStats = {
          usedStorage: usedStorageGb.toFixed(2),
          maxStorage: maxStorageGb.toFixed(2),
          usageRatio: usedStorageGb / maxStorageGb,
          percentUsage: (100 * usedStorageGb / maxStorageGb).toFixed(1)
        };
        this.hiveVaultLinked = true;
      }
    });

    this.walletConnectSub = this.globalWalletConnectService.walletConnectSessionsStatus.subscribe(connectors => {
      this.walletConnectConnectors = Array.from(connectors.values());
      Logger.log("launcher", "Wallet connect connectors:", this.walletConnectConnectors);
    });
  }

  ionViewDidEnter() {
    // We are ready, we can hide the splash screen
    this.splashScreen.hide();
  }

  ionViewWillLeave() {
    if (this.walletServiceSub) {
      this.walletServiceSub.unsubscribe();
      this.walletServiceSub = null;
    }
    if (this.walletStateSub) {
      this.walletStateSub.unsubscribe();
      this.walletStateSub = null;
    }
    if (this.vaultStatusSub) {
      this.vaultStatusSub.unsubscribe();
      this.vaultStatusSub = null;
    }
    if (this.walletConnectSub) {
      this.walletConnectSub.unsubscribe();
      this.walletConnectSub = null;
    }

    this.titleBar.removeOnItemClickedListener(this.titleBarIconClickedListener);
    if (this.popover) {
      this.popover.dimiss();
    }
  }

  private updateWidgetMainWallet() {
    let wallets = this.walletService.getWalletsList();
    // We need to have at least one existing wallet to display something.
    if (wallets && wallets.length > 0) {
      // Simple widget for now: display the main balance of the first wallet we find.
      this.mainWallet = wallets[0];
      this.mainWalletName = wallets[0].name;
      this.mainWalletELABalance = wallets[0].getDisplayBalance().toFixed(2);
    }
    else {
      this.mainWallet = null;
      this.mainWalletName = "";
      this.mainWalletELABalance = null;
    }
  }

  async showNotifications() {
    this.modal = await this.modalCtrl.create({
        component: NotificationsPage,
        cssClass: 'running-modal',
        mode: 'ios',
    });
    this.modal.onDidDismiss().then(() => { this.modal = null; });
    await this.modal.present();
  }

  /************** Show App/Identity Options **************/
  async showOptions(ev: any) {
    Logger.log('Launcher', 'Opening options');

    this.popover = await this.popoverCtrl.create({
      mode: 'ios',
      component: OptionsComponent,
      componentProps: {
      },
      cssClass: this.theme.activeTheme.value == AppTheme.LIGHT ? 'launcher-options-component' : 'launcher-options-component-dark',
      event: ev,
      translucent: false
    });
    this.popover.onWillDismiss().then(() => {
      this.popover = null;
    });
    return await this.popover.present();
  }

  backupIdentity() {
    void this.nav.navigateTo("identitybackup", "/identity/backupdid");
  }

  showMyIdentity() {
    void this.nav.navigateTo("identity", '/identity/myprofile/home');
  }

  async signOut() {
    await this.appBackGroundService.stop();
    await this.didService.signOut();
  }

  getDateFromNow() {
    // return moment().format('dddd MMM Do') + ', ' + moment().format('LT');
    return moment().format('dddd, MMM Do');
  }

  /**
   * Opens the wallet connect sessions screen in settings
   */
  public showWalletConnectSessions() {
    void this.nav.navigateTo("settings", "/settings/walletconnect/sessions");
  }
}
