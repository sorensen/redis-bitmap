
Redis Bitmap
============

[![Build Status](https://secure.travis-ci.org/sorensen/redis-bitmap.png)](http://travis-ci.org/sorensen/redis-bitmap)


Usage
-----

```js
var BitMap = require('redis-bitmap')
  , redis = require('redis')
  , db = redis.createClient(6379, '127.0.0.1', {detect_buffers: true})
  , bmap = new BitMap(db)
```


Buffering redis
---------------

**NOTE:** In order to use redis bitops correctly, the redis instance must either have the 
`detect_buffers` option set, or `return_buffers` set. If neither one is enabled, 
this lib will turn the `detect_buffers` option on, which may cause unexpected 
results. If you use the `aggregation` features, this lib will attempt to turn the 
`return_buffers` option on during an `exec` call, and then return the options to 
the previous state.


Example
-------

Population count:

```js
bmap.set('foo', 0, 1)
bmap.set('foo', 3, 1)
bmap.population('foo', function(err, count) {
  count === 2
})
```

Loading keys with this lib will return a `BitArray` instance to provide a little 
extra functionality when dealing with bits, the main purpose is to convert the 
buffered response redis returns into something usable.

```js
bmap.get('foo', function(err, bitarray) {
  var bits = bitarray.toJSON() // [1,0,0,1,0,0,0,0]
  var binary = bitarray.toString() // '00001001'
  var count = bitarray.cardinality() // 2
})
```

Methods
-------

### instance.setbit(key, offset, value, [callback])

Pass-through to the redis [SETBIT](http://redis.io/commands/bitop) command.

* `key` - redis key
* `offset` - bit offset
* `value` - bit value (1 / 0)
* `callback` - standard callback (optional)

**Alias**: [`set`]


### instance.get(key, [key2], […], callback)

* `key` - redis key(s)
* `callback` - standard callback, called with `BitArray` instances


### instance.bitop(op, destination, key, [key2], […], [callback])

Pass-through to the redis [BITOP](http://redis.io/commands/bitop) command, used by 
all bitop command shortcuts, (`xor`, `or`, `and`). If a callback is not supplied, 
an `Aggregate` instance is returned that can be used for chaining commands. See below.

* `operation` - redis bitwise operation (`xor`, `or`, `and`)
* `destination` - destination key for results
* `key` - redis key(s)
* `callback` - standard callback (optional)


### instance.tempBitop(op, cmd, key, [key2], […], [callback])

Perform a bitop command and store the results in a temporary key supplied to 
the `BitMap` constructor, default `"tmp"`, which will be retrieved afterwards 
and then deleted. A command is supplied to designate if a `GET` should be used 
to get the bits, or a `BITCOUNT` for population / cardinality.

* `operation` - redis bitwise operation (`xor`, `or`, `and`)
* `command` - redis command to use once operation complete (`get`, `bitcount`)
* `key` - redis key(s)
* `callback` - standard callback (optional)


### instance.xor(key, [key2], […], [callback])

* `key` - redis key(s)
* `callback` - standard callback (optional)

**Alias**: [`difference`]


### instance.or(key, [key2], […], [callback])

* `key` - redis key(s)
* `callback` - standard callback (optional)

**Alias**: [`union`]


### instance.and(key, [key2], […], [callback])

* `key` - redis key(s)
* `callback` - standard callback (optional)

**Alias**: [`intersect`]


### instance.bitcount(key, [key2], […], [callback])

* `key` - redis key(s)
* `callback` - standard callback (optional)

**Alias**: [`count`, `population`, `cardinality`]


### instance.aggregate([destination])

Create an `Aggregate` instance for chaining commands together, uses the `destination` 
key to store all `bitop` results.

* `destination` - destination key for results (optional, default `"tmp"`)


Aggregation
-----------

If you want to perform a series of commands or perform bit operations on the results
of previous commands, you can use the `aggregate` command to start a redis multi block.

```js
bmap
  .aggregate('tmp')           // Set the destination key
  .setbit('one', 0, 1)        // Set a bit
  .setbit('two', 1, 1)        // Set a bit
  .setbit('two', 2, 1)        // Set a bit
  .or('one', 'two')           // Perform a union of `one` and `two` into `tmp`
  .setbit('three', 1, 1)      // Set new bits
  .setbit('three', 2, 1)      // Set another
  .xor('three')               // Find the difference of the previous union with `three`
  .clean()                    // Remove `tmp` key after execution
  .exec(function(err, resp) { // Execute the current command queue  
    resp instance of BitArray // true
    resp.toJSON()             // [1,0,0,0,0,0,0,0]
    resp.cardinality()        // 1
    resp.toString             // '00000001'
  })
```


BitArray
--------

This library uses a custom `BitArray` library to wrap and convert all buffered responses returned 
by redis. It is meant to make working with the bit results easier and save you from doing the conversions. Most of the methods are not required for use with `BitMap` but are meant as a companion 
for doing the same type of operations in memory instead of through redis.

### BitArray.cast(32bit, [asOctet])

Convert a 32bit integer into a bit array

* `32bit` - 32 bit integer
* `asOctet` - ensure resulting array length is a multiple of 8


### BitArray.octet(array)

Zero fill an array until it represents an octet

* `array` - bit array


### BitArray.castFromBuffer(buffer)



### BitArray.buffermatrix(buffer1, [buffer2], [...])



### BitArray.and(array1, [array2], [...])

**Alias**: [`intersect`]


### BitArray.or(array1, [array2], [...])

**Alias**: [`union`]


### BitArray.xor(array1, [array2], [...])

**Alias**: [`difference`]


### BitArray.cardinality(32bit)



### BitArray.cardinalityFromBuffer(buffer)



### BitArray.cardinalityFromArray(array)



### instance.toString()



### instance.toJSON()



### instance.set(index, value)



### instance.cardinality()




Install
-------

With [npm](https://npmjs.org)

```
npm install redis-bitmap
```


License
-------

(The MIT License)

Copyright (c) 2013 Beau Sorensen <mail@beausorensen.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.