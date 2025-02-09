import { TranslateService } from '@ngx-translate/core';
import BigNumber from 'bignumber.js';
import { Subject } from 'rxjs';
import { Logger } from 'src/app/logger';
import { GlobalTranslationService } from 'src/app/services/global.translation.service';
import { Native } from 'src/app/wallet/services/native.service';
import { OutgoingTransactionState, TransactionService } from 'src/app/wallet/services/transaction.service';
import { WalletService } from 'src/app/wallet/services/wallet.service';
import type { Transfer } from '../../../../services/cointransfer.service';
import { Coin, CoinID, CoinType, StandardCoinName } from '../../../coin';
import { BridgeProvider } from '../../../earn/bridgeprovider';
import { EarnProvider } from '../../../earn/earnprovider';
import { SwapProvider } from '../../../earn/swapprovider';
import type { MasterWallet } from '../../../masterwallets/masterwallet';
import type { WalletNetworkOptions } from '../../../masterwallets/wallet.types';
import { AddressUsage } from '../../../safes/addressusage';
import { SignTransactionErrorType } from '../../../safes/safe.types';
import { TimeBasedPersistentCache } from '../../../timebasedpersistentcache';
import type { AnyOfflineTransaction, GenericTransaction, RawTransactionPublishResult, TransactionInfo } from '../../../tx-providers/transaction.types';
import { TransactionListType } from '../../evms/evm.types';
import type { NetworkWallet } from '../networkwallets/networkwallet';

export abstract class SubWallet<TransactionType extends GenericTransaction, WalletNetworkOptionsType extends WalletNetworkOptions> {
  public masterWallet: MasterWallet;
  public id: CoinID = null;
  public tokenDecimals: number;
  public tokenAmountMulipleTimes: BigNumber; // 10 ^ tokenDecimal
  protected balance: BigNumber = new BigNumber(NaN); // raw balance. Will be sELA for standard wallets, or a token number for ERC20 coins.
  protected balanceSpendable: BigNumber = new BigNumber(NaN); // ELA: The coinbase utxo can not be used before be confirmed more than 100 times.
  public lastBlockTime: string = null;

  public balanceCache: TimeBasedPersistentCache<any> = null;
  public balanceKeyInCache = null;

  public loadTxDataFromCache = true;
  public subwalletTransactionStatusID = '';

  public backGroundUpdateStoped = false;

  constructor(public networkWallet: NetworkWallet<any, WalletNetworkOptionsType>, id: CoinID, public type: CoinType) {
    this.masterWallet = networkWallet.masterWallet;
    this.id = id;
    this.type = type;

    this.subwalletTransactionStatusID = this.masterWallet.id + '-' + this.id;
  }

  /**
   * Identifier that make this subwallet unique inside its own network.
   * For standard wallets, this is the coin ID. For ERC20 tokens, this is the contract address.
   */
  public abstract getUniqueIdentifierOnNetwork(): string;

  public async initialize(): Promise<void> {
    await this.loadBalanceFromCache();
  }

  /**
   * Starts updates in background.
   * All the initializations here are not mandatory during initializations and can deliver
   * asynchronous content at any time.
   *
   * This method can be overriden by subwallet implementations.
   */
  public startBackgroundUpdates(): Promise<void> {
    this.backGroundUpdateStoped = false;
    return;
  }

  public stopBackgroundUpdates(): Promise<void> {
    this.backGroundUpdateStoped = true;
    return;
  }

  public toSerializedSubWallet(): SerializedSubWallet {
    return SerializedSubWallet.fromSubWallet(this);
  }

  public isStandardSubWallet(): boolean {
    return false;
  }

  public abstract getCoin(): Coin;

  public supportsCrossChainTransfers(): boolean {
    return false;
  }

  public getAddressCount(internal = false): number {
    if (internal) return 0;
    else return 1;
  }

