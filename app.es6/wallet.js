import bitcore from 'bitcore'
import makeConcurrent from 'make-concurrent'

/**
 * @class Wallet
 */
export default class Wallet {
  /**
   * @constructor
   * @param {Object} opts
   * @param {Bitcoind} opts.bitcoind
   * @param {number} opts.privKeyPoolSize
   */
  constructor (opts) {
  }

  /**
   * @return {Promise.<string>}
   */
  getPrivKey = makeConcurrent(() => {
  })

  /**
   * @return {Promise.<string>}
   */
  generateTx = makeConcurrent(() => {
  })
}
