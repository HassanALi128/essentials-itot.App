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

import { Component, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { IonSlides } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import BigNumber from 'bignumber.js';
import { Subscription } from 'rxjs';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { BuiltInIcon, TitleBarIcon, TitleBarIconSlot, TitleBarMenuItem } from 'src/app/components/titlebar/titlebar.types';
import { GlobalEvents } from 'src/app/services/global.events.service';
import { GlobalFirebaseService } from 'src/app/services/global.firebase.service';
import { GlobalPopupService } from 'src/app/services/global.popup.service';
import { GlobalStartupService } from 'src/app/services/global.startup.service';
import { GlobalThemeService } from 'src/app/services/theming/global.theme.service';
import { CoinType } from 'src/app/wallet/model/coin';
import { LedgerMasterWallet } from 'src/app/wallet/model/masterwallets/ledger.masterwallet';
import { WalletType } from 'src/app/wallet/model/masterwallets/wallet.types';
import { AnyNetworkWallet } from 'src/app/wallet/model/networks/base/networkwallets/networkwallet';
import { MainChainSubWallet } from 'src/app/wallet/model/networks/elastos/mainchain/subwallets/mainchain.subwallet';
import { NFT } from 'src/app/wallet/model/networks/evms/nfts/nft';
import { AnyNetwork } from 'src/app/wallet/model/networks/network';
import { TronSubWallet } from 'src/app/wallet/model/networks/tron/subwallets/tron.subwallet';
import { WalletUtil } from 'src/app/wallet/model/wallet.util';
import { WalletSortType } from 'src/app/wallet/model/walletaccount';
import { DefiService, StakingData } from 'src/app/wallet/services/evm/defi.service';
import { WalletNetworkService } from 'src/app/wallet/services/network.service';
import { WalletNetworkUIService } from 'src/app/wallet/services/network.ui.service';
import { WalletUIService } from 'src/app/wallet/services/wallet.ui.service';
import { Config } from '../../../config/Config';
import { MasterWallet } from '../../../model/masterwallets/masterwallet';
import { MainCoinSubWallet } from '../../../model/networks/base/subwallets/maincoin.subwallet';
import { AnySubWallet } from '../../../model/networks/base/subwallets/subwallet';
import { CurrencyService } from '../../../services/currency.service';
import { Native } from '../../../services/native.service';
import { LocalStorage } from '../../../services/storage.service';
import { UiService } from '../../../services/ui.service';
import { WalletService } from '../../../services/wallet.service';
import { WalletEditionService } from '../../../services/walletedition.service';
import { LedgerConnectType } from '../ledger/ledger-connect/ledger-connect.page';

@Component({
    selector: 'app-wallet-home',
    templateUrl: './wallet-home.page.html',
    styleUrls: ['./wallet-home.page.scss'],
})
export class WalletHomePage implements OnInit, OnDestroy {
    @ViewChild(TitleBarComponent, { static: true }) titleBar: TitleBarComponent;
    @ViewChild('slider', { static: false }) slider: IonSlides;

    public masterWallet: MasterWallet = null;
    public networkWallet: AnyNetworkWallet = null;
    private displayableSubWallets: AnySubWallet[] = null;
    public stakingAssets: StakingData[] = null;

    public stakedBalance = null; // Staked on ELA main chain or Tron

    public refreshingStakedAssets = false;

    public isEVMNetworkWallet = true;

    public noAddressForLedgerWallet = false;

    private activeNetworkWalletSubscription: Subscription = null;
    private activeNetworkSubscription: Subscription = null;
    private subWalletsListChangeSubscription: Subscription = null;
    private stakedAssetsUpdateSubscription: Subscription = null;

    // Helpers
    public WalletUtil = WalletUtil;
    public CoinType = CoinType;
    public SELA = Config.SELA;

    public hideRefresher = true;

    private updateInterval = null;

    public shownSubWalletDetails: AnySubWallet = null;

    // Dummy Current Network
    public currentNetwork: AnyNetwork = null;

    private sendTransactionSubscription: Subscription = null;

    // Titlebar
    private titleBarIconClickedListener: (icon: TitleBarIcon | TitleBarMenuItem) => void;

    constructor(
        public native: Native,
        public globalPopupService: GlobalPopupService,
        public walletManager: WalletService,
        public networkService: WalletNetworkService,
        private walletEditionService: WalletEditionService,
        private translate: TranslateService,
        public currencyService: CurrencyService,
        public theme: GlobalThemeService,
        public uiService: UiService,
        private walletNetworkUIService: WalletNetworkUIService,
        private walletUIService: WalletUIService,
        private storage: LocalStorage,
        private defiService: DefiService,
        private events: GlobalEvents,
        private zone: NgZone
    ) {
        GlobalFirebaseService.instance.logEvent("wallet_home_enter");
    }

    ngOnInit() {
        this.showRefresher();
        this.activeNetworkWalletSubscription = this.walletManager.activeNetworkWallet.subscribe((activeNetworkWallet) => {
            this.networkWallet = activeNetworkWallet;

            this.masterWallet = this.walletManager.getActiveMasterWallet();

            this.stakedBalance = null;

            if (activeNetworkWallet) {
                this.checkLedgerWallet();

                this.isEVMNetworkWallet = this.networkWallet.getMainEvmSubWallet() ? true : false;

                this.refreshSubWalletsList();
                this.refreshStakingAssetsList();

                if (this.subWalletsListChangeSubscription) {
                    this.subWalletsListChangeSubscription.unsubscribe();
                }
                // Know when a subwallet is added or removed, to refresh our list
                this.subWalletsListChangeSubscription = this.networkWallet.subWalletsListChange.subscribe(() => {
                    this.refreshSubWalletsList();
                });

                if (this.stakedAssetsUpdateSubscription) {
                    this.stakedAssetsUpdateSubscription.unsubscribe();
                }
                this.stakedAssetsUpdateSubscription = this.networkWallet.stakedAssetsUpdate.subscribe((data) => {
                    this.refreshStakingAssetsList();
                })

                void this.getStakedBalance();
            }
            else {
                if (this.masterWallet && (this.masterWallet.type === WalletType.LEDGER)) {
                    if (!this.masterWallet.supportsNetwork(this.networkService.activeNetwork.value)) {
                        this.noAddressForLedgerWallet = true;
                    }
                }
                // Nothing to do, unsupported wallet for the active network
            }
        });
        this.activeNetworkSubscription = this.networkService.activeNetwork.subscribe(activeNetwork => {
            this.currentNetwork = activeNetwork;

            this.checkLedgerWallet();

            this.stakedBalance = null;
        });

        this.sendTransactionSubscription = this.events.subscribe("wallet:transactionpublished", () => {
            // Update balance and transactions.
            this.restartUpdateInterval();
            void this.updateCurrentWalletInfo();
        });
    }

    ngOnDestroy() {
        if (this.activeNetworkWalletSubscription) {
            this.activeNetworkWalletSubscription.unsubscribe();
            this.activeNetworkWalletSubscription = null;
        }

        if (this.activeNetworkSubscription) {
            this.activeNetworkSubscription.unsubscribe();
            this.activeNetworkSubscription = null;
        }

        if (this.subWalletsListChangeSubscription) {
            this.subWalletsListChangeSubscription.unsubscribe();
            this.subWalletsListChangeSubscription = null;
        }

        if (this.sendTransactionSubscription) {
            this.sendTransactionSubscription.unsubscribe();
            this.sendTransactionSubscription = null;
        }

        if (this.stakedAssetsUpdateSubscription) {
            this.stakedAssetsUpdateSubscription.unsubscribe();
            this.stakedAssetsUpdateSubscription = null;
        }
    }

    ionViewWillEnter() {
        this.titleBar.setTitle(this.translate.instant("wallet.wallet-home-title"));
        this.titleBar.setIcon(TitleBarIconSlot.OUTER_RIGHT, {
            key: "settings",
            iconPath: BuiltInIcon.SETTINGS
        });
        this.titleBar.setIcon(TitleBarIconSlot.INNER_RIGHT, {
            key: "asset",
            iconPath: !this.theme.darkMode ? '/assets/wallet/settings/wallet.svg' : '/assets/wallet/settings/darkmode/wallet.svg',
        });
        this.titleBar.addOnItemClickedListener(this.titleBarIconClickedListener = (icon) => {
            if (icon.key === 'settings') {
                this.native.go('/wallet/settings');
            } else if (icon.key === 'asset') {
                this.native.go('/wallet/wallet-asset');
            }
        });
    }

    ionViewDidEnter() {
        if (this.walletManager.getMasterWalletsCount() > 0) {
            void this.promptTransfer2IDChain();
        }

        this.startUpdateInterval();

        GlobalStartupService.instance.setStartupScreenReady();
    }

    ionViewWillLeave() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.titleBar.removeOnItemClickedListener(this.titleBarIconClickedListener);
        if (this.native.popup) {
            this.native.popup.dismiss();
        }
    }

    private refreshSubWalletsList() {
        let sortType = this.uiService.getWalletSortType();
        this.displayableSubWallets = this.networkWallet.getSubWallets(sortType).filter(sw => sw.shouldShowOnHomeScreen());
    }

    private refreshStakingAssetsList() {
        this.zone.run(() => {
            this.stakingAssets = this.networkWallet.getStakingAssets();
        })
    }

    showRefresher() {
        setTimeout(() => {
            this.hideRefresher = false;
        }, 4000);
    }

    handleItem(key: string) {
        switch (key) {
            case 'settings':
                this.goToGeneralSettings();
                break;
        }
    }

    goToGeneralSettings() {
        this.native.go('/wallet/settings');

        // Not sure what this does but it throws an err using it
        // event.stopPropagation();
        return false;
    }

    goToWalletSettings(masterWallet: MasterWallet) {
        this.walletEditionService.modifiedMasterWalletId = masterWallet.id;
        this.native.go("/wallet/wallet-settings");
    }

    goCoinHome(masterWalletId: string, subWalletId: string) {
        this.native.go("/wallet/coin", { masterWalletId, subWalletId });
    }

    goSelectMasterWallet() {
        this.native.go("/wallet/wallet-manager");
    }

    public getPotentialActiveWallets(): AnyNetworkWallet[] {
        return this.walletManager.getNetworkWalletsList();
    }

    public getDisplayableSubWallets(): AnySubWallet[] {
        return this.displayableSubWallets;
    }

    public hasStakingAssets() {
        if (!this.stakingAssets || this.stakingAssets.length === 0) {
            return false;
        }

        return true;
    }

    public usdToCurrencyAmount(balance: string, decimalplace = -1): string {
        if (!balance) {
            return '...';
        }

        if (decimalplace == -1) {
            decimalplace = this.currencyService.selectedCurrency.decimalplace;
        }

        let curerentAmount = this.currencyService.usdToCurrencyAmount(new BigNumber(balance));
        return curerentAmount.decimalPlaces(decimalplace).toFixed();
    }

    /**
     * Shows the wallet selector component to pick a different wallet
     */
    public pickOtherWallet() {
        void this.walletUIService.chooseActiveWallet();
    }

    /* public selectActiveWallet(wallet: AnyNetworkWallet) {
        void this.walletManager.setActiveNetworkWallet(wallet);
    } */

    public selectActiveNetwork(network: AnyNetwork) {
        // TODO: Use network object, not string
        void this.networkService.setActiveNetwork(network);
    }

    async updateCurrentWalletInfo() {
        if (this.networkWallet) {
            await this.networkWallet.update();
            await this.getStakedBalance();
            // TODO - FORCE REFRESH ALL COINS BALANCES ? this.currencyService.fetch();
        }
    }

    startUpdateInterval() {
        if (this.updateInterval === null) {
            this.updateInterval = setInterval(() => {
                void this.updateCurrentWalletInfo();
            }, 30000);// 30s
        }
    }

    restartUpdateInterval() {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
        this.startUpdateInterval();
    }

    async doRefresh(event) {
        if (!this.uiService.returnedUser) {
            this.uiService.returnedUser = true;
            await this.storage.setVisit(true);
        }
        this.restartUpdateInterval();
        void this.updateCurrentWalletInfo();
        setTimeout(() => {
            event.target.complete();
        }, 1000);
    }

    async promptTransfer2IDChain() {
        if (this.walletManager.needToPromptTransferToIDChain) {
            void this.globalPopupService.ionicAlert('wallet.text-did-balance-not-enough');
            await this.walletManager.setHasPromptTransfer2IDChain();
        }
    }

    getWalletIndex(masterWallet: MasterWallet): number {
        return this.walletManager.getMasterWalletsList().indexOf(masterWallet);
    }

    isStandardSubwallet(subWallet: AnySubWallet) {
        return subWallet instanceof MainCoinSubWallet;
    }

    closeRefreshBox() {
        this.uiService.returnedUser = true;
        void this.storage.setVisit(true);
    }

    public goNFTHome(networkWallet: AnyNetworkWallet, nft: NFT) {
        this.native.go("/wallet/coin-nft-home", {
            masterWalletId: networkWallet.masterWallet.id,
            contractAddress: nft.contractAddress
        });
    }

    public viewTransactions(event, subWallet: AnySubWallet) {
        // Prevent from subwallet main div to get the click (do not open transactions list)
        event.preventDefault();
        event.stopPropagation();

        this.goCoinHome(subWallet.networkWallet.id, subWallet.id)
    }

    public pickNetwork() {
        void this.walletNetworkUIService.chooseActiveNetwork();
    }

    public onStakingAssetClicked(stakingAsset: StakingData) {
        this.defiService.openStakeApp(stakingAsset);
    }

    public async onRefreshStakingAssetClicked() {
        this.zone.run(() => {
            this.refreshingStakedAssets = true;
        })

        await this.networkWallet.fetchStakingAssets();

        setTimeout(() => {
            this.zone.run(() => {
                this.refreshingStakedAssets = false;
            })
        }, 1000);
    }

    /**
     * Open tin.network in a browser view
     */
    public async openStakedAssetsProvider() {
        let walletAddress = await this.networkWallet.getMainEvmSubWallet().getAccountAddress()
        this.defiService.openStakedAssetsProvider(walletAddress);
    }

    public getDefaultStakedAssetIcon(): string {
        return this.networkWallet.network.logo;
    }

    public async setSortMode() {
        let sortType = this.uiService.getWalletSortType();
        let newSortType = WalletSortType.BALANCE;
        if (sortType === WalletSortType.BALANCE) {
            newSortType = WalletSortType.NAME;
        }
        await this.uiService.setWalletSortTtype(newSortType);

        this.refreshSubWalletsList();
    }

    private checkLedgerWallet() {
        this.noAddressForLedgerWallet = false;
        if (this.masterWallet && (this.masterWallet.type === WalletType.LEDGER)) {
            if (!this.masterWallet.supportsNetwork(this.networkService.activeNetwork.value)) {
                this.noAddressForLedgerWallet = true;
            }
        }
    }

    public getAddressFromLedger() {
        this.native.go("/wallet/ledger/scan", { device: (this.masterWallet as LedgerMasterWallet).deviceID, type: LedgerConnectType.AddAccount });
    }

    public getStakeTitle() {
        if (this.networkWallet) {
            if (this.networkWallet.network.key === 'tron') {
                return 'wallet.resource-freeze-balance';
            }
        }
        return 'staking.staked';
    }

    public async getStakedBalance() {
        // Can't use WalletNetworkService.instance.isActiveNetworkElastosMainchain()
        // We got the activeNetworkWallet event first, but the WalletNetworkService.instance.isActiveNetworkElastosMainchain still return true.
        if (this.networkWallet) {
            if (this.networkWallet.network.key === 'elastos') {
                let subwallet = this.networkWallet.getMainTokenSubWallet() as MainChainSubWallet;
                if (subwallet) {
                    this.stakedBalance = await subwallet.getStakedBalance();
                }
            } else if (this.networkWallet.network.key === 'tron') {
                let subwallet = this.networkWallet.getMainTokenSubWallet() as TronSubWallet;
                if (subwallet) {
                    this.stakedBalance = await subwallet.getStakedBalance();
                }
            }
        }
    }

    public getStakedBalanceInNative() {
        return WalletUtil.getFriendlyBalance(new BigNumber(this.stakedBalance));
    }

    public getStakedBalanceInCurrency() {
        let balance = CurrencyService.instance.getMainTokenValue(new BigNumber(this.stakedBalance),
            this.networkWallet.network, this.currencyService.selectedCurrency.symbol);
        return WalletUtil.getFriendlyBalance(balance);
    }
}
