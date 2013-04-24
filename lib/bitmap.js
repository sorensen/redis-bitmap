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
  // Ensure redis is returning buffered responses
  if (!client.options.return_buffers) {
    throw new Error('Redis instance must have `return_buffers` set.')
  }
  var self = this, len = 1
  options || (options = {})
  this.dest = options.destination || 'bitmap:tmp'
  this.client = client
  // Ready callback
  function ready() {
    if (--len) return
    self.ready = true
    self.emit('ready')
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

Bitmap.prototype.save =
Bitmap.prototype.set =
Bitmap.prototype.setbit = function(key, offset, val, next) {
  var args = [key, offset, val ? 1 : 0]
  next && args.push(next)
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

Bitmap.prototype.load =
Bitmap.prototype.mget =
Bitmap.prototype.get = function() {
  var args = slice.call(arguments)
    , next = utils.getCallback(args)
    , args = args.map(Bitmap._keybuf)
    , cmd = args.length > 1 ? 'MGET' : 'GET'

  function callback(err, resp) {
    if (err) return next(err)
    return next(null, Array.isArray(resp)
      ? resp.map(BitArray.factory)
      : new BitArray(resp)
    )
  }
  next && args.push(callback)
  this.client[cmd].apply(this.client, args)
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
  next && args.push(callback)
  // Check for multi command aggregation
  if (this._isAggr && this._isRunning && this.dest) {
    args.push(this.dest)
  }
  // this.client.BITOP([op, dest].concat(args), callback)
  this.client.BITOP.apply(this.client, [op, dest].concat(args))
  return this
}

/**
 * Perform a redis bit operation into a temporary key, then
 * retrieve the results and delete the temporary key
 *
 * @param {String} redis destination command (`get` / `bitcount`)
 * @param {String} redis bit operation (`or` / `xor` / `and`)
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.tmpBitop = function(cmd, op) {
  var self = this
    , args = slice.call(arguments, 2)
    , next = utils.getCallback(args)
    , args = args.map(Bitmap._keybuf)
    , dest = this.dest
    , multi

  if (!next) {
    return this.bitop.apply(this, [op, dest].concat(args))
  }
  multi = this.client.multi()
  multi
    .bitop.apply(multi, [op, dest].concat(args))
    [cmd](dest)
    .del(dest)
    .exec(function(err, resp) {
      if (err) return next(err)
      resp = resp[resp.length - 2]
      resp = cmd.toUpperCase() === 'GET'
        ? new BitArray(resp)
        : +resp.toString()
      return next(null, resp)
    })
  return this
}

/**
 * Perform a temporary bit operation and `GET` the results
 *
 * @param {String} redis bit operation (`or` / `xor` / `and`)
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.getBitop = function(op) {
  return this.tmpBitop.apply(this, ['GET'].concat(slice.call(arguments)))
}

/**
 * Perform a temporary bit operation and `BITCOUNT` the results
 *
 * @param {String} redis bit operation (`or` / `xor` / `and`)
 * @param {...} Any number of string keys
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.countBitop = function(op) {
  return this.tmpBitop.apply(this, ['BITCOUNT'].concat(slice.call(arguments)))
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
  return this.getBitop.apply(this, ['XOR'].concat(slice.call(arguments)))
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
  return this.getBitop.apply(this, ['OR'].concat(slice.call(arguments)))
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
  return this.getBitop.apply(this, ['AND'].concat(slice.call(arguments)))
}

/**
 * Perform a bitwise intersection or `NOT` on a single key
 *
 * @param {String} redis key
 * @param {Function} callback
 * @api public
 */

Bitmap.prototype.not = 
Bitmap.prototype.reverse = function() {
  return this.getBitop.apply(this, ['NOT'].concat(slice.call(arguments)))
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
  return this.countBitop.apply(this, ['OR'].concat(args))
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
  this.dest = dest || 'bitmap:tmp'
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
    , dest = this.dest

  this.lastCmd = cmd
  return this.bitop.apply(this, [op, dest].concat(args))
}

/**
 * Set the `cleanup` flag to issue a temporary key deletion upon `exec`
 *
 * @param {Boolean} toggle state
 * @api public
 */

Aggregate.prototype.clean = function(toggle) {
  this.cleanup = typeof toggle === 'undefined' ? true : toggle
  return this
}

/**
 * Execute the current multi block. If a `clean` command was ran and there is 
 * a temporary `dest` setup, remove the key after retrieving its contents.  A 
 * `BitArray` instance will be sent for the last response of the multi block 
 * unless a `count` was performed. If there is no `dest` or custom `cmd` to run,
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

  // Check if we have a temporary key and a last command to perform
  if (dest && cmd) {
    this.client[cmd](dest)
    clean && this.client.del(dest)
    callback = function(err, resp) {
      if (err) return next(err)
      if (resp) resp = resp[resp.length - (clean ? 2 : 1)]
      if (isGet && resp) resp = new BitArray(resp)
      return next(err, resp)
    }
  }
  this.client.exec(callback)
  return this
}

/*!
 * Shim each of the following methods for the multi proto
 * so that the last command is saved and aggregation is set
 * after the first command is called, needed for chaining.
 */

;['xor', 'difference', 'or', 'union', 'and', 'intersect', 'bitop'
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