  private async loadBalanceFromCache() {
    if (!this.balanceKeyInCache) {
      this.balanceKeyInCache = this.masterWallet.id + '-' + this.getUniqueIdentifierOnNetwork() + '-balance';
    }
    this.balanceCache = await TimeBasedPersistentCache.loadOrCreate(this.balanceKeyInCache);
    if (this.balanceCache.size() !== 0) {
      this.balance = new BigNumber(this.balanceCache.values()[0].data);
    }
  }

  public async saveBalanceToCache(): Promise<void> {
    const timestamp = (new Date()).valueOf();
    this.balanceCache.set('balance', this.balance, timestamp);
    await this.balanceCache.save();
  }

  public getRawBalance(): BigNumber {
    return this.balance;
  }

  public getRawBalanceSpendable(): BigNumber {
    // return this.balanceSpendable; // Only for ELA MainChain.
    return this.balance;
  }

  public updateBalanceSpendable() {
  }

  /**
   * Returns the subwallet balance. The raw "balance" value is divided by the multiple to get a readable value.
   * Ex: returns 5 ELA, 3 MDX, etc
   */
  public getBalance(): BigNumber {
    if (this.balance.isNaN())
      return this.balance;

    return this.balance.dividedBy(this.tokenAmountMulipleTimes);
  }

  /**
   * Returns the subwallet balance evaluated in USD.
   */
  public abstract getUSDBalance(): BigNumber;

  /**
   * Returns the value of 1 coin, in USD
   */
  public abstract getOneCoinUSDValue(): BigNumber;

  /**
   * If we get the transactions from cache, then we need update the transactions in 3s.
   */
  public isLoadTxDataFromCache() {
    return this.loadTxDataFromCache;
  }

  /**
   * From a given transaction return a UI displayable transaction title.
   */
  protected abstract getTransactionName(transaction: TransactionType, translate: TranslateService): Promise<string>;
  /**
   * From a given transaction return a UI displayable transaction icon that illustrates the transaction operation.
   */
  protected async getTransactionIconPath(transaction: TransactionType): Promise<string> {
    return await "";
  }

  public abstract getTransactionInfo(transaction: TransactionType): Promise<TransactionInfo>;

  /**
   * Extract data from an offline transaction to build a transaction info object (displayable on UI).
   */
  public getTransactionInfoForOfflineTransaction(transaction: AnyOfflineTransaction): Promise<TransactionInfo> {
    return null;
  }

  /**
   * Inheritable method to do some cleanup when a subwallet is removed/destroyed from a master wallet
   */
  public async destroy(): Promise<void> {
    if (this.balanceCache)
      await this.balanceCache.delete();
    return Promise.resolve();
  }

  /**
   * Create a new wallet address for receiving payments.
   * @deprecated
   */
  public abstract createAddress(): string;

  /**
   * Address to use to receive a payment. For single address wallets this is always the first address.
   */
  public getCurrentReceiverAddress(usage: AddressUsage | string = AddressUsage.DEFAULT): string {
    // Default implementation (for single address wallets): always return the first address.
    // Multi address wallets override this to return the real "current" receiving address.
    let addresses = this.networkWallet.safe.getAddresses(0, 1, false, usage);
    return (addresses && addresses[0]) ? addresses[0] : null;
  }

  public abstract isAddressValid(address: string): Promise<boolean>;

  /**
   * Returns the path to the main icon representing the subwallet.
   * For standard subwallets, this is usually the network icon. For ERC20 subwallets,
   * this is usually a "ETH" icon (default) or the coin icon (if known), as the secondary icon shows the network
   */
  public abstract getMainIcon(): string;

  /**
   * Returns the path to a secondary icon. Standard subwallets usually don't have one and should return null.
   * ERC20 subwallets usually show the network icon, as the primary icon already shows the coin itself.
   */
  public abstract getSecondaryIcon(): string;

  /**
   * Returns a UI readable name for this sub wallet.
   * Ex: for a ERC20 token, this will be the token description such as "Trinity Tech"
   */
  public abstract getFriendlyName(): string;

