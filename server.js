const WebSocket = require('ws');
const fetch = require("node-fetch");

function noop() {}

function heartbeat() {
    this.isAlive = true;
}

const wss = new WebSocket.Server({ port: process.env.PORT || 8888 });

const supportedOperations = ['subscribe', 'unsubscribe'];
let repositories = new Map();
let subscriptions = new Map();
let initialized = false;

init();

wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    ws.on('message', msg => {
        try {
            msg = JSON.parse(msg);
        } catch(err) {
            let errMsgObj = {
                'event': 'error',
                'errorMsg': 'message is no valid JSON',
                supportedOperations,
                'trackedRepositories': [...repositories.keys()],
                'originalMsg': msg
            };
            ws.send(JSON.stringify(errMsgObj));
            return;
        }
        if (msg.op && supportedOperations.includes(msg.op) && msg.payload && subscriptions.get(`${msg.payload.owner}/${msg.payload.name}`)) {
            if (msg.op === 'subscribe') {
                clients = subscriptions.get(`${msg.payload.owner}/${msg.payload.name}`);
                let msgObj = {
                    'event': 'initSubscription',
                    'payload': {
                        'repository': `${msg.payload.owner}/${msg.payload.name}`,
                        'version': repositories.get(`${msg.payload.owner}/${msg.payload.name}`)
                    }
                };
                ws.send(JSON.stringify(msgObj));
                clients.push(ws);
            } else if (msg.op === 'unsubscribe') {
                clients = subscriptions.get(`${msg.payload.owner}/${msg.payload.name}`);
                subscriptions.set(`${msg.payload.owner}/${msg.payload.name}`, clients.filter(element => element !== ws));
                let msgObj = {
                    'event': 'endSubscription',
                    'payload': {
                        'repository': `${msg.payload.owner}/${msg.payload.name}`,
                        'status': 'SUCCESS'
                    }
                };
                ws.send(JSON.stringify(msgObj));
            }
        } else {
            let errMsgObj = {
                'event': 'error',
                'errorMsg': 'unsupported operation / untracked repository',
                supportedOperations,
                'trackedRepositories': [...repositories.keys()],
                'originalMsg': msg
            };
            ws.send(JSON.stringify(errMsgObj));
        }
    });
});

wss.on('close', function close() {
    clearInterval(heartbeatInterval);
    clearInterval(trackReleasesInterval);
    clearInterval(cleanClientSubscriptions);
});

async function init() {
    if (!process.env.TOKEN) {
        throw 'env-variable missing: TOKEN';
    } else if (!process.env.REPO_FILE) {
        throw 'env-variable missing: REPO_FILE';
    }
    let input = require('./repositories.json');
    await Promise.all(input.map(async repo => {
        let data = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/releases/latest`, {
                            headers: {
                                'Authorization': `token ${process.env.TOKEN}`
                            }
                        }).then(res => res.json());
        repositories.set(`${repo.owner}/${repo.name}`, data.tag_name);
        subscriptions.set(`${repo.owner}/${repo.name}`, []);
    }));
    console.log('initialized repositories');
    console.log(repositories);
    initialized = true;
}

const heartbeatInterval = setInterval(function ping() {
    wss.clients.forEach(client => {
        if (client.isAlive === false) {
            return client.terminate();
        }
        client.isAlive = false;
        client.ping(noop);
    });
}, process.env.HEARTBEAT_INTERVAL || 300000);

const cleanClientSubscriptions = setInterval(() => {
    subscriptions.forEach((value, key, map) => {
        const indexToRemove = [];
        value.forEach((client, index) => {
            if (!wss.clients.has(client)) {
                indexToRemove.push(index);
            }
        });
        const indexSet = new Set(indexToRemove);
        subscriptions.set(key, value.filter((v, i) => !indexSet.has(i)))
    });
}, process.env.CLEAN_CLIENT_SUBSCRIPTIONS_INTERVAL || 300000);

const trackReleasesInterval = setInterval(async () => {
    if(initialized) {
        let updatedRepos = new Map();
        await Promise.all([...repositories.keys()].map(async key => {
                let data = await fetch(`https://api.github.com/repos/${key}/releases/latest`, {
                                    headers: {
                                        'Authorization': `token ${process.env.TOKEN}`
                                    }
                                }).then(res => res.json());
                if(repositories.get(key) !== data.tag_name) {
                    console.log(`${key} - OLD VERSION: ${repositories.get(key)} - NEW VERSION: ${data.tag_name}`);
                    repositories.set(key, data.tag_name);
                    updatedRepos.set(`${key}`, data.tag_name);
                }
        }));
        updatedRepos.forEach((value, key, map) => {
            subscriptions.get(key).forEach(client => {
                let msgObj = {
                    'event': 'newRelease',
                    'payload': {
                        'repository': key,
                        'version': value
                    }
                };
                client.send(JSON.stringify(msgObj));
            });
        });
    } else {
        console.log('waiting for repositories to be initialized ...');
    }
}, process.env.TRACK_RELEASES_INTERVAL || 3600000);