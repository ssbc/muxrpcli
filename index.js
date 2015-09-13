var minimist = require('minimist')
var toPull   = require('stream-to-pull-stream')
var pull     = require('pull-stream')

var usageErrors = [
  'UsageError',
  'BadParamError',
  'BadArgError'
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

function usage (cmd, manifest, rpc) {
  var usageType = get(manifest, ['usage'])
  var usageCmd  = get(rpc, ['usage'])
  if (!usageType || !usageCmd || (usageType != 'sync' && usageType != 'async'))
    next(null, 'Invalid command')
  else
    usageCmd(Array.isArray(cmd) ? cmd.join('.') : cmd, next)

  function next (err, str) {
    if (err)
      str = err.toString()
    console.error(str)
    process.exit(1)
  }
}

function onerror (err, cmd, manifest, rpc) {
  if (isUsageError(err)) {
    console.log(err.name + ': ' + err.message)
    usage(cmd, rpc, manifest)
  } else {
    console.error(err)
    return process.exit(1)
  }
}

module.exports = function (argv, manifest, rpc) {
  // parse out `cmd`, `args`, and `isStdin`
  var parsedArgv = minimist(argv)
  var cmd = parsedArgv._[0], args = parsedArgv._.slice(1)
  var isStdin = ('.' === args[0] || '--' === args[0])

  delete parsedArgv._
  if (Object.keys(parsedArgv).length)
    args.push(parsedArgv)

  // route to the command
  if (!cmd)
    return usage(false, manifest, rpc)
  if (parsedArgv.h || parsedArgv.help)
    return usage(cmd, manifest, rpc)
  cmd = cmd.split('.')
  var cmdType = get(manifest, cmd)
  if (!cmdType)
    return usage(false, manifest, rpc)

  // handle stdin-mode
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
      get(rpc, cmd).apply(null, args.concat([function (err, ret) {
        if (err)
          return onerror(err, cmd, rpc, manifest)
        console.log(JSON.stringify(ret, null, 2))
        process.exit()
      }]))
    }
    else if ('source' === cmdType)
      pull(
        get(rpc, cmd).apply(null, args),
        maybeStringify(),
        toPull.sink(process.stdout, function (err) {
          if (err) 
            return onerror(err, cmd, rpc, manifest)
          process.exit()
        })
      )
    else if ('sink' === cmdType)
      pull(
        toPull.source(process.stdin),
        get(rpc, cmd).apply(null, args.concat([function (err, res) {
          if (err) 
            return onerror(err, cmd, rpc, manifest)
          console.log(JSON.stringify(res, null, 2))
          process.exit()
        }]))
      )
    else {
      console.error('Invalid Manifest:', cmdType, 'is not a valid method-type')
      process.exit(1)
    }
  }
}