  /**
   * Returns a UI displayable token symbol.
   * Ex: for a ERC20 token, this will be something like "TTECH"
   */
  public abstract getDisplayTokenName(): string;

  /**
   */
  public getAverageBlocktime(): number {
    return this.networkWallet.getAverageBlocktime();
  }

  /**
   * Converts a given value in this wallet in the external currency chosen by user (USD, BTC, CNY, etc).
   * In case the subwallet is not able to compute this value (ex: ERC20 coins for now), the returned
   * value is null.
   */
  public abstract getAmountInExternalCurrency(value: BigNumber): BigNumber;

  /**
   * Requests a wallet to update its balance and transactions.
   */
  public abstract update();

  /**
   * Requests a wallet to update its balance. Usually called when we receive an event from the SPV SDK,
   * saying that a new balance amount is available.
   */
  public abstract updateBalance(): Promise<void>;

  /**
   * Shortcut for getDisplayAmount(balance)
   */
  public abstract getDisplayBalance(): BigNumber;

  /**
   * Returns a given value converted to a human friendly unit. For example, standard wallets have a balance in sELA but
   * getDisplayBalance() returns the amount in ELA.
   */
  public abstract getDisplayAmount(amount: BigNumber): BigNumber;

  // Only ELA main chain support memo.
  public supportMemo() {
    return false;
  }

  public supportInternalTransactions() {
    return false;
  }

  /**
   * Tells if this subwallet has a balance greater than or equal to the given amount.
   */
  public abstract isBalanceEnough(amount: BigNumber): boolean;

  /**
   * Check whether the amount is valid.
   * @param amount unit is ETHER
   */
  public isAmountValid(amount: BigNumber) {
    let amountString = amount.toFixed();
    if (amountString.indexOf('.') > -1 && amountString.split(".")[1].length > this.tokenDecimals) {
      return false;
    } else {
      return true;
    }
  }

  /**
   * Get the list of transactions currently in local memory cache.
   */
  public getTransactions(transactionListType = TransactionListType.NORMAL): Promise<TransactionType[]> {
    return this.networkWallet.getTransactionDiscoveryProvider().getTransactions(this, transactionListType);
  }

  /**
   * Get the list of offline transactions, not published on chain (eg: multisig temporarily unsigned).
   */
  public getOfflineTransactions(): Promise<AnyOfflineTransaction[]> {
    return this.networkWallet.getTransactionDiscoveryProvider().getOfflineTransactions(this);
  }

  /**
   * Immediatelly fetch the newest transactions, and repeatingly fetch the newest transactions
   * again until this is stopped.
   */
  /* public startNewTransactionsFetchLoop() {
    return this.networkWallet.getTransactionDiscoveryProvider().startNewTransactionsFetchLoop(this);
  } */

  /**
   * Stops a fetching loop
   */
  /* public stopNewTransactionsFetchLoop() {
    return this.networkWallet.getTransactionDiscoveryProvider().startNewTransactionsFetchLoop(this);
  } */

  /**
   * Request a network call to fetch the latest transactions for this subwallet.
   */
  public fetchNewestTransactions(transactionListType = TransactionListType.NORMAL) {
    return this.networkWallet.getTransactionDiscoveryProvider().fetchNewestTransactions(this, transactionListType);
  }

  public canFetchMoreTransactions(): boolean {
    return this.networkWallet.getTransactionDiscoveryProvider().canFetchMoreTransactions(this);
  }

  /**
   * Request a network call to fetch the transactions after the given transaction.
   * If afterTransaction is not passed, we use the last know cached transaction as the last one.
   */
  public fetchMoreTransactions(afterTransaction?: TransactionType) {
    return this.networkWallet.getTransactionDiscoveryProvider().fetchMoreTransactions(this, afterTransaction);
  }

  public getTransactionsCacheKey(transactionListType = TransactionListType.NORMAL): string {
    if (transactionListType === TransactionListType.NORMAL) {
      return this.masterWallet.id + "-" + this.networkWallet.network.key + "-" + this.id + "-transactions";
    } else {
      return this.masterWallet.id + "-" + this.networkWallet.network.key + "-" + this.id + "-internaltransactions";
    }
  }

