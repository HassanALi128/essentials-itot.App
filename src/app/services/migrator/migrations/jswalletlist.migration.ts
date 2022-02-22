import { IdentityEntry } from "../../global.didsessions.service";
import { Migration } from "../migration";

// 2022-02-17
export class JSWalletListMigration extends Migration {
  constructor(uniquelyIncrementedId: number) {
    super(uniquelyIncrementedId, "Wallet list storage conversion");
  }

  public async migrate(identityEntry: IdentityEntry): Promise<void> {
    // Lazy loading to not load heavy dependencies when the migration is not needed.
    await (await import("./jswalletlist.migration.exec")).migrate(identityEntry);
  }

  public async debugClearMigrationState(identityEntry: IdentityEntry): Promise<void> {
    await (await import("./jswalletlist.migration.exec")).debugClearMigrationState(identityEntry);
  }
}