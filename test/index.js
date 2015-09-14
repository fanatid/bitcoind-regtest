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
  this.timeout(60000)

  let bitcoind
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
    await createWithOpts()

    await new Promise(async (resolve, reject) => {
      let hashes
      bitcoind.on('block', (hash) => {
        try {
          expect(hashes).to.include(hash)
          hashes = _.without(hashes, hash)
          if (hashes.length === 0) { resolve() }
        } catch (err) {
          reject(err)
        }
      })
      hashes = await bitcoind.generateBlocks(2)
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
    await new Promise(async (resolve, reject) => {
      let txids
      bitcoind.on('tx', async (txid) => {
        await PUtils.delay(250)
        try {
          expect(txids).to.include(txid)
          txids = _.without(txids, txid)
          if (txids.length === 0) { resolve() }
        } catch (err) {
          reject(err)
        }
      })
      txids = await bitcoind.generateTxs(2)
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
    await PUtils.delay(50)
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

    await PUtils.delay(1500)
    let height = (await bitcoind.rpc.getBlockCount()).result
    expect(height).to.equal(1)
  })
})
