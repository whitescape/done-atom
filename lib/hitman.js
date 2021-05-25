'use babel';

const BASE_URL = `https://done-be-stage.herokuapp.com`,
	BASE_WS = `wss://done-be-stage.herokuapp.com`

const Path = require('path'),
	wsc = require('socket.io-client')(BASE_URL, {
		transports: [ "websocket" ],
		autoConnect: false,
		withCredentials: true,
	}),
	{ promises: fs } = require('fs'),
	{ promisify } = require('util'),
	exec = promisify(require('child_process').exec)

import { CompositeDisposable } from 'atom'

let TOKEN = ''

const auth = context => {
	atom.confirm({
		message: `Hitman Authorization: press OK to proceed to browser`,
		buttons: [ 'OK', 'Cancel' ],
	}, index => {
    if (0 != index) return null

  	const urlCallback = `atom://hitman`
  	const url = `${BASE_URL}/auth/vscode/signin/?state=${encodeURIComponent(urlCallback)}`
  	exec(`open "${url}"`)
			.catch(console.error)
  })
}

const barrel = []
let isAimed = false

const load = bullet => {
	barrel.push(bullet)
	if (!isAimed) shoot().catch(console.error)
}

const gitOriginsPaths = []

const getGitOrigin = async path => {
	const exists = gitOriginsPaths.find(go => go.path == path)
	if (exists) return exists.origin
	const { stdout } = await exec(`git remote get-url origin`, { cwd: path })
	const origin = stdout
		.replace(/\n$/, '')
		.replace(/^http(s|):\/\/.*?\//, '')
		.replace(/\.git(\n|)$/, '')
	gitOriginsPaths.push({ path, origin })
	return origin
}

const shoot = async () => {
	isAimed = true
	const bullet = barrel.pop()

	const dirPathFull = Path.dirname(bullet.nameFile)
  let restPath = `${dirPathFull}`
  while (restPath != '/') {
    try {
      await fs.access(`${restPath}/.git/config`, fs.F_OK)
      break
    } catch (e) {
      restPath = Path.dirname(restPath)
    }
  }

	if (restPath != '/') {
		bullet.nameFile = bullet.nameFile
			.replace(restPath, '')
			.replace(/^\//, '')
		bullet.gitOrigin = await getGitOrigin(restPath)
		wsc.emit('hit', bullet)
	}

	if (barrel.length) await shoot()
	else isAimed = false
}

export default {
  subscriptions: null,

  handleURI(parsedUri) {
		if (!parsedUri.query.token) return null

		atom.config.set('hitman.token', TOKEN = parsedUri.query.token)
		wsc.auth = { token: TOKEN }
		wsc.connect()
  },

  activate(state) {
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'hitman:auth': () => auth()
    }))

		TOKEN = atom.config.get('hitman.token')

		if (TOKEN) {
			wsc.auth = { token: TOKEN }
			wsc.connect()
		} else {
			auth()
		}

		let atLast = new Date
		let atStart = new Date(atLast - 1)
		let nameFileLast = ''
		let nInterval

		atom.workspace.observeTextEditors(editor => {
			editor.onDidStopChanging(() => {
				if (!TOKEN) return null
				const nameFile = editor.getPath()
				atLast = new Date

				if (nameFile != nameFileLast) {
					if (nameFileLast) {
						if (nInterval) {
							nInterval = clearInterval(nInterval)
						}
						load({
							nameFile: nameFileLast,
							atStart: atStart.toISOString(),
							atLast: atLast.toISOString(),
						})
					}
					nameFileLast = `${nameFile}`
					atStart = new Date(atLast - 1)
					nInterval = setInterval(() => {
						if ((new Date - atLast) > 2000) {
							if (nInterval) {
								nInterval = clearInterval(nInterval)
								load({
									nameFile: nameFileLast,
									atStart: atStart.toISOString(),
									atLast: atLast.toISOString()
								})
								nameFileLast = ''
							}
						}
					}, 100)
				}
			})
		})
  },

  deactivate() {
  },

  serialize() {
    return {
    }
  },
}
