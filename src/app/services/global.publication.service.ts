import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { GlobalDIDSessionsService } from './global.didsessions.service';
import { GlobalStorageService } from './global.storage.service';
import { Logger } from '../logger';
import { Subject } from 'rxjs';
import { AssistPublishingComponent } from '../components/assist-publishing/assist-publishing.component';
import { ModalController } from '@ionic/angular';
import { GlobalThemeService } from './global.theme.service';
import { GlobalPreferencesService } from './global.preferences.service';
import { GlobalIntentService } from './global.intent.service';
import { JSONObject } from '../model/json';
import { GlobalNetworksService, MAINNET_TEMPLATE, TESTNET_TEMPLATE } from './global.networks.service';

declare let didManager: DIDPlugin.DIDManager;

const assistAPIEndpoints = {
    MainNet: "https://assist-restapi.tuum.tech/v2",
    TestNet: "https://assist-restapi-testnet.tuum.tech/v2"
}; // Assist DID 2.0

//const assistAPIEndpoint = "https://wogbjv3ci3.execute-api.us-east-1.amazonaws.com/prod/v1"; // Assist V1 DID 1.0
const assistAPIKey = "IdSFtQosmCwCB9NOLltkZrFy5VqtQn8QbxBKQoHPw7zp3w0hDOyOYjgL53DO3MDH";

export type PersistentInfo = {
    did: {
        didString: string;
        publicationMedium: string, // assist, wallet
        publicationStatus: DIDPublicationStatus,

        assist? : {
            publicationID: string // Unique publication ID returned by the assist API after a successful publication request. This is NOT a blockchain transaction ID.
        }
    },
}

export const enum DIDPublicationStatus {
    NO_ON_GOING_PUBLICATION = 0, // Initial state just before a publication is sent.
    AWAITING_PUBLICATION_CONFIRMATION = 1,
    PUBLISHED_AND_CONFIRMED = 2, // Previously published transaction was published and confirmed on chain.
    FAILED_TO_PUBLISH = 3
}

export type PublicationStatus = {
    didString: string;
    status: DIDPublicationStatus
}

abstract class DIDPublisher {
    public abstract publishDID(didString: string, payloadObject: any, memo: string, showBlockingLoader: boolean): Promise<void>;
    public abstract resetStatus();
}

/**
 * Scope: publish using assist API
 */
namespace AssistPublishing {
    type AssistBaseResponse = {
        meta: {
            code: number,
            message: string
        }
    }

    type AssistCreateTxResponse = AssistBaseResponse & {
        data: {
            confirmation_id: string,
            service_count: number,
            duplicate: boolean
        }
    }

    enum AssistTransactionStatus {
        PENDING = "Pending",
        PROCESSING = "Processing",
        COMPLETED = "Completed",
        QUARANTINED = "Quarantined",
        ERROR = "Error"
    }

    type AssistTransactionStatusResponse = AssistBaseResponse & {
        data: {
            id: string, // Confirmation ID as requested
            did: string, // DID, without did:elastos prefix
            requestFrom: string, // App package id of the requester
            didRequest: any, // Unhandled for now
            status: AssistTransactionStatus,
            memo: string,
            extraInfo: any, // Unhandled for now
            blockchainTxId: string,
            blockchainTx: any,
            created: string, // Creation date, in no clear format for now
            modified: string // Modification (?) date, in no clear format for now
        }
    }

    export class AssistPublisher extends DIDPublisher {
        constructor(
            private manager: DIDPublishingManager,
            private http: HttpClient,
            private theme: GlobalThemeService,
            private modalCtrl: ModalController,
            private globalNetworksService: GlobalNetworksService) {
            super();
        }

        public async init(): Promise<void> {
        }

        /**
         * Directly publishes a payload previously generated in another part of the app.
         *
         * DOC FOR ASSIST API: https://github.com/tuum-tech/assist-restapi-backend#verify
         */
        public async publishDID(didString: string, payloadObject: any, memo: string, showBlockingLoader = false): Promise<void> {
            Logger.log("publicationservice", "Requesting identity publication to Assist", didString);

            if (typeof payloadObject === "string")
                throw new Error("Payload must be a JSON object, not a stringified JSON");

            if (showBlockingLoader) {
                await this.displayAssistPublicationLoader();
            }

            this.manager.persistentInfo.did.didString = didString;
            this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.NO_ON_GOING_PUBLICATION;
            await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);

            const assistAPIKey = "IdSFtQosmCwCB9NOLltkZrFy5VqtQn8QbxBKQoHPw7zp3w0hDOyOYjgL53DO3MDH";

            const requestBody = {
                "did": didString,
                "memo": memo || "",
                "requestFrom": "Elastos Essentials",
                "didRequest": payloadObject
            };

            Logger.log("publicationservice", "Assist API request body:", requestBody, JSON.stringify(requestBody));

