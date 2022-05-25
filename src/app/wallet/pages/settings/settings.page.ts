/*
 * Copyright (c) 2021 Elastos Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Component, OnInit, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { GlobalNativeService } from 'src/app/services/global.native.service';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { MenuSheetMenu } from '../../../components/menu-sheet/menu-sheet.component';
import { Native } from '../../services/native.service';
import { WalletCreationService } from '../../services/walletcreation.service';

type Action = () => Promise<void> | void;

type SettingsEntry = {
    routeOrAction: string | Action;
    title: string;
    subtitle: string;
    icon: string;
    iconDarkmode: string;
    type: string
}

@Component({
    selector: 'app-settings',
    templateUrl: './settings.page.html',
    styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
    @ViewChild(TitleBarComponent, { static: true }) titleBar: TitleBarComponent;

    public masterWalletId = "1";
    public masterWalletType = "";
    public readonly = "";
    public currentLanguageName = "";
    public isShowDeposit = false;
    public fee = 0;
    public walletInfo = {};
    public password = "";
    public available = 0;
    public settings: SettingsEntry[] = [
        {
            routeOrAction: () => this.addWallet(),
            title: this.translate.instant("wallet.settings-add-wallet"),
            subtitle: this.translate.instant("wallet.settings-add-wallet-subtitle"),
            icon: '/assets/wallet/settings/wallet.svg',
            iconDarkmode: '/assets/wallet/settings/darkmode/wallet.svg',
            type: 'launcher'
        },
        {
            routeOrAction: "/wallet/wallet-manager",
            title: this.translate.instant("wallet.settings-my-wallets"),
            subtitle: this.translate.instant("wallet.settings-my-wallets-subtitle"),
            icon: '/assets/wallet/settings/wallet.svg',
            iconDarkmode: '/assets/wallet/settings/darkmode/wallet.svg',
            type: 'wallet-manager'
        },
        {
            routeOrAction: "/wallet/settings/currency-select",
            title: this.translate.instant("wallet.settings-currency"),
            subtitle: this.translate.instant("wallet.settings-currency-subtitle"),
            icon: '/assets/wallet/settings/currency.svg',
            iconDarkmode: '/assets/wallet/settings/darkmode/currency.svg',
            type: 'currency-select'
        },
        {
            routeOrAction: "/wallet/settings/manage-networks",
            title: this.translate.instant("wallet.settings-manage-networks"),
            subtitle: this.translate.instant("wallet.settings-manage-networks-subtitle"),
            icon: '/assets/wallet/settings/custom-networks.svg',
            iconDarkmode: '/assets/wallet/settings/darkmode/custom-networks.svg',
            type: 'manage-networks'
        },
    ];

    constructor(
        public theme: GlobalThemeService,
        private translate: TranslateService,
        private native: Native,
        private walletCreationService: WalletCreationService,
        private modalCtrl: ModalController,
        private globalNativeService: GlobalNativeService,
    ) {
    }

    ngOnInit() {
    }

    ionViewWillEnter() {
        this.titleBar.setTitle(this.translate.instant("wallet.settings-title"));
    }

    public go(item: SettingsEntry) {
        if (typeof item.routeOrAction === "string") {
            if (item.type === 'launcher')
                this.native.go(item.routeOrAction, { from: 'settings' })
            else
                this.native.go(item.routeOrAction);
        }
        else {
            void item.routeOrAction();
        }
    }

    private addWallet() {
        let menu: MenuSheetMenu = {
            title: "Add Wallet",
            items: [
                {
                    title: "Standard Wallet",
                    items: [
                        {
                            title: "New Wallet",
                            routeOrAction: () => {
                                this.createStandardWallet();
                            }
                        },
                        {
                            title: "Import Wallet",
                            items: [
                                {
                                    title: "Mnemonic / Paper key",
                                    routeOrAction: () => {
                                        this.importStandardWallet();
                                    }
                                },
                                {
                                    title: "Private key",
                                    routeOrAction: () => {
                                        // TODO: differenciate from mnemonic menu item just above
                                        this.importStandardWallet();
                                    }
                                },
                                /* TODO {
                                  title: "Keystore file",
                                  action: () => { console.log("xxx") }
                                } */
                            ]
                        }
                    ]
                },
                {
                    title: "Multi Signature Wallet",
                    items: [
                        {
                            title: "Elastos mainchain",
                            routeOrAction: "/wallet/multisig/standard/create"
                        }
                    ]
                },
                {
                    title: "Connect H/W Wallet",
                    items: [
                        {
                            icon: "assets/wallet/icons/ledger.svg",
                            title: "Ledger Nano X",
                            routeOrAction: "/wallet/ledger/scan"
                        }
                    ]
                }
            ]
        };

        void this.globalNativeService.showGenericBottomSheetMenuChooser(menu);
    }


    createStandardWallet() {
        this.walletCreationService.reset();
        this.walletCreationService.isMulti = false;
        this.walletCreationService.type = 1; // new
        this.native.go("/wallet/wallet-create");
    }

    importStandardWallet() {
        this.walletCreationService.reset();
        this.walletCreationService.isMulti = false;
        this.walletCreationService.type = 2; // import
        this.native.go("/wallet/wallet-create");
    }
}
