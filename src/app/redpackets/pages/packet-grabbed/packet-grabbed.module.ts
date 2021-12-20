import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { SharedComponentsModule } from 'src/app/components/sharedcomponents.module';
import { PacketGrabbedPage } from './packet-grabbed.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedComponentsModule,
    TranslateModule,
    RouterModule.forChild([
      {
        path: '',
        component: PacketGrabbedPage
      }
    ])
  ],
  declarations: [PacketGrabbedPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PacketGrabbedPageModule { }
