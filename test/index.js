import _ from 'lodash'
import chai from 'chai'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import RpcClient from 'bitcoind-rpc-client'
import PUtils from 'promise-useful-utils'

import Bitcoind from '../src'

let expect = chai.expect
chai.use(sinonChai)

describe('Bitcoind', function () {
  this.timeout(30000)

  let bitcoind
  let fork

  let createWithOpts = async (opts) => {
    bitcoind = new Bitcoind(opts)
    // bitcoind.on('data', (data) => { console.log(data.toString()) })
    bitcoind.on('error', (err) => {
      console.log(`Bitcoind error: ${err.stack}`)
    })
    return bitcoind.ready
  }

  afterEach(async () => {
    bitcoind.removeAllListeners()
    return bitcoind.terminate()
  })

  it('start and stop', async () => {
    await createWithOpts()
  })

  it('get info through rpc', async () => {
    await createWithOpts()
    expect(bitcoind.getRpcClient()).to.be.instanceof(RpcClient)
    expect(bitcoind.rpc).to.be.instanceof(RpcClient)
    let info = (await bitcoind.rpc.getInfo()).result
    expect(info).to.have.property('testnet', false)
  })

  it('generateBlocks and wait event block', async () => {
    await createWithOpts({
      generate: {blocks: {background: _.constant(false)}}
    })

    await new Promise((resolve, reject) => {
      let hashes
      let promise

      bitcoind.on('block', async (hash) => {
        await promise
        try {
          expect(hashes).to.include(hash)
          hashes = _.without(hashes, hash)
          if (hashes.length === 0) { resolve() }
        } catch (err) {
          reject(err)
        }
      })

      promise = bitcoind.generateBlocks(2).then((result) => { hashes = result })
    })

    let height = (await bitcoind.rpc.getBlockCount()).result
    expect(height).to.equal(2)
  })

  it('generateTx and wait event tx', async () => {
    await createWithOpts({
      generate: {txs: {timeout: _.constant(1e9), minInBlock: _.constant(0)}},
      wallet: {preloadsPoolSize: _.constant(0)}
    })

    await bitcoind.generateBlocks(102)
    await new Promise((resolve, reject) => {
      let promise
      let txids

      bitcoind.on('tx', async (txid) => {
        await promise
        try {
          expect(txids).to.include(txid)
          txids = _.without(txids, txid)
          if (txids.length === 0) { resolve() }
        } catch (err) {
          reject(err)
        }
      })

      promise = bitcoind.generateTxs(2).then((result) => { txids = result })
    })
  })

  it('getPreload', async () => {
    await createWithOpts()
    await bitcoind.generateBlocks(101)

    let preload = await bitcoind.getPreload()
    let {result} = await bitcoind.rpc.getTxOut(preload.txId, preload.outIndex)
    expect(result).to.have.property('value', 10)
    expect(_.get(result, 'scriptPubKey.addresses')).to.deep.equal([preload.privKey.toAddress().toString()])
  })

  it('option generate.txs.timeout', async () => {
    let state = 0
    await createWithOpts({
      generate: {txs: {
        timeout: () => {
          switch (state) {
            case 0:
              return 50
            case 1:
              state = 2
              return 0
            case 2:
              return 1e9
          }
        },
        minInBlock: _.constant(0)
      }},
      wallet: {preloadsPoolSize: _.constant(0)}
    })

    let spy = sinon.spy()
    bitcoind.on('tx', spy)

    await bitcoind.generateBlocks(101)
    state = 1
    await PUtils.delay(500)

    expect(spy).to.have.been.callOnce
  })

  it('option generate.txs.minInBlock', async () => {
    await createWithOpts({
      wallet: {preloadsPoolSize: _.constant(0)},
      generate: {txs: {minInBlock: _.constant(2)}}
    })

    let spy = sinon.spy()
    bitcoind.on('tx', spy)

    await bitcoind.generateBlocks(102)
    await PUtils.delay(500)
    expect(spy).to.have.been.callCount(2)
  })

  it('option generate.blocks.timeout', async () => {
    let called = false
    await createWithOpts({generate: {blocks: {timeout: () => {
      if (called) {
        return 1e9
      }

      called = true
      return 1000
    }}}})

    await PUtils.delay(2500)
    let height = (await bitcoind.rpc.getBlockCount()).result
    expect(height).to.equal(1)
  })

  it('fork', async () => {
    await createWithOpts()

    await bitcoind.generateBlocks(105)

    try {
      fork = await bitcoind.fork()

      let hashes = _.pluck(
        await* [bitcoind.rpc.getBestBlockHash(), fork.rpc.getBestBlockHash()], 'result')
      expect(hashes[0]).to.equal(hashes[1])
    } finally {
      if (fork) {
        await fork.terminate()
      }
    }
  })

  it('simple reorg', async () => {
    await createWithOpts({
      generate: {blocks: {background: _.constant(false)}}
    })

    await bitcoind.generateBlocks(105)
    try {
      fork = await bitcoind.fork({connected: false})

      await* [bitcoind.generateBlocks(2), fork.generateBlocks(3)]
      await bitcoind.connect(fork)
      await PUtils.delay(3000)

      let hashes = _.pluck(
        await* [bitcoind.rpc.getBestBlockHash(), fork.rpc.getBestBlockHash()], 'result')
      expect(hashes[0]).to.equal(hashes[1])
    } finally {
      if (fork) {
        await fork.terminate()
      }
    }
  })
})
