/*
 * Copyright (c) 2020 Elastos Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Injectable } from '@angular/core';
import Web3 from 'web3';
import { ERC20Coin } from '../model/Coin';
import { EssentialsWeb3Provider } from 'src/app/model/essentialsweb3provider';
import { Logger } from 'src/app/logger';
import { WalletPrefsService } from './pref.service';

@Injectable({
    providedIn: 'root'
})
export class ERC20CoinService {
    /** Web3 variables to call smart contracts */
    private web3: Web3;
    private erc20ABI: any;

    constructor(private prefs: WalletPrefsService) {
    }

    // Lazy web3 init for angular bundle optimization
    private getWeb3(): Web3 {
        if (this.web3)
            return this.web3;

        const trinityWeb3Provider = new EssentialsWeb3Provider();
        this.web3 = new Web3(trinityWeb3Provider);

        // Standard ERC20 contract ABI
        this.erc20ABI = require('../../../assets/wallet/ethereum/StandardErc20ABI.json');

        return this.web3;
    }

    public isAddress(address: string) {
        return this.getWeb3().utils.isAddress(address);
    }

    public async isContractAddress(address: string) {
        const contractCode = await this.getWeb3().eth.getCode(address);
        return contractCode === '0x' ? false : true;
    }

    public async getCoinDecimals(address: string, ethAccountAddress: string) {
        let coinDecimals = 0;
        const erc20Contract = new (this.getWeb3()).eth.Contract(this.erc20ABI, address, { from: ethAccountAddress });
        if (erc20Contract) {
            coinDecimals = await erc20Contract.methods.decimals().call();
            Logger.log('wallet', 'Coin decimals:', coinDecimals);
        }
        return coinDecimals;
    }

    public async getCoinInfo(address: string, ethAccountAddress: string) {
        const erc20Contract = new (this.getWeb3()).eth.Contract(this.erc20ABI, address, { from: ethAccountAddress });
        Logger.log('wallet', 'erc20Contract', erc20Contract);

        const coinName = await erc20Contract.methods.name().call();
        Logger.log('wallet', 'Coin name:', coinName);

        const coinSymbol = await erc20Contract.methods.symbol().call();
        Logger.log('wallet', 'Coin symbol:', coinSymbol);

        const coinDecimals = await erc20Contract.methods.decimals().call();
        Logger.log('wallet', 'Coin decimals:', coinDecimals);

        return { coinName, coinSymbol, coinDecimals};
    }

    public async getERC20Coin(address: string, ethAccountAddress: string) {
        const coinInfo = await this.getCoinInfo(address, ethAccountAddress);
        const newCoin = new ERC20Coin(coinInfo.coinSymbol, coinInfo.coinSymbol, coinInfo.coinName, address, this.prefs.activeNetwork, false);
        return newCoin;
    }
}
