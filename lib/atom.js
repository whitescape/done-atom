'use babel';

const BASE_URL = `http://localhost:8080`, // `https://done-be-stage.herokuapp.com`,
	BASE_WS = `ws://localhost:8080` // `wss://done-be-stage.herokuapp.com`

const Path = require('path'),
	wsc = require('socket.io-client')(BASE_URL, { autoConnect: false }),
	{ promises: fs } = require('fs'),
	{ promisify } = require('util'),
	exec = promisify(require('child_process').exec)

import { CompositeDisposable } from 'atom'

let TOKEN = ''

const auth = async context => {
  TOKEN = atom.config.get('hitman.token')
	if (TOKEN) {
		wsc.auth = { token: TOKEN }
		wsc.connect()
		return null
	}

	atom.confirm({
		message: `Hitman Authorization: press OK to proceed to browser`,
		buttons: [ 'OK', 'Cancel' ],
	}, async index => {
    if (0 != index) return null

  	const urlCallback = `atom://hitman`
  	const url = `${BASE_URL}/auth/vscode/signin/?state=${encodeURIComponent(urlCallback)}`
  	await exec(`open "${url}"`)
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
			.replace(/^https:\/\/github\.com\//, '')
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
      'atom:auth': () => this.auth()
    }))

    auth().catch(console.error)

		let atStart = new Date
		let nameFileLast = ''

		atom.workspace.observeTextEditors(editor => {
			const nameFile = editor.getPath()

			editor.onDidStopChanging(() => {
				if (!TOKEN) return null

				if (nameFile != nameFileLast) {
					if (nameFileLast) {
						load({ nameFile: nameFileLast, atStart })
					}
					nameFileLast = `${nameFile}`
					const nInterval = setInterval(() => {
						if ((new Date - atStart) > 1000) {
							clearInterval(nInterval)
							load({ nameFile: nameFileLast, atStart, atLast: new Date })
							nameFileLast = ''
						}
					}, 100)
				} else {
					atStart = new Date
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
