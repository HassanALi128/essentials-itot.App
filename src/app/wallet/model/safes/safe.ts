import { TxData } from "ethereumjs-tx";
import { Transfer } from "../../services/cointransfer.service";
import { BTCTxData } from "../btc.types";
import { MasterWallet } from "../masterwallets/masterwallet";
import { AnyNetworkWallet } from "../networks/base/networkwallets/networkwallet";
import { AnySubWallet } from "../networks/base/subwallets/subwallet";
import { AddressUsage } from "./addressusage";
import { SignTransactionResult } from "./safe.types";


/**
 * Hosts and manipulates sensitive wallet information such as mnemonic, seed, private keys.
 * Wallets use different safes depending if they the wallet credentials are stored locally in the app,
 * or in a hardware wallet.
 *
 * The way to get public addresses (derivation) is also managed by safes, like everything that depends
 * on wallet private keys.
 */
export abstract class Safe {
  protected networkWallet: AnyNetworkWallet = null;;

  constructor(protected masterWallet: MasterWallet) { }

  /**
   * Initialization method that can be overriden by subclasses.
   */
  public initialize(networkWallet: AnyNetworkWallet): Promise<void> {
    this.networkWallet = networkWallet;
    return;
  }

  /**
   * Convenient method to get a set of derived addresses from a start index.
   * Requested addresses can be internal (hardened derivation path) or external.
   *
   * If multiple addresses are requested on wallets that can't get them (eg single address
   * wallets), an exception is thrown.
   *
   * @param usage Most of the time, networks have only one kind of address so they don't need to handle this. But some networks (eg: iotex) use several address formats and need to return different address styles depending on situations.
   */
  public abstract getAddresses(startIndex: number, count: number, internalAddresses: boolean, usage: AddressUsage | string): Promise<string[]>; // TODO

  /**
   * Returns wallet's extended public key (xpub...) string.
   */
  public getExtendedPublicKey(): Promise<string> {
    return null; // Default implementation: ext pub key not provided for now.
  }

  // TODO: remove this Transfer object, dirty.
  public abstract signTransaction(subWallet: AnySubWallet, rawTx: string | TxData | BTCTxData, transfer: Transfer): Promise<SignTransactionResult>;
}