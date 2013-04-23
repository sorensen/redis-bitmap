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

function getNext(args) {
  if (typeof args[args.length - 1] === 'function') {
    return args.pop()
  }
  return null
}

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
  client.options.detect_buffers = true

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
 */

Bitmap.keybuf = function(key) {
  return new Buffer(key)
}

/**
 *
 * @param {String} redis key
 * @param {Number} offset
 * @param {Number} value (1/0)
 * @param {Function} callback
 */

Bitmap.prototype.set = function(key, offset, val, next) {
  this.client.SETBIT(key, offset, val ? 1 : 0, function(err, resp) {
    return next(err, resp)
  })
  return this
}

/**
 * Get a buffered results for any number of keys, mapping the results
 * to `BitArray` objects to support a variety of data manipulation
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 */

Bitmap.prototype.get = function() {
  var args = slice.call(arguments)
    , next = getNext(args)
    , args = args.map(Bitmap.keybuf)

  function callback(err, resp) {
    if (Array.isArray(resp)) {
      resp = resp.map(function(x) { return new BitArray(x) })
    } else {
      resp = new BitArray(resp)
    }
    return next(err, resp)
  }
  args.push(callback)
  this.client.GET.apply(this.client, args)
  return this
}

/**
 * Get the cardinality / population of any number of keys, the 
 * response buffers will all be unioned together and counted in memory
 *
 * @param {...} Any number of string keys
 * @param {Function} callback
 */

Bitmap.prototype.memoryCardinality = function() {
  var args = slice.call(arguments)
    , next = getNext(args)
    , args = args.map(Bitmap.keybuf)
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
  this.client.GET.apply(this.client, args)
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
 */

Bitmap.prototype.bitop = function(op, dest) {
  var self = this
    , args = slice.call(arguments, 2)
    , next = getNext(args)
    , args = args.map(Bitmap.keybuf)

  function callback(err, resp) {
    if (err) return next(err)
    return next(null, resp)
  }
  args.push(callback)
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
 */

Bitmap.prototype.tempBitop = function(op, cmd) {
  var self = this
    , args = slice.call(arguments, 2)
    , next = getNext(args)
    , args = args.map(Bitmap.keybuf)
    , dest = 'tmp'
    , isGet = cmd.toUpperCase() === 'GET'

  function callback(err, resp) {
    isGet && (dest = Bitmap.keybuf(dest))
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
 */

Bitmap.prototype.count = 
Bitmap.prototype.population = 
Bitmap.prototype.cardinality = 
Bitmap.prototype.bitcount = function() {
  var args = slice.call(arguments)
  if (args.length < 3) {
    this.client.BITCOUNT.apply(this.client, arguments)
    return this
  }
  return this.tempBitop.apply(this, ['OR', 'BITCOUNT'].concat(args))
}

/*!
 * Module exports.
 */

module.exports = Bitmap
