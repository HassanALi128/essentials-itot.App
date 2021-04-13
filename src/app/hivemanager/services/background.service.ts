import { Injectable, NgZone } from '@angular/core';
import { Platform, ToastController } from '@ionic/angular';

import * as moment from 'moment';
import { StorageService } from './storage.service';
import { HiveService } from './hive.service';
import { Logger } from 'src/app/logger';
import { GlobalNotificationsService, App } from 'src/app/services/global.notifications.service';
import { Events } from 'src/app/services/events.service';

@Injectable({
    providedIn: 'root'
})
export class BackgroundService {

    public activePaymentPlan: HivePlugin.Payment.ActivePricingPlan = null;

    constructor(
        public zone: NgZone,
        public toastCtrl: ToastController,
        public events: Events,
        private storage: StorageService,
        private hiveService: HiveService,
        private notificationsManager: GlobalNotificationsService
    ) {
    }

    public async init() {
        Logger.log("HiveManager", "Background service: initializing");
        this.getActivePaymentPlan();
    }

    async getActivePaymentPlan() {
        await this.hiveService.retrieveVaultLinkStatus();
        if (await this.hiveService.getActiveVault()) {
            Logger.log("HiveManager", "Background service: Fetching active payment plan");

            this.activePaymentPlan = await this.hiveService.getActiveVault().getPayment().getActivePricingPlan();
            Logger.log("HiveManager", "Background service: Got active payment plan", this.activePaymentPlan.getName(), this.activePaymentPlan);

            this.getTimeCheck();
        }
    }

    async getTimeCheck() {
        const lastCheckedTime = await this.storage.get('timeCheckedForExpiration');
        Logger.log("HiveManager", 'Background service: Time-checked for expiration', moment(lastCheckedTime).format('MMMM Do YYYY, h:mm'));

        const today = new Date();
        if(lastCheckedTime) {
            if(!moment(lastCheckedTime).isSame(today, 'd')) {
                this.storage.set('timeCheckedForExpiration', today);
                this.checkPlanExpiration(today);
            } else {
                Logger.log("hivemanager", 'Background service: Plan expiration already checked today');
            }
        } else {
            this.storage.set('timeCheckedForExpiration', today);
            this.checkPlanExpiration(today);
        }
    }

    checkPlanExpiration(today) {
        const weekFromNow = moment(today).add(7, 'days');
        const planExpiration = moment(this.activePaymentPlan.getEndTime() * 1000);

        Logger.log("hivemanager", 'Plan expiration', planExpiration.format('MMMM Do YYYY, h:mm'));
        if(planExpiration.isBetween(today, weekFromNow)) {
            const notification = {
                key: 'storagePlanExpiring',
                title: 'Storage Plan Expiring',
                message: 'You have a storage plan expiring soon. Please renew your plan before the expiration time.',
                app: App.HIVE_MANAGER
            };
            this.notificationsManager.sendNotification(notification);
        }
    }
}
