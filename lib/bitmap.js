'use strict';

/*!
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter
  , redis = require('redis')
  , utils = require('./utils')
  , BitArray = require('./bitarray')
  , slice = Array.prototype.slice
  , concat = Array.prototype.concat
  , toString = Object.prototype.toString

/**
 * Bitmap constructor
 *
 * @param {Object} redis db client
 * @inherits EventEmitter
 * @event `ready`: Emitted when lua and redis client ready
 */

function Bitmap(client, options) {
  var self = this, len = 1
  options || (options = {})
  this.client = client
  // Ready callback
  function ready() {
    if (--len) return
    self.ready = true
    self.emit('ready')
  }
  // Ensure redis is returning buffered responses
  if (!client.options.detect_buffers) {
    console.warn('Warning: setting redis instance to use `detect_buffers`')
    console.trace()
    client.options.detect_buffers = true
  }
  // Wait for redis client ready event
  if (this.client.ready) ready()
  else this.client.on('ready', ready) 
}

/*!
 * Inherit from EventEmitter.
 */

Bitmap.prototype.__proto__ = EventEmitter.prototype

/**
 * Convert keys into buffers for ensuring a buffered response
 * from redis, utility method to help with array mapping
 *
 * @param {String} key
 * @return {Buffer} key
 * @api private
 */

Bitmap._keybuf = function(key) {
  return new Buffer(key)
}

/*!
 * Set a reference to `BitArray` for exports.
 */

Bitmap.BitArray = BitArray

/**
 *
 * @param {String} redis key
 * @param {Number} offset
 * @param {Number} value (1/0)
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.set = function(key, offset, val, next) {
  var args = [key, offset, val ? 1 : 0]
  if (next) {
    args.push(next)
  }
  this.client.SETBIT.apply(this.client, args)
  return this
}

/**
 * Get a buffered results for any number of keys, mapping the results
 * to `BitArray` objects to support a variety of data manipulation
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.get = function() {
  var args = slice.call(arguments)
    , next = utils.getCallback(args)
    , args = args.map(Bitmap._keybuf)
    , cmd = args.length > 1 ? 'MGET' : 'GET'

  function callback(err, resp) {
    if (err) {
      return next(err)
    } else if (Array.isArray(resp)) {
      resp = resp.map(function(x) { return new BitArray(x) })
    } else {
      resp = new BitArray(resp)
    }
    return next(err, resp)
  }
  if (next) {
    args.push(callback)
  }
  // this.client[cmd](args, callback)
  this.client[cmd].apply(this.client, args)
  return this
}

/**
 * Get the cardinality / population of any number of keys, the 
 * response buffers will all be unioned together and counted in memory
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.memoryCardinality = function() {
  var args = slice.call(arguments)
    , next = utils.getCallback(args)
    , args = args.map(Bitmap._keybuf)
    , count = 0

  function callback(err, resp) {
    if (!Array.isArray(resp)) {
      resp = [resp]
    }
    var resp = resp.map(BitArray.castFromBuffer)
      , union = BitArray.union.apply(null, resp)
      , count = BitArray.cardinalityFromArray(union)
    return next(err, count)
  }
  args.push(callback)
  // this.client.GET(args)
  return this
}

/**
 * Perform a redis bit operation, storing the results into a
 * destination key, can use any number of keys
 *
 * @param {String} redis bit operation (`or` / `xor` / `and`)
 * @param {String} destination redis key
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.bitop = function(op, dest) {
  var self = this
    , args = slice.call(arguments, 2)
    , next = utils.getCallback(args)
    , args = args.map(Bitmap._keybuf)

  if (!next && !this._isAggr) {
    var aggr = this.aggregate(dest)
    return aggr.bitop.apply(aggr, arguments)
  }
  function callback(err, resp) {
    if (err) return next(err)
    return next(null, resp)
  }
  if (next) {
    args.push(callback)
  }
  // Check for multi command aggregation
  if (this._isAggr && this._isRunning && this.dest) {
    args.push(this.dest)
  }
  // this.client.BITOP([op, dest].concat(args), callback)
  this.client.BITOP.apply(this.client, [op, dest].concat(args))
  return this
}

/**
 * Perform a redis bit operation into a temporary key `tmp`, 
 * then retrieve the results and delete the temporary key
 *
 * @param {String} redis bit operation (`or` / `xor` / `and`)
 * @param {String} redis destination command (`get` / `bitcount`)
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.tempBitop = function(op, cmd) {
  var self = this
    , args = slice.call(arguments, 2)
    , next = utils.getCallback(args)
    , args = args.map(Bitmap._keybuf)
    , dest = 'tmp'
    , isGet = cmd.toUpperCase() === 'GET'

  if (!next) {
    var aggr = this.aggregate(dest)
    return aggr.tempBitop.apply(aggr, [op].concat(args))
  }
  function callback(err, resp) {
    isGet && (dest = Bitmap._keybuf(dest))
    self.client[cmd](dest, function(err, resp) {
      isGet && (resp = new BitArray(resp))
      self.client.DEL(dest, function() {
        return next(err, resp)
      })
    })
  }
  args.push(callback)
  return this.bitop.apply(this, [op, dest].concat(args))
}

/**
 * Perform a bitwise difference or `XOR` on any number of keys
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.xor = 
Bitmap.prototype.difference = function() {
  var args = ['XOR', 'GET'].concat(slice.call(arguments))
  return this.tempBitop.apply(this, args)
}

/**
 * Perform a bitwise union or `OR` on any number of keys
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.or = 
Bitmap.prototype.union = function() {
  var args = ['OR', 'GET'].concat(slice.call(arguments))
  return this.tempBitop.apply(this, args)
}

/**
 * Perform a bitwise intersection or `AND` on any number of keys
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.and = 
Bitmap.prototype.intersect = function() {
  var args = ['AND', 'GET'].concat(slice.call(arguments))
  return this.tempBitop.apply(this, args)
}

/**
 * Perform a bitwise count / cardinality on any number of keys
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.count = 
Bitmap.prototype.population = 
Bitmap.prototype.cardinality = 
Bitmap.prototype.bitcount = function() {
  var args = slice.call(arguments)
  if (args.length < 3 && !this._isAggr) {
    this.client.BITCOUNT.apply(this.client, arguments)
    return this
  }
  this._isAggr && (this.lastCmd = 'BITCOUNT')
  return this.tempBitop.apply(this, ['OR', 'BITCOUNT'].concat(args))
}

/**
 * Create a new `Aggregate` instance to perform multiple bitwise
 * operations on a temporary key, `dest`.
 *
 * @param {String} temporary key destination (optional)
 * @api public
 */