  /**
   * Fetches the transactions using the right RPC APIs and converts data into a common transactions
   * list format shared by all EVM subwallets.
   */
  //public abstract fetchTransactions(startingAt?: number): Promise<GenericTransaction[]>;

  //public abstract canFetchMoreTransactions(): boolean;

  /**
   * Save the transctions list to cache.
   */
  //public abstract saveTransactions(transactions: GenericTransaction[]);

  /**
   * Method called by the wallet home screen to known if the subwallet should appear in the list or not.
   * In most cases, this method returns true because we want to show the subwallet. But some cases such
   * as the old elastos ID chain wallet are hidden by overriding this method.
   */
  public shouldShowOnHomeScreen(): boolean {
    return true;
  }

  public transactionsListChanged(): Subject<void> {
    return this.networkWallet.getTransactionDiscoveryProvider().transactionsListChanged(this.getUniqueIdentifierOnNetwork());
  }

  public transactionsFetchStatusChanged(): Subject<boolean> {
    return this.networkWallet.getTransactionDiscoveryProvider().transactionsFetchStatusChanged(this.getUniqueIdentifierOnNetwork());
  }

  // public abstract getTransactionDetails(txid: string): Promise<TransactionDetail>;

  // TODO: same as createPaymentTransaction
  public abstract createWithdrawTransaction(toAddress: string, amount: number, memo: string, gasPrice: string, gasLimit: string, nonce: number): Promise<string>;

  /**
   * Executes a SIGNED transaction publication process, including UI flows such as blocking popups.
   * This method returns when a transaction ID is obtained, without waiting for confirmation.
   * But some implementations like the EVM one continue to check for confirmations and emit
   * a evm transaction status event later on.
   *
   * @param visualFeedback Show UI progress/feedback or not. Must be true by default
   */
  protected abstract publishTransaction(signedTransaction: string, visualFeedback?: boolean): Promise<string>;

  /**
   * (Optionally) Internally called by implementations of publishTransaction() to display a generic publication
   * dialog.
   */
  protected markGenericOutgoingTransactionStart() {
    TransactionService.instance.resetTransactionPublicationStatus();
    TransactionService.instance.setOnGoingPublishedTransactionState(OutgoingTransactionState.PUBLISHING);
  }

  /**
   * (Optionally) Internally called by implementations of publishTransaction() to hide a generic publication
   * dialog.
   */
  protected markGenericOutgoingTransactionEnd(txid: string, message: string = '') {
    if (txid)
      TransactionService.instance.setOnGoingPublishedTransactionState(OutgoingTransactionState.PUBLISHED);
    else
      TransactionService.instance.setOnGoingPublishedTransactionState(OutgoingTransactionState.ERRORED, message);
  }

  /**
   * Signs a RAW transaction using a safe, and initiates the publication flow by calling
   * publishTransaction().
   *
   * By default, the master password is required, even if elready known, as a security step. But this can be
   * disabled, for example to chain operations (eg: easy bridge feature0, using forcePasswordPrompt = false.
   *
   * The UI feedback (popup) can also be hidden using visualFeedback = false.
   *
   * Optionally navigates home after completion. TODO: MOVE THIS NAVIGATION IN SCREENS
   */
  // TODO: make this "transfer" object disappear...
  public async signAndSendRawTransaction(rawTransaction: any, transfer: Transfer, navigateHomeAfterCompletion = true, forcePasswordPrompt = true, visualFeedback = true): Promise<RawTransactionPublishResult> {
    // Ask the safe to sign the transaction. This includes potential password prompt or other UI operations
    // depending on the safe requirements.
    let signedTxResult = await this.networkWallet.safe.signTransaction(this, rawTransaction, transfer, forcePasswordPrompt, visualFeedback);
    if (!signedTxResult.signedTransaction) {
      if (signedTxResult.errorType === SignTransactionErrorType.DELEGATED) {
        Logger.log("wallet", "Transaction signature has been delegated to another flow.");
        return {
          published: false,
          txid: null,
          status: 'delegated'
        }
      }
      else {
        return {
          published: false,
          txid: null,
          status: (signedTxResult.errorType === SignTransactionErrorType.CANCELLED) ? 'cancelled' : 'error'
        }
      }
    }

    return this.sendSignedTransaction(signedTxResult.signedTransaction, transfer, navigateHomeAfterCompletion, visualFeedback);
  }

