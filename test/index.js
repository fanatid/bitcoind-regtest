import _ from 'lodash'
import { expect } from 'chai'
import RpcClient from 'bitcoind-rpc-client'
import PUtils from 'promise-useful-utils'

import Bitcoind from '../src'

describe('Bitcoind', function () {
  this.timeout(60000)

  let bitcoind
  let createWithOpts = (opts) => {
    return PUtils.try(() => {
      bitcoind = new Bitcoind(opts)
      // bitcoind.on('data', (data) => { console.log(data.toString()) })
      bitcoind.on('error', (err) => { console.log(`Bitcoind error: ${err.stack}`) })
      return bitcoind.ready
    })
  }

  afterEach(() => {
    return PUtils.try(() => {
      bitcoind.removeAllListeners()
      return bitcoind.terminate()
    })
  })

  it('start and stop', () => {
    return PUtils.try(async () => {
      await createWithOpts()
    })
  })

  it('get info through rpc', () => {
    return PUtils.try(async () => {
      await createWithOpts()
      expect(bitcoind.getRpcClient()).to.be.instanceof(RpcClient)
      expect(bitcoind.rpc).to.be.instanceof(RpcClient)
      let info = (await bitcoind.rpc.getInfo()).result
      expect(info).to.have.property('testnet', false)
    })
  })

  it('generateBlocks and wait event block', () => {
    return PUtils.try(async () => {
      await createWithOpts()
      await new Promise(async (resolve, reject) => {
        let hashes
        bitcoind.on('block', (hash) => {
          try {
            expect(hashes).to.deep.equal([hash])
            resolve()
          } catch (err) {
            reject(err)
          }
        })
        hashes = await bitcoind.generateBlocks(1)
      })
    })
  })

  it('generateTx and wait event tx', () => {
    return PUtils.try(async () => {
      await createWithOpts({wallet: {preloadsPoolSize: _.constant(0)}})
      await bitcoind.generateBlocks(102)
      await new Promise(async (resolve, reject) => {
        let txids
        bitcoind.on('tx', (txid) => {
          try {
            expect(txids).to.deep.equal([txid])
            resolve()
          } catch (err) {
            reject(err)
          }
        })
        txids = await bitcoind.generateTxs(1)
      })
    })
  })

  it('getPreload', () => {
    return PUtils.try(async () => {
      await createWithOpts()
      await bitcoind.generateBlocks(101)

      let preload = await bitcoind.getPreload()
      let {result} = await bitcoind.rpc.getTxOut(preload.txId, preload.outIndex)
      expect(result).to.have.property('value', 10)
      expect(_.get(result, 'scriptPubKey.addresses')).to.deep.equal([preload.privKey.toAddress().toString()])
    })
  })
})