            const headers = new HttpHeaders({
                "Content-Type": "application/json",
                "Authorization": assistAPIKey
            });

            try {
                let assistAPIEndpoint = await this.getAssistEndpoint();
                let response: AssistCreateTxResponse = await this.http.post(assistAPIEndpoint + "/didtx/create", requestBody, {
                    headers: headers
                }).toPromise() as AssistCreateTxResponse;

                Logger.log("publicationservice", "Assist successful response:", response);
                if (response && response.meta && response.meta.code == 200 && response.data.confirmation_id) {
                    Logger.log("publicationservice", "All good, DID has been submitted. Now waiting.");

                    this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.AWAITING_PUBLICATION_CONFIRMATION;
                    this.manager.persistentInfo.did.assist.publicationID = response.data.confirmation_id;
                    await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);

                    void this.checkPublicationStatusAndUpdate();

                    return;
                } else {
                    let error = "Successful response received from the assist API, but response can't be understood";
                    throw error;
                }
            }
            catch (err) {
                Logger.error("publicationservice", "Assist publish api error:", err);
                this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.FAILED_TO_PUBLISH;
                await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);
            }
        }

        /**
         * Shows a blocking modal that shows the publication progress on assist.
         */
        private async displayAssistPublicationLoader(): Promise<void> {
            const modal = await this.modalCtrl.create({
                component: AssistPublishingComponent,
                componentProps: {},
                backdropDismiss: false, // Not closeable
                cssClass: !this.theme.darkMode ? "identity-showqrcode-component identity-publishmode-component-base" : 'identity-showqrcode-component-dark identity-publishmode-component-base'
            });

            void modal.onDidDismiss().then((params) => {
                //
            });

            void modal.present();
        }

        /**
         * Computes the right assist api endpoint according to current active network in settings.
         */
        private async getAssistEndpoint(): Promise<string> {
            let activeNetworkTemplate: string = null;

            if (!GlobalDIDSessionsService.signedInDIDString) {
                // No active user? Use mainnet
                activeNetworkTemplate = MAINNET_TEMPLATE;
            }
            else {
                activeNetworkTemplate = await this.globalNetworksService.getActiveNetworkTemplate();
            }

            switch (activeNetworkTemplate) {
                case MAINNET_TEMPLATE:
                    return assistAPIEndpoints.MainNet;
                case TESTNET_TEMPLATE:
                    return assistAPIEndpoints.TestNet;
                default:
                    throw new Error("Assist service cannot be used to published on network "+activeNetworkTemplate);
            }
        }

        /**
        * Checks the publication status on the assist API, for a previously saved ID.
        */
        private checkPublicationStatusAndUpdate(): Promise<void> {
            // Stop checking status if not awaiting anything.
            if (this.manager.persistentInfo.did.publicationStatus !== DIDPublicationStatus.AWAITING_PUBLICATION_CONFIRMATION)
                return;

            // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
            return new Promise(async (resolve, reject) => {
                Logger.log("publicationservice", "Requesting identity publication status to Assist for confirmation ID " + this.manager.persistentInfo.did.assist.publicationID);

                const headers = new HttpHeaders({
                    "Content-Type": "application/json",
                    "Authorization": assistAPIKey
                });

                let assistAPIEndpoint = await this.getAssistEndpoint();
                this.http.get(assistAPIEndpoint + "/didtx/confirmation_id/" + this.manager.persistentInfo.did.assist.publicationID, {
                    headers: headers
                }).toPromise().then(async (response: AssistTransactionStatusResponse) => {
                    Logger.log("publicationservice", "Assist successful response:", response);
                    if (response && response.meta && response.meta.code == 200 && response.data.status) {
                        Logger.log("publicationservice", "All good, We got a clear status from the assist api:", response.data.status);

                        if (response.data.status == AssistTransactionStatus.PENDING || response.data.status == AssistTransactionStatus.PROCESSING) {
                            // Transaction is still pending, we do nothing, just wait and retry later.
                            //Logger.log("publicationservice", "Publication is still pending / processing / not confirmed.");
                        }
                        else if (response.data.status == AssistTransactionStatus.QUARANTINED) {
                            // Blocking issue. This publication was quarantined, there is "something wrong somewhere".
                            // So to make things more reliable, we just delete everything and restart the process
                            // from scratch.
                            Logger.log("publicationservice", "Publication request was quarantined! Deleting the identity and trying again.");
                            this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.FAILED_TO_PUBLISH;
                            await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);
                        }
                        else if (response.data.status == AssistTransactionStatus.COMPLETED) {
                            this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.PUBLISHED_AND_CONFIRMED;
                            await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);
                        }
                        else {
                            Logger.error("publicationservice", "Unhandled transaction status received from assist:", response.data.status);
                            this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.FAILED_TO_PUBLISH;
                            await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);
                        }

                        setTimeout(() => {
                            void this.checkPublicationStatusAndUpdate();
                        }, 1000);

                        resolve();
                    } else {
                        let error = "Successful response received from the assist API, but response can't be understood";
                        Logger.error("publicationservice", "Assist api call error:", error);

                        this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.FAILED_TO_PUBLISH;
                        await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);

                        resolve();
                    }
                }).catch(async (err) => {
                    Logger.error("publicationservice", "Assist api call error:", err);

                    this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.FAILED_TO_PUBLISH;
                    await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);

                    resolve();
                });
            });
        }

        public resetStatus() {
        }
    }
}

