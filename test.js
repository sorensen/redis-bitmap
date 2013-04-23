'use strict';

var assert = require('assert')
  , ase = assert.strictEqual
  , ade = assert.deepEqual
  , BitArray = require('./lib/bitarray')
  , Bitmap = require('./lib/bitmap')
  , utils = require('./lib/utils')
  , redis = require('redis')
  , now = new Date()

describe('Redis BitMap', function() {

  function clean(db, pattern, done) {
    db.keys(pattern, function(err, resp) {
      var args = resp.map(function(x) {
        return x.toString()
      })
      function callback(err, resp) {
        ase(err, null)
        done()
      }
      args.push(callback)
      db.del.apply(db, args)
    })
  }

  describe('BitMap', function() {
    var db = redis.createClient(6379, '127.0.0.1', {detect_buffers: true})
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
      bm.count('bitmap:simple', 'bitmap:multi', function(err, count) {
        ase(err, null)
        ase(count, 10)
        done()
      })
    })

    it('should get multi key union', function(done) {
      bm.union('bitmap:simple', 'bitmap:multi', function(err, resp) {
        // console.log('UNION: ', resp)
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
      bm.intersect('bitmap:simple', 'bitmap:multi', function(err, resp) {
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
    var db = redis.createClient(6379, '127.0.0.1', {detect_buffers: true})
      , bm = new Bitmap(db)

    it('should return a multi', function(done) {
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

    it('should return a multi', function(done) {
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

    it('should still work as a non-buffered client', function(done) {
      db.set('bitmap:string', 'string', function(err, resp) {
        ase(err, null)
        ase(resp, 'OK')
        db.get('bitmap:string', function(err, resp) {
          ase(err, null)
          ase(resp, 'string')
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

  describe('BitArray', function() {

    it('should get the correct cardinality', function() {
      ase(BitArray.cardinality(144), 2)
      ase(BitArray.cardinality(128), 1)
    })

    it('should get the correct bits', function() {
      var bit = new BitArray([128, 144])
      ase(bit.toString(), '0000100100000001')
      ase(bit.cardinality(), 3)
      ade(bit.toJSON(), [1,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0])
    })

    it('should union multiple bit arrays', function() {
      var bits = BitArray.union([1,0,0], [0,1,0], [0,0,1])
      ade(bits, [1,1,1])
    })

    it('should intersect multiple bit arrays', function() {
      var bits = BitArray.intersect([1,0,0], [1,1,0], [1,0,1])
      ade(bits, [1,0,0])
    })

    it('should diff two bit arrays', function() {
      var bits = BitArray.difference([1,0,0], [1,1,1])
      ade(bits, [0,1,1])
    })
  })
})