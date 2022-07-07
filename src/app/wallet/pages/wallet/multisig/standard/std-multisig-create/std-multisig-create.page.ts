import { Component, OnInit, ViewChild } from '@angular/core';
import { IonInput } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import * as bs58check from "bs58check";
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { Logger } from 'src/app/logger';
import { Util } from 'src/app/model/util';
import { GlobalEvents } from 'src/app/services/global.events.service';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { MasterWallet, StandardMasterWallet } from 'src/app/wallet/model/masterwallets/masterwallet';
import { ElastosMainChainNetworkBase } from 'src/app/wallet/model/networks/elastos/mainchain/network/elastos.networks';
import { WalletUtil } from 'src/app/wallet/model/wallet.util';
import { AuthService } from 'src/app/wallet/services/auth.service';
import { Native } from 'src/app/wallet/services/native.service';
import { WalletNetworkService } from 'src/app/wallet/services/network.service';
import { LocalStorage } from 'src/app/wallet/services/storage.service';
import { WalletService } from 'src/app/wallet/services/wallet.service';
import { WalletUIService } from 'src/app/wallet/services/wallet.ui.service';

@Component({
    selector: 'app-std-multisig-create',
    templateUrl: './std-multisig-create.page.html',
    styleUrls: ['./std-multisig-create.page.scss'],
})
export class StandardMultiSigCreatePage implements OnInit {
    @ViewChild(TitleBarComponent, { static: true }) titleBar: TitleBarComponent;
    @ViewChild('input', { static: false }) input: IonInput;

    public signingWallet: MasterWallet = null; // Current user's wallet to sign multisig transactions. One of the cosigners.
    private signingWalletXPub: string = null; // XPUB of the selected signing wallet if any. Used to make sure that the user doesn't put the signing wallet xpub in the list of cosigners again
    public cosigners = ['', '']; // Array of xpub cosigners keys - two empty keys by default
    public requiredSigners = "2"; // Default - string to avoid issues with angular input

    public wallet = {
        name: '',
        singleAddress: false, // TODO: network options
    };

    public useBackNav = false;

    constructor(
        public translate: TranslateService,
        public theme: GlobalThemeService,
        private native: Native,
        private walletService: WalletService,
        private walletUIService: WalletUIService,
        private networkService: WalletNetworkService,
        private events: GlobalEvents,
        private authService: AuthService,
        public localStorage: LocalStorage
    ) {
    }

    ngOnInit() {
    }

    ionViewWillEnter() {
        this.titleBar.setTitle(this.translate.instant('wallet.multi-sig-new-wallet-title'));
    }

    ionViewDidEnter() {
    }

    ionViewWillLeave() {
        this.theme.activeTheme.subscribe((activeTheme) => {
            this.titleBar.setTitleBarTheme(activeTheme);
        });
    }

    onCreate() {
        if (Util.isNull(this.signingWallet)) {
            this.native.toast_trans('wallet.multi-sig-error-no-signing-wallet');
            return;
        }
        if (Util.isNull(this.wallet.name)) {
            this.native.toast_trans("wallet.text-wallet-name-validator-enter-name");
            return;
        }
        if (WalletUtil.isInvalidWalletName(this.wallet.name)) {
            this.native.toast_trans("wallet.text-wallet-name-validator-not-valid-name");
            return;
        }
        if (this.walletService.walletNameExists(this.wallet.name)) {
            this.native.toast_trans("wallet.text-wallet-name-validator-already-exists");
            return;
        }

        // No invalid xpub
        for (let cosigner of this.cosigners) {
            if (!this.cosignerKeyIsValidIsValid(cosigner)) {
                this.native.toast_trans('wallet.multi-sig-error-invalid-xpub');
                return;
            }
        }

        void this.createWallet();
    }

    async createWallet() {
        Logger.log("wallet", "Creating multisig wallet with signing wallet", this.signingWallet);

        let walletId = this.walletService.createMasterWalletID();
        try {
            await this.authService.createAndSaveWalletPassword(walletId);
            await this.walletService.newMultiSigStandardWallet(
                walletId,
                this.wallet.name,
                this.signingWallet.id,
                parseInt(this.requiredSigners),
                this.getUsableCosigners()
            );
            this.native.setRootRouter("/wallet/wallet-home");

            this.events.publish("masterwalletcount:changed", {
                action: 'add',
                walletId: walletId
            });
        } catch (e) {
            Logger.error('wallet', 'MultiSigStandardWallet create error:', e);
            await this.localStorage.deleteMasterWallet(walletId);
        }
    }

