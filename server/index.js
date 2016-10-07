var assert = require('assert')
var path = require('path')
var events = require('events')

var express = require('express')
var WebSocketServer = require('ws').Server
var http = require('http')

var nmeAlbums = require('./lib/nmeAlbumGenerator')
var makeGame = require('./lib/game')

var app = express()

app.use('/static', express.static(
  path.resolve(path.join(__dirname, '..', 'build'))
))

app.get('/', function (req, res) {
  res.sendFile(path.resolve(path.join(__dirname, '..', 'dist', 'index.html')))
})

var port = process.env.PORT || 8888
var server = http.createServer(app)

// var server = app.listen(port, function () {
//   console.log('listening at ' + port)
// })

var wss = new WebSocketServer({server: server})

wss.on('connection', function connection (ws) {
  ws.on('message', function incoming (message) {
    console.log('received: %s', message)
  })
  ws.on('close', function () {
    ws.frutalThinksThisIsClosed = true
    maybeEndGame()
  })

  ws.once('message', function /* theFirstMessageIsThePlayerNameLel */ (playerName) {
    ws._playerName = playerName.trim()
    while (playerNames().indexOf(ws._playerName) !== -1) {
      ws._playerName += ' (doppelganger)'
    }

    if (ws.frutalThinksThisIsClosed) { return }

    if (currentGame == null) {
      playerSockets.push(ws)
      maybeStartGame()
      if (currentGame == /* still */ null) {
        ws.send('["waiting_for_players"]\n')
      }
    } else {
      waitingSockets.push(ws)
      ws.send('["waiting_for_game_end"]\n')
    }
  })
})

var currentGame = null
var playerSockets = []
var waitingSockets = []
function startGame (playerSockets) {
  assert(playerSockets.length)
  assert(currentGame == null)

  var listeners = []
  var players = playerSockets.map(function (player, i) {
    var playerEmitter = new events.EventEmitter()
    listeners.push({ listener: onMessage, socket: player })
    player.on('message', onMessage)
    function onMessage (message) {
      try {
        message = JSON.parse(message)
      } catch (e) {
        console.error(e)
        return
      }
      if (message[0] !== 'answer') { return }

      playerEmitter.emit('answer', message[1])
    }

    return playerEmitter
  })

  var roundQuizes = []
  for (var i = 0; i < 6; i++) {
    roundQuizes.push(nmeAlbums.getRandomAlbum())
  }

  currentGame = makeGame(players, roundQuizes)

  /** Stuffs to broadcast **/
  function broadcast (message) {
    playerSockets.forEach(function (playerSocket, i) {
      if (playerSocket.readyState === playerSocket.OPEN) {
        playerSocket.send(JSON.stringify(message) + '\n')
      }
    })
  }

  currentGame.on('start_round', function (quiz) {
    broadcast(['start_round', quiz])
  })
  currentGame.on('end_round', function () {
    broadcast(['end_round'])
  })
  function playerInfo () {
    return playerNames().map(function (name, idx) {
      return {
        name: name,
        score: 0
      }
    })
  }
  currentGame.on('start_game', function () {
    broadcast(['start_game', {
      players: playerInfo()
    }])
  })
  currentGame.on('scores', function (scoresArr) {
    broadcast([
      'scores',
      playerInfo().map(function (info, i) {
        info.score = scoresArr[i]
        return info
      })
    ])
  })
  currentGame.on('answer', function (ans) {
    broadcast(['answer', { playerName: (playerSockets[ans[1]] || {})._playerName || '', answer: ans[0] }])
  })
  currentGame.on('end_game', function () {
    broadcast(['end_game'])
  })

  currentGame.on('end_game', function () {
    listeners.forEach(function (listener) {
      if (listener.socket.readyState === listener.socket.OPEN) {
        listener.socket.off('message', listener.listener)
      }
    })
  })

  /** Start teh game **/
  currentGame.start()
}

server.listen(port, function () {
  console.log('Listening on ' + server.address().port)
})

function socketsReadyToPlay () {
  playerSockets = playerSockets.concat(waitingSockets).filter(function (sock) {
    return sock.frutalThinksThisIsClosed !== true
  })
  waitingSockets = []
  return playerSockets
}

function playerNames () {
  return playerSockets.map(function (sock) {
    return sock._playerName
  })
}

function maybeStartGame () {
  if (currentGame != null) {
    return
  }

  playerSockets = socketsReadyToPlay()
  if (playerSockets.length >= 2) {
    startGame(playerSockets)
    currentGame.on('end_game', function () {
      currentGame = null

      setTimeout(maybeStartGame, 5000)
    })
  }
}

function maybeEndGame () {
  if (currentGame == null) {
    return
  }

  var anyoneUp = playerSockets.some(function (sock) {
    return sock.readyState === sock.OPEN
  })

  if (!anyoneUp) {
    console.log('nobody is up, ending the game')
    currentGame.end()
    currentGame = null
    setTimeout(maybeStartGame, 5000)
  }
}