Bitmap.prototype.aggregate = function(dest) {
  return new Aggregate(this.client, dest)
}

/**
 * Aggregate constructor
 *
 * @param {Object} redis client instance
 * @param {String} temporary key destination (optional)
 */

function Aggregate(client, dest) {
  this.mainClient = client
  this.client = client.multi()
  this._isAggr = true
  this.dest = dest
}

/*!
 * Inherit from Bitmap
 */

Aggregate.prototype.__proto__ = Bitmap.prototype

/**
 * Temporary bitop, override to remove the use of callbacks
 *
 * @param {String} redis bit operation (`or` / `xor` / `and`)
 * @param {String} redis destination command (`get` / `bitcount`)
 * @param {...} Any number of string keys
 * @api public
 */

Aggregate.prototype.tempBitop = function(op, cmd) {
  var self = this
    , args = slice.call(arguments, 1)
    , args = args.map(Bitmap._keybuf)
    , dest = this.dest || 'tmp'

  this.lastCmd = cmd
  return this.bitop.apply(this, [op, dest].concat(args))
}

/**
 * Set the `cleanup` flag to issue a temporary key deletion upon `exec`
 *
 * @api public
 */

Aggregate.prototype.clean = function() {
  if (this.dest) {
    this.cleanup = true
  }
  return this
}

/**
 * Execute the current multi block, perform an options shim on the 
 * redis client in case the buffer settings are not compatible. If 
 * a `clean` command was ran and there is a temporary `dest` setup,
 * remove the key after retrieving its contents.  A `BitArray` instance
 * will be sent for the last response of the multi block unless a 
 * `count` was performed. If there is no `dest` or custom `cmd` to run,
 * use the supplied callback as a normal callback for `exec`.
 *
 * @param {Function} callback
 * @api public
 */

Aggregate.prototype.exec = function(next) {
  var self = this
    , callback = next
    , cmd = this.lastCmd
    , dest = this.dest
    , clean = this.cleanup
    , isGet = cmd.toUpperCase() === 'GET'
    , opt = utils.clone(this.mainClient.options)

  // Perform an options shim for the master redis instance
  // the multi was taken from, in the case that the instance
  // only had `detect_buffers` set, multi will not honor it
  this.mainClient.options.detect_buffers = false
  this.mainClient.options.return_buffers = true

  // Check if we have a temporary key and a last command to perform
  if (dest && cmd) {
    this.client[cmd](dest)
    clean && this.client.del(dest)
    callback = function(err, resp) {
      // Return the master redis instance options back to normal
      self.mainClient.options = opt
      if (err) return next(err)
      if (resp) resp = resp[resp.length - (clean ? 2 : 1)]
      if (isGet && resp) resp = new BitArray(resp)
      return next(err, resp)
    }
  }
  // console.log('EXECING: ', dest, cmd, this.client.queue)
  this.client.exec(callback)
  return this
}

/*!
 * Shim each of the following methods for the multi proto
 * so that the last command is saved and aggregation is set
 * after the first command is called, needed for chaining.
 */

;['xor', 'difference', 'or', 'union'
, 'and', 'intersect', 'bitop'
].forEach(function(method) {
  Aggregate.prototype[method] = function() {
    var ctx = Bitmap.prototype[method].apply(this, arguments)
    this._isRunning = true
    if (method !== 'bitop') this.lastCmd = 'GET'
    return ctx
  }
})

/*!
 * Module exports.
 */

module.exports = Bitmap
