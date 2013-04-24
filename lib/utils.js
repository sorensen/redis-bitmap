'use strict';

/*!
 * Module dependencies.
 */

var slice = Array.prototype.slice

/**
 * Find the longest array or string in argument list
 *
 * @param {...} arrays or strings to check
 * @return {Array} longest array
 */

exports.longest = function() {
  var args = slice.call(arguments)
    , len = 0, resp, arg
  for (var i = 0; i < args.length; i++) {
    arg = args[i]
    if (arg.length >= len) {
      len = arg.length
      resp = arg
    }
  }
  return resp
}

/**
 * Check the last argument of a single args array
 * to see if its a function, if so, remove it from the
 * list and return it
 *
 * @param {Array} argument list
 * @return {Function|Null} result
 */

exports.getCallback = function(args) {
  if (typeof args[args.length - 1] === 'function') {
    return args.pop()
  }
  return null
}