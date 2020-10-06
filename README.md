# release-tracker-ws-server
a websocket server that tracks GitHub repositories for new releases and allows clients to subscribe/unsubscribe to new releases of specific repositories.

the tag-name of the release is being interpreted as latest version of the repository.

clients that subscribed for a certain repository will be notified when a new release with a different tag-name is available.

## Define JSON file with repositories to track
```json
[
    {
        "owner": "kryptokrauts",
        "name": "aepp-sdk-java"
    },
    {
        "owner": "kryptokrauts",
        "name": "contraect-maven-plugin"
    }
]
```

## Environment variables
```shell
# required
export TOKEN=<GITHUB_ACCESS_TOKEN>
export REPO_FILE=<PATH_TO_JSON_FILE>

# optional
export PORT=<PORT>
export HEARTBEAT_INTERVAL=<MILLISECONDS>
export CLEAN_CLIENT_SUBSCRIPTIONS_INTERVAL=<MILLISECONDS>
export TRACK_RELEASES_INTERVAL<MILLISECONDS>
```

#### Defaults
```shell
PORT=8888
HEARTBEAT_INTERVAL=300000
CLEAN_CLIENT_SUBSCRIPTIONS_INTERVAL=300000
TRACK_RELEASES_INTERVAL=3600000
```

## Run the server
```shell
node server.js
```

## Examples
When a client has opened the websocket connection it can send following messages in the respective JSON format to the server to subscribe/unsubscribe to the release events.

### Subscribe
**Client -> Server**
```json
{
    "op": "subscribe",
    "payload": {
        "owner": "kryptokrauts",
        "name": "aepp-sdk-java"
    }
}
```
**Server -> Client**  
The server answers with the `initSubscription` event and returns the current version of the repository.

```json
{
    "event": "initSubscription",
    "payload": {
        "repository": "kryptokrauts/aepp-sdk-java",
        "version": "v2.2.1"
    }
}
```

### newRelease event
If a new release of a subscribed repository is detected by the server the client will be notified with following message:

```json
{
    "event": "newRelease",
    "payload": {
        "repository": "kryptokrauts/aepp-sdk-java",
        "version": "v3.0"
    }
}
```

### Unsubscribe
**Client -> Server**
```json
{
    "op": "unsubscribe",
    "payload": {
        "owner": "kryptokrauts",
        "name": "aepp-sdk-java"
    }
}
```
**Server -> Client**  
The server answers with the `endSubscription` event and returns the repository and the status `SUCCESS`:

```json
{
    "event": "endSubscription",
    "payload": {
        "repository": "kryptokrauts/aepp-sdk-java",
        "status": "SUCCESS"
    }
}
```