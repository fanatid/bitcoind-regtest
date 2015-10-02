import _ from 'lodash'
import { EventEmitter } from 'events'
import { mixin } from 'core-decorators'
import ReadyMixin from 'ready-mixin'
import _tmpfs from 'tmp'
import _rimraf from 'rimraf'
import crypto from 'crypto'
import { spawn } from 'child_process'
import bitcore from 'bitcore'
import p2p from 'bitcore-p2p'
import RpcClient from 'bitcoind-rpc-client'
import makeConcurrent from 'make-concurrent'
import PUtils from 'promise-useful-utils'

import Wallet from './wallet'

let tmpfs = PUtils.promisifyAll(_tmpfs)
let rimraf = PUtils.promisify(_rimraf)

let encode = (s) => {
  return Array.prototype.reverse.call(new Buffer(s)).toString('hex')
}

/**
 * @event Bitcoind#error
 * @param {Error} err
 */

/**
 * @event Bitcoind#data
 * @param {string} data
 */

/**
 * @event Bitcoind#exit
 * @param {number} code
 * @param {string} signal
 */

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
@mixin(ReadyMixin)
export default class Bitcoind extends EventEmitter {
  /**
   * @constructor
   * @param {Object} [opts]
   * @param {Object} [opts.wallet] Wallet options
   * @param {function} [opts.wallet.preloadsPoolSize=_.constant(10)] Preload pool size
   * @param {function} [opts.wallet.keysPoolSize=() => _.random(80, 100)]
   * @param {function} [opts.wallet.newKeyTimeout=() => _.random(60, 90) * 1000]
   * @param {function} [opts.wallet.inputsCount=() => _.random(2, 3)]
   * @param {function} [opts.wallet.outputsCount=() => _.random(3, 5)]
   * @param {Object} [opts.generate] Generate options
   * @param {Object} [opts.generate.txs]
   * @param {function} [opts.generate.txs.background=_.constant(true)]
   * @param {function} [opts.generate.txs.timeout=() => _.random(6, 9, true) * 1000]
   * @param {function} [opts.generate.txs.minInBlock=_.constant(5)]
   * @param {Object} [opts.generate.blocks]
   * @param {function} [opts.generate.blocks.background=_.constant(true)]
   * @param {function} [opts.generate.blocks.timeout=() => _.random(60, 90, true) * 1000]
   * @param {Object} [opts.bitcoind]
   * @param {function} [opts.bitcoind.path=() => '../bitcoind/bitcoind-rev-3224936']
   * @param {function} [opts.bitcoind.datadir=async () => _.first(tmpfs.dir({prefix: 'bitcoind-regtest-'}))]
   * @param {function} [opts.bitcoind.port=() => _.random(20000, 30000)]
   * @param {function} [opts.bitcoind.rpcport=() => _.random(20000, 30000)]
   * @param {function} [opts.bitcoind.rpcuser=() => crypto.randomBytes(10).toString('hex')]
   * @param {function} [opts.bitcoind.rpcpassword=() => crypto.randomBytes(10).toString('hex')]
   */
  constructor (opts) {
    super()

    PUtils.try(async () => {
      this._opts = _.defaultsDeep(_.cloneDeep(opts) || {}, {
        wallet: {
          preloadsPoolSize: _.constant(10),
          keysPoolSize: () => _.random(80, 100),
          newKeyTimeout: () => _.random(60, 90) * 1000,
          inputsCount: () => _.random(2, 2),
          outputsCount: () => _.random(3, 5)
        },
        generate: {
          txs: {
            background: _.constant(true),
            timeout: () => _.random(6, 9, true) * 1000,
            minInBlock: _.constant(5)
          },
          blocks: {
            background: _.constant(true),
            timeout: () => _.random(60, 90, true) * 1000
          }
        },
        bitcoind: {
          path: () => '../bitcoind/bitcoind-rev-3224936',
          datadir: async () => _.first(await tmpfs.dirAsync({
            prefix: 'bitcoind-regtest-',
            keep: false,
            unsafeCleanup: true
          })),
          port: () => _.random(20000, 30000),
          rpcport: () => _.random(20000, 30000),
          rpcuser: () => crypto.randomBytes(10).toString('hex'),
          rpcpassword: () => crypto.randomBytes(10).toString('hex')
        }
      })

      // process options
      this._processOpts = {
        path: this._opts.bitcoind.path(),
        datadir: await this._opts.bitcoind.datadir(),
        port: this._opts.bitcoind.port(),
        rpcport: this._opts.bitcoind.rpcport(),
        rpcuser: this._opts.bitcoind.rpcuser(),
        rpcpassword: this._opts.bitcoind.rpcpassword()
      }

      // init bitcoind process
      this._process = spawn(this._opts.bitcoind.path(), [
        `-regtest`,
        `-txindex=1`,
        `-server`,
        `-datadir=${this._processOpts.datadir}`,
        `-port=${this._processOpts.port}`,
        `-rpcport=${this._processOpts.rpcport}`,
        `-rpcuser=${this._processOpts.rpcuser}`,
        `-rpcpassword=${this._processOpts.rpcpassword}`,
        `-printtoconsole`
      ], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this._process.on('error', (err) => { this.emit('error', err) })
      this._process.on('exit', (code, signal) => { this.emit('exit', code, signal) })
      this._process.stdout.on('error', (err) => { this.emit('error', err) })
      this._process.stdout.on('data', (data) => { this.emit('data', data) })
      this._process.stderr.on('error', (err) => { this.emit('error', err) })
      this._process.stderr.on('data', (data) => { this.emit('data', data) })

      // await running bitcoind
      let onErrorExit
      try {
        await new Promise((resolve, reject) => {
          setTimeout(resolve, 1000)

          onErrorExit = (code, signal) => {
            if (code instanceof Error && signal === undefined) {
              reject(code)
            }

            reject(new Error(`Exit with code = ${code} on signal = ${signal}`))
          }

          this._process.on('error', onErrorExit)
          this._process.on('exit', onErrorExit)
        })
      } finally {
        this._process.removeListener('error', onErrorExit)
        this._process.removeListener('exit', onErrorExit)
      }

      // initialize peer
      this._peer = new p2p.Peer({
        host: '127.0.0.1',
        port: this._processOpts.port,
        network: bitcore.Networks.get('regtest')
      })

      this._peer.on('inv', (message) => {
        let names = []

        for (let inv of message.inventory) {
          // store inv type name
          names.push(p2p.Inventory.TYPE_NAME[inv.type])

          // store inv if tx type
          if (inv.type === p2p.Inventory.TYPE.TX) {
            this.emit('tx', encode(inv.hash))
          }

          // emit block if block type
          if (inv.type === p2p.Inventory.TYPE.BLOCK) {
            this.emit('block', encode(inv.hash))
          }
        }
      })

      await new Promise((resolve) => {
        this._peer.once('ready', resolve)
        this._peer.connect()
      })

      // wait wallet initialization
      this._wallet = new Wallet(this)
      this._wallet.on('error', this.emit.bind(this, 'error'))
      await this._wallet.ready
    })
    .then(() => { this._ready(null) }, (err) => { this._ready(err) })

    // loop for creating new transactions in background
    this.ready.then(async () => {
      while (true) {
        try {
          await PUtils.delay(this._opts.generate.txs.timeout())
          if (this._opts.generate.txs.background()) {
            await this.generateTxs(1)
          }
        } catch (err) {
          this.emit(err)
        }
      }
    })

    // loop for creating new blocks in background
    this.ready.then(async () => {
      while (true) {
        try {
          await PUtils.delay(this._opts.generate.blocks.timeout())
          if (this._opts.generate.blocks.background()) {
            await this.generateBlocks(1)
          }
        } catch (err) {
          this.emit(err)
        }
      }
    })
  }

  /**
   * Return value for given option `name`
   * @param {string} name
   * @return {*}
   */
  getOption (name) { return _.get(this._opts, name) }

  /**
   * @param {string} name
   * @param {*}
   */
  setOption (name, value) { _.set(this._opts, name, value) }

  /**
   * Return instance of `RpcClient`
   * @return {RpcClient}
   */
  getRpcClient () {
    return new RpcClient({
      host: '127.0.0.1',
      port: this._processOpts.rpcport,
      user: this._processOpts.rpcuser,
      pass: this._processOpts.rpcpassword
    })
  }

  /**
   * Same as func getRpcClient
   */
  get rpc () { return this.getRpcClient() }

  /**
   * @param {function} fn
   * @return {Promise}
   */
  @makeConcurrent({concurrency: 1})
  withLock (fn) { return fn() }

  /**
   * Generate `count` blocks
   * @param {number} count
   * @return {Promise.<Array.<string>>}
   */
  @makeConcurrent({concurrency: 1})
  async generateBlocks (count) {
    await this.ready

    let hashes = []
    for (; count > 0; count -= 1) {
      let requiredMemPoolSize = this._opts.generate.txs.minInBlock()
      let memPoolSize = (await this.rpc.getMemPoolInfo()).result.size
      await this.generateTxs(requiredMemPoolSize - memPoolSize)
      await this.withLock(async () => {
        let ret = await this.rpc.generate(1)
        hashes.push(ret.result[0])
      })
    }

    return hashes
  }

  /**
   * Generate `count` transactions
   * @param {number} count
   * @return {Promise.<Array.<?string>>}
   */
  async generateTxs (count) {
    await this.ready
    return await* _.times(count).map(() => {
      return this._wallet.generateTx()
    })
  }

  /**
   * @typedef {Object} Bitcoind~PreloadObject
   * @property {string} txId
   * @property {number} outIndex
   * @property {number} value
   * @property {bitcore.Script} script
   * @property {bitcore.PrivateKey} privKey
   */

  /**
   * Return Object with utxo data and with private key (balance is 10btc)
   * @return {Promise.<Bitcoind~PreloadObject>}
   */
  async getPreload () {
    await this.ready
    return await this._wallet.getPreload()
  }

  /**
   * Return instance of `Bitcoind` that have same blockchain
   * @param {Object} [opts]
   * @param {boolean} [opts.connected=true]
   * @return {Promise.<Bitcoind>}
   */
  async fork (opts) {
    let bopts = _.cloneDeep(this._opts)
    bopts.generate.txs.background = _.constant(false)
    bopts.generate.blocks.background = _.constant(false)
    let other = new Bitcoind(bopts)

    await other.ready
    await this.connect(other)

    if ((await this.rpc.getBlockCount()).result > 0) {
      await other.generateBlocks(1)

      while (true) {
        let [mhash, ohash] = await* [this.rpc.getBestBlockHash(), other.rpc.getBestBlockHash()]
        if (mhash.result === ohash.result) {
          break
        }

        await PUtils.delay(500)
      }
    }

    other.setOption('generate.txs.background', this._opts.generate.txs.background)
    other.setOption('generate.blocks.background', this._opts.generate.blocks.background)

    if (!Object(opts).connected) {
      await this.disconnect(other)
    }

    return other
  }

  /**
   * @param {Bitcoind}
   * @return {Promise}
   */
  async connect (other) {
    let node = `127.0.0.1:${other._processOpts.port}`
    await this.rpc.addNode(node, 'onetry')
  }

  /**
   * @param {Bitcoind}
   * @return {Promise}
   */
  async disconnect (other) {
    let node = `127.0.0.1:${other._processOpts.port}`
    await this.rpc.disconnectNode(node)
  }

  /**
   * @return {Promise}
   */
  @makeConcurrent({concurrency: 1})
  async terminate () {
    let onError
    let onExit

    if (this._process === null) {
      throw new Error('Child process already terminated')
    }

    try {
      await new Promise((resolve, reject) => {
        onError = reject
        onExit = async (code, signal) => {
          if (!(code === 0 && signal === null)) {
            return reject(
              new Error(`Exit with code = ${code} on signal = ${signal}`))
          }

          try {
            this._wallet.removeAllListeners()
            this._peer.removeAllListeners()
            this._process.removeAllListeners()
            this._process = null
            await rimraf(this._processOpts.datadir)
            resolve()
          } catch (err) {
            reject(err)
          }
        }

        this._process.on('error', onError)
        this._process.on('exit', onExit)

        this._process.kill('SIGTERM')
      })
    } finally {
      if (this._process !== null) {
        this._process.removeListener('error', onError)
        this._process.removeListener('exit', onExit)
      }
    }
  }
}