/**
 * Scope: publish using the wallet
 */
namespace WalletPublishing {
    export class WalletPublisher extends DIDPublisher {
        constructor (private manager: DIDPublishingManager, private globalIntentService: GlobalIntentService) {
            super();
        }

        public init() {
        }

        /**
         * TODO!!!
         *
         * - Start polling for tx confirmation in order know the final "published" status for the did
         * - Show a blocking popup during this phase if needed (showBlockingLoader)
         * - Check that the wallet network matches the settings network (so we publish a privnet DID on a the privnet wallet network, not on heco...)
         */
        public async publishDID(didString: string, payloadObject: JSONObject, memo: string, showBlockingLoader = false): Promise<void> {
            Logger.log("publicationservice", "Publishing DID with wallet:", payloadObject);

            let params = {
                didrequest: payloadObject
            }

            Logger.log('publicationservice', "Sending didtransaction intent with params:", params);

            try {
                let response = await this.globalIntentService.sendIntent("https://wallet.elastos.net/didtransaction", params);

                Logger.log('publicationservice', "Got didtransaction intent response from the wallet.", response);

                // If txid is set in the response this means a transaction has been sent on chain.
                // If null, this means user has cancelled the operation (no ELA, etc).
                if (response.result && response.result.txid) {
                    Logger.log('publicationservice', 'didtransaction response.result.txid ', response.result.txid);
                    this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.AWAITING_PUBLICATION_CONFIRMATION;
                    // TODO: save txid
                    await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);
                }
                else {
                    Logger.log('publicationservice', 'didtransaction response.result.txid is null');
                    this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.FAILED_TO_PUBLISH;
                    await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);
                }
            }
            catch (err) {
                Logger.error('publicationservice', "Failed to send app manager didtransaction intent!", err);
                this.manager.persistentInfo.did.publicationStatus = DIDPublicationStatus.FAILED_TO_PUBLISH;
                    await this.manager.savePersistentInfoAndEmitStatus(this.manager.persistentInfo);
            }
        }

        public resetStatus() {
        }
    }
}

class DIDPublishingManager {
    public persistentInfo: PersistentInfo = null;

    private assistPublisher: AssistPublishing.AssistPublisher = null;
    private walletPublisher: WalletPublishing.WalletPublisher = null;
    private activePublisher: DIDPublisher = null;

    constructor(
        private publicationService: GlobalPublicationService,
        private http: HttpClient,
        private storage: GlobalStorageService,
        private theme: GlobalThemeService,
        private modalCtrl: ModalController,
        private prefs: GlobalPreferencesService,
        private globalNetworksService: GlobalNetworksService,
        private globalIntentService: GlobalIntentService) {}

    public async init(): Promise<void> {
        this.persistentInfo = await this.loadPersistentInfo();

        this.assistPublisher = new AssistPublishing.AssistPublisher(
            this,
            this.http,
            this.theme,
            this.modalCtrl,
            this.globalNetworksService);

        this.walletPublisher = new WalletPublishing.WalletPublisher(
            this,
            this.globalIntentService
        );

        await this.assistPublisher.init();
        await this.walletPublisher.init();
    }

    private async loadPersistentInfo(): Promise<PersistentInfo> {
        let infoAsString = await this.storage.getSetting(GlobalDIDSessionsService.signedInDIDString, 'publicationservice', "persistentInfo", null);
        if (!infoAsString)
            return this.createNewPersistentInfo();

        return JSON.parse(infoAsString);
    }

    public createNewPersistentInfo(): PersistentInfo {
        return {
            did: {
                didString: null,
                publicationMedium: null,
                publicationStatus: DIDPublicationStatus.NO_ON_GOING_PUBLICATION,
                assist: {
                    publicationID: null
                }
            }
        }
    }

    public async savePersistentInfo(persistentInfo: PersistentInfo) {
        this.persistentInfo = persistentInfo;
        await this.storage.setSetting(GlobalDIDSessionsService.signedInDIDString, 'publicationservice', "persistentInfo", JSON.stringify(persistentInfo));
    }

