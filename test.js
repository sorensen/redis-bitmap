'use strict';

var assert = require('assert')
  , ase = assert.strictEqual
  , ade = assert.deepEqual
  , Bitmap = require('./index')
  , redis = require('redis')
  , now = new Date()

describe('Redis BitMap', function() {

  function clean(db, pattern, done) {
    db.keys(pattern, function(err, resp) {
      if (!resp || resp.length) {
        return done()
      }
      var args = resp.map(function(x) {
        return x.toString()
      })
      function callback(err, resp) {
        ase(err, null)
        done()
      }
      if (!args.length) {
        return done(null)
      }
      args.push(callback)
      db.del.apply(db, args)
    })
  }

  before(function(done) {
    clean(redis.createClient(), 'bitmap:*', done)
  })

  describe('BitMap', function() {
    var db = redis.createClient(6379, '127.0.0.1', {return_buffers: true})
      , bm = new Bitmap(db)

    it('should set some bits', function(done) {
      var key = 'bitmap:simple'
        , len = 5
      
      function callback(err, resp) {
        ase(err, null)
        --len || done()
      }
      bm.set(key, 0, 1, callback)
      bm.set(key, 0, 1, callback)
      bm.set(key, 3, 1, callback)
      bm.set(key, 5, 1, callback)
      bm.set(key, 6, 1, callback)
      bm.set(key, 7, 1, callback)
      bm.set(key, 8, 1, callback)
      bm.set(key, 20, 1, callback)
    })

    it('should have the correct bits', function(done) {
      bm.get('bitmap:simple', function(err, resp) {
        var bits = resp.toJSON()
        ase(err, null)
        ase(bits[0], 1)
        ase(bits[3], 1)
        ase(bits[5], 1)
        ase(bits[6], 1)
        ase(bits[7], 1)
        ase(bits[8], 1)
        ase(bits[20], 1)
        done()
      })
    })

    it('should get cardinality', function(done) {
      bm.count('bitmap:simple', function(err, count) {
        ase(err, null)
        ase(count, 7)
        done()
      })
    })

    it('should set some bits', function(done) {
      var key = 'bitmap:multi'
        , len = 5
      
      function callback(err, resp) {
        ase(err, null)
        --len || done()
      }
      bm.set(key, 0, 1, callback)
      bm.set(key, 10, 1, callback)
      bm.set(key, 3, 1, callback)
      bm.set(key, 50, 1, callback)
      bm.set(key, 22, 1, callback)
    })

    it('should have the correct bits', function(done) {
      bm.get('bitmap:multi', function(err, resp) {
        var bits = resp.toJSON()
        
        ase(err, null)
        ase(bits[0], 1)
        ase(bits[3], 1)
        ase(bits[10], 1)
        ase(bits[22], 1)
        ase(bits[50], 1)
        done()
      })
    })

    it('should get multiple bitsets', function(done) {
      bm.get('bitmap:simple', 'bitmap:multi', function(err, resp) {
        ase(err, null)
        ase(resp.length, 2)
        done()
      })
    })

    it('should get multi key cardinality', function(done) {
      bm.bitcount('bitmap:simple', 'bitmap:multi', function(err, count) {
        ase(err, null)
        ase(count, 10)
        done()
      })
    })

    it('should perform all bitops and get results', function(done) {
      var len = 7
        , foo = 'bitmap:foo'
        , bar = 'bitmap:bar'

      function callback(err) {
        ase(err, null)
        --len || done()
      }
      bm.setbit(foo, 0, 1)
      bm.setbit(foo, 2, 1)
      bm.setbit(foo, 4, 1)

      bm.setbit(bar, 1, 1)
      bm.setbit(bar, 2, 1)
      bm.setbit(bar, 7, 1)

      bm.get(foo, function(err, resp) {
        ase(err, null)
        ade(resp.toJSON(), [ 1, 0, 1, 0, 1, 0, 0, 0 ])
        callback(err)
      })
      bm.get(bar, function(err, resp) {
        ase(err, null)
        ade(resp.toJSON(), [ 0, 1, 1, 0, 0, 0, 0, 1 ])
        callback(err)
      })
      bm.getBitop('xor', foo, bar, function(err, resp) {
        ase(err, null)
        ade(resp.toJSON(), [ 1, 1, 0, 0, 1, 0, 0, 1 ])
        callback(err)
      })
      bm.getBitop('or', foo, bar, function(err, resp) {
        ase(err, null)
        ade(resp.toJSON(), [ 1, 1, 1, 0, 1, 0, 0, 1 ])
        callback(err)
      })
      bm.getBitop('and', foo, bar, function(err, resp) {
        ase(err, null)
        ade(resp.toJSON(), [ 0, 0, 1, 0, 0, 0, 0, 0 ])
        callback(err)
      })
      bm.getBitop('not', foo, function(err, resp) {
        ase(err, null)
        ade(resp.toJSON(), [ 0, 1, 0, 1, 0, 1, 1, 1 ])
        callback(err)
      })
      bm.getBitop('not', bar, function(err, resp) {
        ase(err, null)
        ade(resp.toJSON(), [ 1, 0, 0, 1, 1, 1, 1, 0 ])
        callback(err)
      })
    })

    it('should xor on multiple keys', function(done) {
      var one = 'bitmap:1'
        , two = 'bitmap:2'
        , three = 'bitmap:3'

      bm.set(one, 0, 1)
      bm.set(one, 3, 1)
      bm.set(one, 7, 1)

      bm.set(two, 0, 1)
      bm.set(two, 4, 1)
      bm.set(two, 7, 1)

      bm.set(three, 1, 1)
      bm.set(three, 5, 1)
      bm.set(three, 7, 1)

      bm.xor(one, two, three, function(err, resp) {
        ase(err, null)
        ase(resp instanceof Bitmap.BitArray, true)
        ade(resp.toJSON(), [ 0, 1, 0, 1, 1, 1, 0, 1 ])
        done()
      })
    })

    it('should perform all bitops and count results', function(done) {
      var len = 7
        , foo = 'bitmap:foo2'
        , bar = 'bitmap:bar2'

      function callback(err) {
        ase(err, null)
        --len || done()
      }
      bm.setbit(foo, 0, 1)
      bm.setbit(foo, 2, 1)
      bm.setbit(foo, 4, 1)

      bm.setbit(bar, 1, 1)
      bm.setbit(bar, 2, 1)
      bm.setbit(bar, 7, 1)

      bm.count(foo, function(err, resp) {
        ase(err, null)
        ase(resp, 3)
        callback(err)
      })
      bm.count(bar, function(err, resp) {
        ase(err, null)
        ase(resp, 3)
        callback(err)
      })
      bm.countBitop('xor', foo, bar, function(err, resp) {
        ase(err, null)
        ase(resp, 4)
        callback(err)
      })
      bm.countBitop('or', foo, bar, function(err, resp) {
        ase(err, null)
        ase(resp, 5)
        callback(err)
      })
      bm.countBitop('and', foo, bar, function(err, resp) {
        ase(err, null)
        ase(resp, 1)
        callback(err)
      })
      bm.countBitop('not', foo, function(err, resp) {
        ase(err, null)
        ase(resp, 5)
        callback(err)
      })
      bm.countBitop('not', bar, function(err, resp) {
        ase(err, null)
        ase(resp, 5)
        callback(err)
      })
    })

    it('should get multi key union', function(done) {
      bm.or('bitmap:simple', 'bitmap:multi', function(err, resp) {
        var bits = resp.toJSON()
        ase(err, null)
        ase(bits[0], 1)
        ase(bits[3], 1)
        ase(bits[5], 1)
        ase(bits[6], 1)
        ase(bits[7], 1)
        ase(bits[8], 1)
        ase(bits[10], 1)
        ase(bits[20], 1)
        ase(bits[22], 1)
        ase(bits[50], 1)
        done()
      })
    })

    it('should get a multi key intersection', function(done) {
      bm.and('bitmap:simple', 'bitmap:multi', function(err, resp) {
        var bits = resp.toJSON()
          , bin = resp.toString()
        ase(err, null)
        ase(bits[0], 1)
        ase(bits[3], 1)
        ase(bin, '00000000000000000000000000000000000000000000000000001001')
        done()
      })
    })

    it('should get a multi key intersection', function(done) {
      bm.xor('bitmap:simple', 'bitmap:multi', function(err, resp) {
        var bits = resp.toJSON()
          , bin = resp.toString()

        ase(err, null)
        ase(bin, '00000100000000000000000000000000010100000000010111100000')
        done()
      })
    })

    it('should cleanup the keys', function(done) {
      clean(db, 'bitmap*', done)
    })

    it('should disconnect from redis', function(done) {
      db.on('end', done)
      db.quit()
    })
  })

  describe('Aggregation', function() {
    var db = redis.createClient(6379, '127.0.0.1', {return_buffers: true})
      , bm = new Bitmap(db)

    it('should aggregate commands for a get', function(done) {
      var multi = bm
        .aggregate('bitmap:tmp', 'get')
        .set('bitmap:one', 0, 1)
        .set('bitmap:two', 1, 1)
        .set('bitmap:two', 2, 1)
        .union('bitmap:one', 'bitmap:two')
        .set('bitmap:three', 1, 1)
        .set('bitmap:three', 2, 1)
        .xor('bitmap:three')
        .clean()
        .exec(function(err, resp) {
          ase(err, null)
          ase(resp.toString(), '00000001')

          db.get('bitmap:tmp', function(err, resp) {
            ase(err, null)
            ase(resp, null)
            done()
          })
        })
    })

    it('should aggregate commands for a bitcount', function(done) {
      var multi = bm
        .aggregate('bitmap:cardinality')
        .set('bitmap:one', 0, 1)
        .set('bitmap:two', 1, 1)
        .set('bitmap:two', 2, 1)
        .union('bitmap:one', 'bitmap:two')
        .set('bitmap:three', 1, 1)
        .set('bitmap:three', 2, 1)
        .count()
        .exec(function(err, resp) {
          ase(err, null)
          ase(resp, 3)

          bm.count('bitmap:cardinality', function(err, resp) {
            ase(err, null)
            ase(resp, 3)
            done()
          })
        })
    })

    it('should cleanup the keys', function(done) {
      clean(db, 'bitmap*', done)
    })

    it('should disconnect from redis', function(done) {
      db.on('end', done)
      db.quit()
    })
  })
})
