## API

  * [Events](#events)
  * [Properties](#properties)
  * [Methods](#methods)

### Events

  * [error](#error)
  * [data](#data)
  * [exit](#exit)
  * [block](#block)
  * [tx](#tx)

#### error

  * `Error` error

#### data

  * `Buffer` data

#### exit

  * `number` code
  * `string` signal

#### block

  * `string` hash

#### tx

  * `string` txId

### Properties

  * [rpc](#rpc)

#### rpc

**return**: `RpcClient`

### Methods

  * [constructor](#constructor)
  * [getOption](#getoption)
  * [setOption](#setoption)
  * [getRpcClient](#getrpcclient)
  * [generateBlocks](#generateblocks)
  * [generateTxs](#generatetxs)
  * [getPreload](#getpreload)
  * [fork](#fork)
  * [connect](#connect)
  * [disconnect](#disconnect)
  * [terminate](#terminate)

#### constructor

  * `Object` opts [Please see active opts list in sources...]

#### getOption

  * `string` name

**return**: `*`

#### setOption

  * `string` name
  * `*` value

#### getRpcClient

**return**: `RpcClient`

#### generateBlocks

  * `number` count

**return**: `Promise.<Array.<string>>`

#### generateTxs

  * `number` count

**return**: `Promise.<Array.<string>>`

#### getPreload

**return**: `Promise.<Object>`

#### fork

  * `Object` [opts]
    * `boolean` [opts.connected=true]

**return**: `Promise.<Bitcoind>`

#### connect

  * `Bitcoind` other

**return**: `Promise`

#### disconnect

  * `Bitcoind` other

**return**: `Promise`

#### terminate

**return**: `Promise`
