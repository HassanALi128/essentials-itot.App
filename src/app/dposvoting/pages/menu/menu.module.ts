import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { MenuPage } from './menu.page';
import { VotePage } from '../vote/vote.page';
import { StatsPage } from '../stats/stats.page';
import { SearchPage } from '../search/search.page';
import { HistoryPage } from '../history/history.page';
import { TxPage } from '../tx/tx.page';

import { NodeSliderComponent } from '../vote/node-slider/node-slider.component';
import { SharedComponentsModule } from 'src/app/components/sharedcomponents.module';

const routes: Routes = [
  {
    path: 'menu',
    component: MenuPage,
    children: [
      {
        path: 'vote',
        children: [
          {
            path: "",
            component: VotePage,
          }
        ]
      },
      {
        path: 'stats',
        children: [
          {
            path: "",
            component: StatsPage,
          }
        ]
      },
      {
        path: 'search',
        children: [
          {
            path: "",
            component: SearchPage,
          }
        ]
      },
      {
        path: 'history',
        children: [
          {
            path: "",
            component: HistoryPage,
          }
        ]
      },
      {
        path: 'history/:txId',
        children: [
          {
            path: "",
            component: TxPage,
          }
        ]
      },
    ]
  },
  {
    path: 'home',
    loadChildren: '../home/home.module#HomePageModule'
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedComponentsModule,
    RouterModule.forChild(routes)
  ],
  declarations: [
    MenuPage,
    VotePage,
    StatsPage,
    HistoryPage,
    TxPage,
    SearchPage,
    NodeSliderComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class MenuPageModule {}
