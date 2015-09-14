import _ from 'lodash'
import { EventEmitter } from 'events'
import readyMixin from 'ready-mixin'
import bitcore from 'bitcore'
import makeConcurrent from 'make-concurrent'
import PUtils from 'promise-useful-utils'

bitcore.Networks.add({
  name: 'regtest',
  alias: 'regtest',
  pubkeyhash: 0x6f,
  privatekey: 0xef,
  scripthash: 0xc4,
  xpubkey: 0x043587cf,
  xprivkey: 0x04358394,
  networkMagic: 0xFABFB5DA,
  port: 18444,
  dnsSeeds: []
})

/**
 * @event Wallet#error
 * @param {Error} error

/**
 * @class Wallet
 */
export default class Wallet extends EventEmitter {
  /**
   * @constructor
   * @param {Bitcoind} bitcoind
   */
  constructor (bitcoind) {
    super()

    this._bitcoind = bitcoind
    this._preloadsPool = []

    // create addresses
    PUtils.try(async () => {
      let poolSize = this._getWalletOption('keysPoolSize')
      let ret = await this._bitcoind.rpc.getAddressesByAccount('')

      await this._bitcoind.rpc.batch(_.times(poolSize - ret.result.length).map(() => {
        return {method: 'getnewaddress', params: ['']}
      }))
    })
    .then(() => { this._ready(null) }, (err) => { this._ready(err) })

    // loop for creating new addresses
    this.ready.then(async () => {
      while (true) {
        try {
          await PUtils.delay(this._getWalletOption('newKeyTimeout'))
          await this._bitcoind.rpc.getNewAddress('')
        } catch (err) {
          this.emit(err)
        }
      }
    })

    // update preloads on new block
    this.ready.then(() => {
      this._bitcoind.on('block', ::this._updatePreloads)
    })
  }

  /**
   * @param {string} name
   * @return {*}
   */
  _getWalletOption (name) {
    return this._bitcoind.getOption(`wallet.${name}`)()
  }

  /**
   * @return {Promise.<Bitcoind~PreloadObject>}
   */
  getPreload = makeConcurrent(async () => {
    while (this._preloadsPool.length === 0) {
      await PUtils.delay(50)
    }

    let preload = this._preloadsPool.shift()
    this._updatePreloads()
    return preload
  })

  /**
   * @param {Array.<Object>} utxo
   * @param {Array.<Object>} outs
   * @param {boolean} [change=false]
   * @return {Promise.<bitcore.Transaction>}
   */
  async _createTx (utxo, outs, change = false) {
    let tx = bitcore.Transaction()
      .from(utxo.map((row) => {
        return {
          txId: row.txid,
          outputIndex: row.vout,
          satoshis: Math.floor(row.amount * 1e8),
          script: row.scriptPubKey
        }
      }))

    for (let out of outs) {
      tx = tx.to(out.address, out.amount)
    }

    if (change) {
      let ret = await this._bitcoind.rpc.getAddressesByAccount('')
      let changeAddress = _.sample(ret.result)
      tx = tx.change(changeAddress)
    }

    let ret = await this._bitcoind.rpc.batch(utxo.map((row) => {
      return {method: 'dumpprivkey', params: [row.address]}
    }))
    let privKeys = _.pluck(ret, 'result').map((raw) => {
      return bitcore.PrivateKey(raw)
    })

    return tx.sign(privKeys)
  }

  /**
   * @private
   * @return {Promise}
   */
  _updatePreloads () {
    return this._bitcoind.withLock(async () => {
      try {
        if (this._preloadsPool.length >= this._getWalletOption('preloadsPoolSize')) {
          return
        }

        let ret = await this._bitcoind.rpc.listUnspent(0)
        let utxo = _.chain(ret.result)
          .sortBy('amount')
          .reverse()
          .reduce((result, row) => {
            if (result.total < 10) {
              result.list.push(row)
              result.total += row.amount
            }

            return result
          }, {list: [], total: 0})
          .value()

        if (utxo.total < 10) {
          return
        }

        let preloadPrivKey = bitcore.PrivateKey.fromRandom('regtest')
        let tx = await this._createTx(
          utxo.list, [{address: preloadPrivKey.toAddress(), amount: 10 * 1e8}], true)

        ret = await this._bitcoind.rpc.sendRawTransaction(tx.toString())
        if (ret.result !== tx.id) {
          throw new Error(JSON.stringify(ret))
        }

        this._preloadsPool.push({
          txId: tx.id,
          outIndex: 0,
          value: 10 * 1e8,
          script: bitcore.Script.buildPublicKeyHashOut(preloadPrivKey.toAddress()),
          privKey: preloadPrivKey
        })

        setImmediate(::this._updatePreloads)
      } catch (err) {
        this.emit('error', err)
      }
    })
  }

  /**
   * @return {Promise.<?string>}
   */
  generateTx () {
    return this._bitcoind.withLock(async () => {
      let ret = await this._bitcoind.rpc.listUnspent(0)
      let utxo = _.sample(ret.result, this._getWalletOption('inputsCount'))
      let utxoTotalAmount = _.sum(_.pluck(utxo, 'amount')) * 1e8 - 1e4
      if (utxo.length === 0 || utxoTotalAmount < 1e7) {
        return null
      }

      ret = await this._bitcoind.rpc.getAddressesByAccount('')
      let addresses = _.sample(ret.result, this._getWalletOption('outputsCount'))
      let values = _.times(addresses.length).map(() => _.random(0, 1, true))
      let valuesSum = _.sum(values)
      let outs = addresses.map((address, index) => {
        return {address: address, amount: Math.floor(utxoTotalAmount * values[index] / valuesSum)}
      })

      let tx = await this._createTx(utxo, outs)

      ret = await this._bitcoind.rpc.sendRawTransaction(tx.toString())
      if (ret.result !== tx.id) {
        throw new Error(JSON.stringify(ret))
      }

      return tx.id
    })
  }
}

readyMixin(Wallet.prototype)
