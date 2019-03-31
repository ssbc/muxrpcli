var minimist = require('minimist')
var toPull   = require('stream-to-pull-stream')
var pull     = require('pull-stream')
var wrap     = require('word-wrap')
var Usage = require('muxrpc-usage')

var usageErrors = [
  'UsageError',
  'BadParamError',
  'BadArgError'
  //'TypeError'
]

var isBuffer = Buffer.isBuffer
function isObject (o) {
  return o && 'object' === typeof o && !Buffer.isBuffer(o)
}
function isString (s) {
  return 'string' === typeof s
}
function isUsageError (err) {
  return usageErrors.indexOf(err.name) >= 0
}

function maybeStringify () {
  return pull.map(function (b) {
    if(isBuffer(b)) return b
    return JSON.stringify(b, null, 2) + '\n\n'
  })
}

function get(obj, path) {
  path.forEach(function (k) {
    obj = obj ? obj[k] : null
  })
  return obj
}

module.exports = function (argv, manifest, rpc, verbose) {
  // parse out `cmd`, `args`, and `isStdin`
  var opts = minimist(argv)
  var cmd = opts._[0], args = opts._.slice(1)
  var isStdin = '.' === args[0]
  if(!cmd) cmd = []
  else cmd = cmd.split('.')
  delete opts._
  if (Object.keys(opts).length)
    args.push(opts)

  function usage (cmd, opts) {
    // find the closest full help command. foo.bazCommand becomes foo.help (probably).

    var _cmd = cmd.slice()
      //find the highest match, and print quick usage there
      while(!get(manifest, _cmd.concat('help')) && _cmd.length)
        { _cmd.pop() }

    var help = get(rpc, _cmd.concat('help'))
    opts = opts || {}
    if(help) {
      help (function (err, data) {
        if(err) onError(err)
        var helpPath = cmd.slice(_cmd.length)
        console.log(opts.deep ? Usage.deep(data, helpPath, _cmd) : Usage.quick(data, helpPath, _cmd))
        process.exit(1)
      })
    } else if(!help) {
      console.error('at command:', cmd)
      throw new Error('help command is missing!')
    }
  }

  function onError (err) {
    if (isUsageError(err)) {
      console.error(err.message)
      process.exit(1)
    }
    else
      //otherwise it's a programmer error, so we need the stacktrace.
      throw err
  }


  // route to the command
  if (!cmd)                return usage([]) //print shallow help
  else if(opts.help) return usage(cmd, {deep: true})

  var cmdType = get(manifest, cmd)
  if(!cmdType)
    return usage(cmd)

  // handle stdin-mode.
  // XXX this makes sense when it's async or sync
  // if it's a sink, should stream it in.
  if(!process.stdin.isTTY && isStdin) {
    pull(
      toPull.source(process.stdin),
      pull.collect(function (err, ary) {
        var str = Buffer.concat(ary).toString('utf8')
        var data = JSON.parse(str)
        next([data])
      })
    )
  }
  else
    next(args)

  function next (args) {

    if ('async' === cmdType || cmdType === 'sync') {
      get(rpc, cmd).apply(null, args.concat([function (err, res) {
        if (err) return onError(err)
        if (typeof res != 'undefined')
          console.log(JSON.stringify(res, null, 2))
        process.exit()
      }]))
    }
    else if ('source' === cmdType)
      pull(
        get(rpc, cmd).apply(null, args),
        maybeStringify(),
        toPull.sink(process.stdout, function (err) {
          if (err)
            return onError(err)
          process.exit()
        })
      )
    else if ('sink' === cmdType)
      pull(
        toPull.source(process.stdin),
        get(rpc, cmd).apply(null, args.concat([function (err, res) {
          if (err)
            return onError(err)
          if (typeof res != 'undefined')
            console.log(JSON.stringify(res, null, 2))
          process.exit()
        }]))
      )
    else if (typeof cmdType == 'object' && cmdType) {
      // it may be a sub-object manifest, try getting usage for it
      //HELP quick usage for this command.
      usage(cmd, manifest, rpc)
    }
    else {
      console.error('Invalid Manifest:', cmdType, 'is not a valid method-type')
      process.exit(1)
    }
  }
}

