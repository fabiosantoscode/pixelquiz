import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { createStore, applyMiddleware } from 'redux'
import { fromJS } from 'immutable'
// import App from './App'

import reducer from './reducer'
import remoteActionMiddleware from './remote_action_middleware.js'
import * as actions from './actions'
import App from './components/App'

import './index.css'

var HOST = location.origin.replace(/^https?:/, '')
var portPos = HOST.indexOf(':')
if (portPos !== -1) {
  HOST = HOST.substring(0, portPos)
}

HOST = 'ws:' + HOST

if (process.env.NODE_ENV === 'development') {
  HOST += ':' + (process.env.PORT || '8888')
}

const connection = new window.WebSocket(HOST)

const defaultState = fromJS({
  currentAlbum: {},
  messages: [],
  playerName: '',
  score: '',
  scores: []
})

const createStoreWithMiddleware = applyMiddleware(
  remoteActionMiddleware(connection)
)(createStore)
const store = createStoreWithMiddleware(reducer, defaultState)

// TODO change this to be sent when RegisterForm is filled
// connection.onopen = (e) => connection.send('carniceiro')

connection.onmessage = (e) => {
  let resp = JSON.parse(e.data)
  console.log(resp)
  if (resp[0] !== 'answer' && resp[0] !== 'scores') {
    store.dispatch(actions.setGameStatus(resp[0]))
  }
  if (resp[0] === 'start_round') {
    store.dispatch(actions.setCurrentAlbum(resp[1]))
  } else if (resp[0] === 'end_round') {
    // TODO
  } else if (resp[0] === 'scores') {
    store.dispatch(actions.setScores(resp[1]))
  } else if (resp[0] === 'answer') {
    store.dispatch(actions.updateMessages(resp[1]))
  }
}

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('pixelquiz_app')
)
