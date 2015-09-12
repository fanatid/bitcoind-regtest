import _ from 'lodash'
import { EventEmitter } from 'events'
import readyMixin from 'ready-mixin'
import tmp from 'tmp'
import crypto from 'crypto'
import p2p from 'bitcore-p2p'
import RpcClient from 'bitcoind-rpc-client'
import PUtils from 'promise-useful-utils'

/**
 * @event Bitcoind#block
 * @param {string} hash
 */

/**
 * @event Bitcoind#tx
 * @param {string} txid
 */

/**
 * @class Bitcoind
 */
export default class Bitcoind extends EventEmitter {
  /**
   * @constructor
   * @param {Object} [opts]
   * @param {number} [opts.privKeyPoolSize=100] Private key mempool size
   * @param {Object} [opts.generate] Generate options
   * @param {Object} [opts.generate.txs]
   * @param {boolean} [opts.generate.txs.background=true]
   * @param {function} [opts.generate.txs.timeout=() => _.random(6, 9, true)]
   * @param {number} [opts.generate.txs.minInBlock=5]
   * @param {Object} [opts.generate.blocks]
   * @param {boolean} [opts.generate.blocks.background=true]
   * @param {function} [opts.generate.blocks.timeout=() => _.random(60, 90, true)]
   * @param {Object} [opts.bitcoind]
   * @param {function} [opts.bitcoind.path=() => '../bitcoind/bitcoind-rev-3224936']
   * @param {function} [opts.bitcoind.datadir=() => tmp.dir()]
   * @param {function} [opts.bitcoind.port=() => _.random(20000, 30000)]
   * @param {function} [opts.bitcoind.rpcuser=() => crypto.randomBytes(10).toString('hex')]
   * @param {function} [opts.bitcoind.rpcpassword=() => crypto.randomBytes(10).toString('hex')]
   * @param {function} [opts.bitcoind.rpcport=() => _.random(20000, 30000)]
   */
  constructor (opts) {
    super()

    // other bitcoind opts:
    // txindex
    // addnode
    // server
    //
  }

  /**
   * Return value for given option `name`
   * @param {string} name
   * @return {*}
   */
  getOpts (name) {}

  /**
   * Return instance of `RpcClient`
   * @return {RpcClient}
   */
  getRpcClient () {}

  /**
   * Same as func getRpcClient
   */
  get rpc () {
    return this.getRpcClient()
  }

  /**
   * Return private key in WIF format (address for this private key have 10 btc)
   * @return {Promise.<string>}
   */
  getPrivKey () {}

  /**
   * Generate `count` transactions
   * @param {number} count
   * @return {Promise.<Array.<string>>}
   */
  generateTxs (count) {}

  /**
   * Generate `count` blocks
   * @param {number} count
   * @return {Promise.<Array.<string>>}
   */
  generateBlocks (count) {}

  /**
   * Return instance of `Bitcoind` that have same blockchain
   * @param {Object} [opts]
   * @param {boolean} [opts.connected=true]
   * @return {Promise.<Bitcoind>}
   */
  fork (opts) {}

  /**
   * @param {Bitcoind}
   * @return {Promise}
   */
  connect (other) {}

  /**
   * @param {Bitcoind}
   * @return {Promise}
   */
  disconnect (other) {}
}
