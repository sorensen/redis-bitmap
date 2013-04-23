'use strict';

/*!
 * Module dependencies.
 */

var utils = require('./utils')
  , slice = Array.prototype.slice

/**
 * BitArray constructor
 *
 * @param {Buffer} buffer of 32bit integers
 */

function BitArray(buf) {
  this.buffer = buf
  this.bits = BitArray.castFromBuffer(buf)
}

/**
 * Cast a 32bit integer into a bitmap array, ensuring
 * that they are a full octet length if specified
 *
 * @param {Number} 32bit integer
 * @param {Boolean} ensure octet
 * @return {Array} bitmap array
 */

BitArray.cast = function(num, oct) {
  var bits = []
    , tmp = num
  while (tmp > 0) {
    bits.push(tmp % 2)
    tmp = Math.floor(tmp / 2)
  }
  oct && (bits = BitArray.octet(bits))
  return bits.reverse()
}

/**
 * Ensure the given array is in the form of an octet, or, has
 * a length with a multiple of 8, zero fill missing indexes
 *
 * @param {Array} target
 * @return {Array} zero filled octet array
 */

BitArray.octet = function(arr) {
  var len = arr.length
    , mod = len % 8
    , fill = len + (8 - mod)

  if (len !== 0 && mod === 0) {
    return arr
  }
  for (var i = len; i < fill; i++) {
    arr[i] = 0
  }
  return arr
}

/**
 * Convert a buffer of 32bit integers into a bit array
 *
 * @param {Buffer} buffered 32bit integers
 * @return {Array} converted bit array
 */

BitArray.castFromBuffer = function(buf) {
  var bits = []
  for (var i = 0; i < buf.length; i++) {
    bits = bits.concat(BitArray.octet(BitArray.cast(buf[i], true)))
  }
  return bits
}

/**
 * Utility method for converting any number of buffers
 * into a matrix of bit arrays
 *
 * @param {...} any number of buffered 32bit integers
 * @return {Array} bit array matrix
 */

BitArray.bufferMatrix = function() {
  var bits = []
    , args = slice.call(arguments)
  for (var i = 0; i < args.length; i++) {
    bits.push(BitArray.castFromBuffer(args[i]))
  }
  return bits
}

/**
 * Perform a bitwise intersection, `AND` of bit arrays
 *
 * @param {...} any number of bit arrays
 * @return {Array} intersected bit array
 */

BitArray.and =
BitArray.intersect = function() {
  var args = slice.call(arguments)
    , src = utils.longest.apply(null, arguments)
    , len = args.length
    , bits = [], aLen

  for (var i = 0; i < src.length; i++) {
    aLen = args.filter(function(x) {
      return x[i] === 1
    }).length
    bits.push(aLen === len ? 1 : 0)
  }
  return bits
}

/**
 * Perform a bitwise union, `OR` of bit arrays
 *
 * @param {...} any number of bit arrays
 * @return {Array} unioned bit array
 */

BitArray.or =
BitArray.union = function() {
  var args = slice.call(arguments)
    , src = utils.longest.apply(null, arguments)
    , bits = [], aLen

  for (var i = 0; i < src.length; i++) {
    aLen = args.filter(function(x) {
      return x[i] === 1
    }).length
    bits.push(aLen ? 1 : 0)
  }
  return bits
}

/**
 * Perform a bitwise difference, `XOR` of two bit arrays
 *
 * @param {Array} bit array
 * @param {Array} bit array
 * @return {Array} difference array
 */

BitArray.xor =
BitArray.difference = function(a, b) {
  var len = utils.longest(a, b).length
    , bits = []
  for (var i = 0; i < len; i++) {
    bits.push(a[i] && !b[i] || b[i] && !a[i] ? 1 : 0)
  }
  return bits
}

/**
 * Get the cardinality of a 32bit integer
 *
 * @param {Number} 32bit integer
 * @return {Number} cardinality
 */

BitArray.cardinality = function(x) {
  x -= ((x >> 1) & 0x55555555)
  x = (((x >> 2) & 0x33333333) + (x & 0x33333333))
  x = (((x >> 4) + x) & 0x0f0f0f0f)
  x += (x >> 8)
  x += (x >> 16)
  return(x & 0x0000003f)
}

/**
 * Find cardinality from bitwise buffer, buffering
 * 4 octects at a time for performance increase.
 *
 * @param {Buffer} buffered 32bit integers
 * @return {Number} cardinality
 */

BitArray.cardinalityFromBuffer = function(buf) {
  var val = 0
    , tmp = 0
  for (var i = 0; i < buf.length ; i+=4) {
    tmp = buf[i];
    tmp += buf[i + 1] << 8
    tmp += buf[i + 2] << 16
    tmp += buf[i + 3] << 24
    val += BitArray.cardinality(tmp)
  }
  return val
}

/**
 * Find the cardinality of a bit array
 *
 * @param {Array} bitmap array
 * @return {Number} cardinality
 */

BitArray.cardinalityFromArray = function(arr) {
  var val = 0
  for (var i = 0; i < arr.length; i++) {
    if (arr[i]) val += 1
  }
  return val
}

/**
 * Get the binary value of the current bits
 *
 * @return {String} binary conversion
 */

BitArray.prototype.toString = function() {
  return this.bits.slice().reverse().join('')
}

/**
 * Get the bitmap array of the current bits
 *
 * @return {Array} bit array
 */

BitArray.prototype.toJSON = function() {
  return this.bits
}

/**
 * Set the bit for a given offset
 *
 * @param {Number} offset index
 * @param {Number} bit value
 */

BitArray.prototype.set = function(idx, val) {
  while (idx > this.bits.length) {
    this.bits.push(0)
  }
  return this.bits[idx] = val ? 1 : 0
}

/**
 * Find the cardinality of the current bit array
 *
 * @return {Number} cardinality
 */

BitArray.prototype.cardinality = function() {
  return BitArray.cardinalityFromBuffer(this.buffer)
}

/*!
 * Module exports.
 */

module.exports = BitArray
