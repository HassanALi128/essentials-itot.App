import { Injectable } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Logger } from 'src/app/logger';

@Injectable()
export class PopupProvider {
    constructor(public alertCtrl: AlertController, public translate: TranslateService)
    {}

    public ionicAlert(title: string, subTitle?: string, okText?: string): Promise<any> {
        return new Promise<void>((resolve, reject) => {
            this.alertCtrl.create({
                header : this.translate.instant(title),
                subHeader: subTitle ? this.translate.instant(subTitle) : '',
                backdropDismiss: false,
                buttons: [{
                    text: okText ? okText : this.translate.instant('confirm'),
                    handler: () => {
                        Logger.log('Identity', 'ionicAlert Ok clicked');
                        resolve();
                    }
                }]
            }).then(alert => alert.present());
        });
    };


    public ionicConfirm(title: string, message: string, okText?: string, cancelText?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.alertCtrl.create({
                header: this.translate.instant(title),
                message  : this.translate.instant(message),
                buttons: [{
                    text: cancelText ? cancelText : this.translate.instant('cancel'),
                    handler: () => {
                        Logger.log('Identity', 'ionicConfirm Disagree clicked');
                        resolve(false);
                    }
                },
                {
                    text: okText ? okText : this.translate.instant('confirm'),
                    handler: () => {
                        Logger.log('Identity', 'Agree clicked');
                        resolve(true);
                    }
                }]
            }).then(confirm => confirm.present());
        });
    };

    public ionicPrompt(title: string, message: string, opts?: any, okText?: string, cancelText?: string): Promise<any> {
        return new Promise((resolve, reject) => {
        let defaultText = opts && opts.defaultText ? opts.defaultText : null;
        let placeholder = opts && opts.placeholder ? opts.placeholder : null;
        let inputType = opts && opts.type ? opts.type : 'text';
        let cssClass = opts.useDanger ? "alertDanger" : null;
        let backdropDismiss = !!opts.backdropDismiss;

        this.alertCtrl.create({
            header:title,
            message,
            cssClass,
            backdropDismiss,
            inputs: [{
                value: defaultText,
                placeholder,
                type: inputType
            }],
            buttons: [{
                text: cancelText ? cancelText : this.translate.instant('Cancel'),
                handler: data => {
                    Logger.log('Identity', 'Cancel clicked');
                    resolve(null);
                }
            },
            {
                text: okText ? okText : this.translate.instant('Ok'),
                handler: data => {
                    Logger.log('Identity', 'Saved clicked');
                    resolve(data[0]);
                }
            }]
            }).then(prompt => prompt.present());
        });
    }
}