  public async sendSignedTransaction(signedTransaction: string, transfer: Transfer, navigateHomeAfterCompletion = true, visualFeedback = true): Promise<RawTransactionPublishResult> {
    try {
      Logger.log("wallet", "Publishing transaction.", signedTransaction);

      await this.markGenericOutgoingTransactionStart();

      let transactionToPublish = await this.networkWallet.safe.convertSignedTransactionToPublishableTransaction(this, signedTransaction);
      let txid = await this.publishTransaction(transactionToPublish, visualFeedback);

      await this.markGenericOutgoingTransactionEnd(txid);

      Logger.log("wallet", "publishTransaction txid:", txid);

      if (navigateHomeAfterCompletion) {
        await Native.instance.setRootRouter('/wallet/wallet-home');
        WalletService.instance.events.publish('wallet:transactionsent', { subwalletid: this.id, txid: txid });
      }

      let published = true;
      let status = 'published';
      if (!txid || txid.length == 0) {
        published = false;
        status = 'error';
      }
      return {
        published,
        status,
        txid
      };
    }
    catch (err) {
      Logger.error("wallet", "Publish error:", err);

      // ETHTransactionManager handle this error if the subwallet is StandardEVMSubWallet.
      // Maybe need to speed up.
      //if (!(this instanceof MainCoinEVMSubWallet)) { // BPI: Removed because of circular dependency - should move to safe, maybe. To be checked
      let message = ''
      if (err.message) {
        if (err.message.includes('slot TxInputsReferKeys verify tx error')) { // For ELA main chain.
            message = GlobalTranslationService.instance.translateInstant('wallet.transaction-pending');
        } else if (err.message.startsWith('transaction validate error')) {
            let errorInfo = err.message.substring(26)
            message = GlobalTranslationService.instance.translateInstant('wallet.transaction-invalid') + errorInfo;
        } else {
            message = err.message;
        }
      }

      await this.markGenericOutgoingTransactionEnd(null, message);

      return {
        published: false,
        txid: null,
        status: 'error',
        code: err.code,
        message: message,
      };
    }
  }

  public getAvailableEarnProviders(): EarnProvider[] {
    return [];
  }

  public getAvailableSwapProviders(): SwapProvider[] {
    return [];
  }

  public getAvailableBridgeProviders(): BridgeProvider[] {
    return [];
  }

  /**
   * Returns a specific ERC20 token address (0x...), or coin name ("btc"), used as a parameter for swap provider urls
   * to directly target a coin to swap.
   */
  public getSwapInputCurrency(): string {
    return "";
  }
}

/**
 * Subwallet representation ready to save to local storage for persistance.
 * Only non standard subwallets are serialized
 */
export class SerializedSubWallet {
  public type: CoinType = null;
  public id: StandardCoinName = null;

  /**
   * Serialize only fields that we are willing to have in the serialized output.
   * and the balance type of subwallet is bigNumber,
   * It needs to be converted to string and then saved to localstorage.
   */
  public static fromSubWallet(subWallet: SubWallet<any, any>): SerializedSubWallet {
    const serializedSubWallet = new SerializedSubWallet();
    serializedSubWallet.type = subWallet.type;
    serializedSubWallet.id = subWallet.id as StandardCoinName;
    return serializedSubWallet;
  }
}

// Convenient type to avoid adding SubWallet<any> everywhere.
export type AnySubWallet = SubWallet<GenericTransaction, any>;