    public allInputsValid(): boolean {
        if (!this.wallet.name)
            return false; // Need a wallet name

        if (!this.signingWallet)
            return false; // Need to have picked a signing wallet - no watch mode for now

        let reqSigners = parseInt(this.requiredSigners);
        if (reqSigners <= 0 || Number.isNaN(reqSigners))
            return false; // Need at least one signer, and need to bit a number

        if (reqSigners > this.getUsableCosigners().length + 1) // +1 because the user himself counts as as usable cosigners too
            return false; // Can't have more signers required than total cosigners

        // No invalid xpub
        for (let cosigner of this.cosigners) {
            if (!this.cosignerKeyIsValidIsValid(cosigner))
                return false;
        }

        return true;
    }

    public async pickSigningWallet() {
        let pickedWallet = await this.walletUIService.pickWallet(networkWallet => {
            // Allow only wallets that can sign multisig wallets to show in the list
            if (!(networkWallet.masterWallet instanceof StandardMasterWallet))
                return false;

            if (!networkWallet.masterWallet.hasMnemonicSupport())
                return false;

            // TODO: probably need to filter more

            return true;
        });

        if (pickedWallet) {
            this.signingWallet = pickedWallet.masterWallet;

            // Load the elastos mainchain network wallet for this master wallet, to get its xpub and check a few things
            let elastosMainchainNetwork = this.networkService.getNetworkByKey(ElastosMainChainNetworkBase.networkKey);
            let sourceNetworkWallet = await elastosMainchainNetwork.createNetworkWallet(this.signingWallet, false);
            this.signingWalletXPub = await sourceNetworkWallet.getExtendedPublicKey();

            if (!this.signingWalletXPub) {
                // Happens if user didn't enter the master password to get the wallet xpub
                this.signingWallet = null;
                return;
            }

            // If this xpub was already in use in the cosigners list, simply delete it
            this.cosigners = this.cosigners.map(c => {
                if (c.toLowerCase() === this.signingWalletXPub.toLowerCase())
                    return "";
                else
                    return c;
            });
        }
    }

    /**
     * Remove empty cosigners from the list to get the real list of usable cosigners
     */
    public getUsableCosigners(): string[] {
        return this.cosigners.filter(c => this.cosignerKeyIsValidIsValid(c));
    }

    /**
     * Add a new cosigner entry
     */
    public addCosignerEntry() {
        this.cosigners.push("");
    }

    public deleteCosigner(event, i: number) {
        this.cosigners.splice(i, 1);
    }

    /**
     * Only allow a mex number of cosigners to be added, not an infinite number.
     */
    public canAddCosigners(): boolean {
        return this.cosigners.length < 6;
    }

    /**
     * Pastes clipboard content into the target cosigner address
     */
    public async pasteCosigner(event, i: number) {
        let pastedContent = await this.native.pasteFromClipboard() as string;

        this.cosigners[i] = pastedContent.trim();

        this.ensureValidCosignerAtIndex(i);
    }

    /**
     * Ensure no duplicate in the cosigners list
     */
    private cosignersHaveKey(key: string): boolean {
        return this.cosigners.includes(key);
    }

    /**
     * Counts how many cosigners entry have the value "key".
     * used to check duplicates.
     */
    private cosignersCountKey(key: string): number {
        return this.cosigners.reduce((prev, cur) => {
            return (cur === key) ? prev + 1 : prev;
        }, 0);
    }

    /**
     * Whether the given key if the selected signing wallet one or not.
     */
    private isSigningWalletKey(key: string): boolean {
        if (!this.signingWalletXPub)
            return false;

        return this.signingWalletXPub.toLowerCase() === key.toLowerCase();
    }

    public onCosignerBlur(i: number) {
        this.cosigners[i] = this.cosigners[i].trim();
        this.ensureValidCosignerAtIndex(i);
    }

    /**
     * Checks the cosigner entry at a given index in the cosigners array. If the value is invalid,
     * shows an error and resets the entry to an empty value.
     */
    private ensureValidCosignerAtIndex(index: number) {
        if (!this.cosigners[index].startsWith("xpub")) {
            this.native.toast_trans('wallet.multi-sig-error-invalid-xpub');
            this.cosigners[index] = '';
            return;
        }

        if (this.cosignersCountKey(this.cosigners[index]) > 1 || this.isSigningWalletKey(this.cosigners[index])) {
            this.native.toast_trans('wallet.multi-sig-error-xpub-in-user');
            this.cosigners[index] = '';
            return;
        }

        if (!this.cosignerKeyIsValidIsValid(this.cosigners[index])) {
            this.native.toast_trans('wallet.multi-sig-error-invalid-xpub');
            this.cosigners[index] = '';
            return;
        }
    }

    private cosignerKeyIsValidIsValid(key: string): boolean {
        if (!key)
            return false;

        try {
            bs58check.decode(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Angular hack using 'trackBy' to not re-render the cosigners input list and lose keyboard focus
     * when typing.
     */
    public trackCosigners(index: number, item: any) {
        return index;
    }

    public onRequiredSignersUpdated() {
    }
}
