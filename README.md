# bitcoind-regtest

[![NPM Package](https://img.shields.io/npm/v/bitcoind-regtest.svg?style=flat-square)](https://www.npmjs.org/package/bitcoind-regtest)
[![build status](https://img.shields.io/travis/fanatid/bitcoind-regtest.svg?branch=master&style=flat-square)](http://travis-ci.org/fanatid/bitcoind-regtest)
[![Coverage Status](https://img.shields.io/coveralls/fanatid/bitcoind-regtest.svg?style=flat-square)](https://coveralls.io/r/fanatid/bitcoind-regtest)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)
[![Dependency status](https://img.shields.io/david/fanatid/bitcoind-regtest.svg?style=flat-square)](https://david-dm.org/fanatid/bitcoind-regtest#info=dependencies)

## Example

```js
import RegtestBitcoind from 'bitcoind-regtest'

setImmediate(async () => {
  let bitcoind = new RegtestBitcoind()
  await bitcoind.ready
  await bitcoind.generateBlocks(105)
  let preload = await bitcoind.getPreload()
  console.log(preload)
  // {
  //   txId: '757f53cee55b38e564b37b7a06bc8f0758338621015b7ff02001317af0fa3b14',
  //   outIndex: 0,
  //   value: 1000000000,
  //   script: <Script: OP_DUP OP_HASH160 20 0x5d1ecf7e16de5ff76368d709cde74bb52dc7f3c4 OP_EQUALVERIFY OP_CHECKSIG>,
  //   privKey: <PrivateKey: 294d6127bdc8b6cac4137f13cae854030ef544e595e41b8519d8f6d4966d3764, network: regtest>
  // }

  await bitcoind.terminate()
})
```

## API

[here](https://github.com/fanatid/bitcoind-regtest/blob/master/API.md)

## License

This software is licensed under the MIT License.
