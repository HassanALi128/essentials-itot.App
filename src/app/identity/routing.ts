import { Component, NgModule } from "@angular/core";
import { RouterModule, Routes, NoPreloading } from "@angular/router";

import { CountryPickerPage } from "./pages/countrypicker/countrypicker";
import { EditProfilePage } from "./pages/editprofile/editprofile";
import { PublishPage } from "./pages/publish/publish";
import { CredentialAccessRequestPage } from "./pages/intents/credentialaccessrequest/credentialaccessrequest";
import { RegisterApplicationProfileRequestPage } from "./pages/intents/regappprofilerequest/regappprofilerequest";
import { SetHiveProviderRequestPage } from "./pages/intents/sethiveproviderrequest/sethiveproviderrequest";
import { SignRequestPage } from "./pages/intents/signrequest/signrequest";
import { AppIdCredentialIssueRequestPage } from "./pages/intents/appidcredentialissuerequest/appidcredentialissuerequest";
import { CredentialIssueRequestPage } from "./pages/intents/credentialissuerequest/credentialissuerequest";
import { NotSignedInPage } from "./pages/notsignedin/notsignedin";
import { CredentialImportRequestPage } from "./pages/intents/credentialimportrequest/credentialimportrequest";
import { CredentialDetailsPage } from "./pages/credentialdetails/credentialdetails.page";
import { SettingsPage } from "./pages/settings/settings.page";
import { AdvancedSettingsPage } from "./pages/advanced-settings/advanced-settings.page";
import { ExportmnemonicPage } from "./pages/exportmnemonic/exportmnemonic.page";
import { CommonModule } from "@angular/common";

const routes: Routes = [
  { path: "countrypicker", component: CountryPickerPage },
  { path: "createidentity", component: EditProfilePage },
  { path: "editprofile", component: EditProfilePage },
  { path: "publish", component: PublishPage },
  {
    path: "myprofile",
    loadChildren: "./pages/tabnav/tabnav.module#TabsnavPageModule"
  },

  { path: "credentialdetails", component: CredentialDetailsPage },

  // Intents
  { path: "appidcredissuerequest", component: AppIdCredentialIssueRequestPage },
  { path: "credaccessrequest", component: CredentialAccessRequestPage },
  { path: "credissuerequest", component: CredentialIssueRequestPage },
  { path: "credimportrequest", component: CredentialImportRequestPage },
  {
    path: "regappprofilerequest",
    component: RegisterApplicationProfileRequestPage,
  },
  { path: "sethiveproviderrequest", component: SetHiveProviderRequestPage },
  { path: "signrequest", component: SignRequestPage },
  { path: "notsignedin", component: NotSignedInPage },
  { path: "settings", component: SettingsPage },
  { path: 'advanced-settings', component: AdvancedSettingsPage },
  { path: "exportmnemonic", component: ExportmnemonicPage }
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule],
})
export class IdentityRoutingModule { }
