#! /usr/bin/env node

var muxrpcli = require('.')
var zerr = require('zerr')
var MissingArgError = zerr('BadArg', '"%" is required')
var BadTypeError = zerr('BadArg', '"%" must be a valid %')

function isAddress (v) {
  return v && typeof v == 'string' && v.split('.').length == 4
}

var manifest = {
  usage: 'async',
  whoami: 'async',
  ping: 'async'
}

var api = {
  usage: function (cmd, cb) {
    switch (cmd) {
      case 'whoami':
        return cb(null, 'whoami. get your profile info.')
      case 'ping':
        return cb(null, 'ping {target} [-n times]. send `n` pings to `target`, defaults to 1')
    }
    cb(null, [
      'myexample usage:',
      ' - whoami. get your profile info.',
      ' - ping {target} [-n times]. send `n` pings to `target`, defaults to 1'
    ].join('\n'))
  },

  whoami: function(cb) {
    cb(null, 'bob, obviously')
  },

  ping: function(target, opts, cb) {
    if (typeof target == 'function') cb = target, target = null
    if (typeof opts == 'function')   cb = opts, opts = null

    if (!target) return cb(MissingArgError('target'))
    if (!isAddress(target)) return cb(BadTypeError('target', 'address'))
    
    var n = 1
    if (opts && opts.n) {
      n = +opts.n
      if (isNaN(n)) return cb(BadTypeError('n', 'number'))
    }

    for (var i=0; i < n; i++) {
      console.log('ping', target)
    }
    cb()
  }
}

muxrpcli(process.argv.slice(2), manifest, api)