    public async savePersistentInfoAndEmitStatus(persistentInfo: PersistentInfo) {
        console.log("DEBUG savePersistentInfoAndEmitStatus", persistentInfo);
        await this.savePersistentInfo(persistentInfo);
        this.emitPublicationStatusChangeFromPersistentInfo();
    }

    /**
    * Emit a public publication status event that matches the current persistent info state.
    */
    public emitPublicationStatusChangeFromPersistentInfo() {
        console.log("DEBUG emitPublicationStatusChangeFromPersistentInfo", this.persistentInfo);
        this.publicationService.publicationStatus.next({
            didString: this.persistentInfo.did.didString,
            status: this.persistentInfo.did.publicationStatus
        });
    }

    public async resetStatus() {
        if (this.activePublisher)
            await this.activePublisher.resetStatus();

        this.persistentInfo = this.createNewPersistentInfo();
        await this.savePersistentInfoAndEmitStatus(this.persistentInfo);
    }

    /**
     * Returns the medium (assist, wallet) that we should use to publish
     */
    private async getPublishingMedium(): Promise<string> {
        if (!GlobalDIDSessionsService.signedInDIDString)
            return 'assist'; // No signed in user? We may be in a DID creation flow. Anyway, use assist in this case.

        return await this.prefs.getPublishIdentityMedium(GlobalDIDSessionsService.signedInDIDString);
    }

    public async publishDIDFromRequest(didString: string, payloadObject: JSONObject, memo: string, showBlockingLoader = false): Promise<void> {
        let publishMedium = await this.getPublishingMedium();
        if (publishMedium === 'assist')
            this.activePublisher = this.assistPublisher;
        else
            this.activePublisher = this.walletPublisher;

        return this.activePublisher.publishDID(didString, payloadObject, memo, showBlockingLoader);
    }
}

@Injectable({
    providedIn: 'root'
})
export class GlobalPublicationService {
    public static instance: GlobalPublicationService = null;

    private manager: DIDPublishingManager = null;

    public publicationStatus: Subject<PublicationStatus> = null;

    constructor(
        private storage: GlobalStorageService,
        private http: HttpClient,
        private modalCtrl: ModalController,
        private theme: GlobalThemeService,
        private prefs: GlobalPreferencesService,
        private globalNetworksService: GlobalNetworksService,
        private globalIntentService: GlobalIntentService
    ) {
        GlobalPublicationService.instance = this;

        this.manager = new DIDPublishingManager(
            this,
            this.http,
            this.storage,
            this.theme,
            this.modalCtrl,
            this.prefs,
            this.globalNetworksService,
            this.globalIntentService);
    }

    public async init(): Promise<void> {
        await this.manager.init();
        this.publicationStatus = new Subject<PublicationStatus>();
    }


    /**
     * Publish the given DID Request.
     */
    public publishDIDFromRequest(didString: string, payloadObject: JSONObject, memo: string, showBlockingLoader = false): Promise<void> {
        return this.manager.publishDIDFromRequest(didString, payloadObject, memo, showBlockingLoader);
    }

    /**
     * Opens a DID store, generates a DID request and publish it.
     */
    public publishDIDFromStore(storeId: string, storePass: string, didString: string, showBlockingLoader = false): Promise<void> {
        Logger.log("publicationservice", "Starting the DID publication process");

        // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
        return new Promise<void>(async (resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
            const didStore = await this.openDidStore(storeId, async (payload: string, memo: string) => {
                // Callback called by the DID SDK when trying to publish a DID.
                Logger.log("publicationservice", "Create ID transaction callback is being called", payload, memo);
                const payloadAsJson = JSON.parse(payload);
                await this.publishDIDFromRequest(didString, payloadAsJson, memo, showBlockingLoader);
                resolve();
            });

            const localDIDDocument = await this.loadLocalDIDDocument(didStore, didString);

            // Start the publication flow
            localDIDDocument.publish(storePass, () => { }, (err) => {
                // Local "publish" process errored
                Logger.log("publicationservice", "Local DID Document publish(): error", err);
                reject(err);
            });
        });
    }

    public resetStatus(): Promise<void> {
        return this.manager.resetStatus();
    }

    private openDidStore(storeId: string, createIdTransactionCallback: DIDPlugin.OnCreateIdTransaction): Promise<DIDPlugin.DIDStore> {
        return new Promise((resolve) => {
            didManager.initDidStore(storeId, createIdTransactionCallback, (didstore) => {
                resolve(didstore);
            }, (err) => {
                resolve(null);
            });
        });
    }

    private loadLocalDIDDocument(didStore: DIDPlugin.DIDStore, didString: string): Promise<DIDPlugin.DIDDocument> {
        return new Promise((resolve) => {
            didStore.loadDidDocument(didString, (didDocument) => {
                resolve(didDocument);
            }, (err) => {
                resolve(null);
            });
        });
    }
}
