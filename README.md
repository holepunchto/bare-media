# keet-worker-compute

(WIP)

Worker for handling heavy tasks outside Keet's main process

```
npm i keet-worker-compute
```

## Usage

Singleton:

```js
import worker from '@holepunchto/keet-worker-compute'

const buffer = await worker.heicToJpg(path)
```

or instantiate one or multiple workers:

```js
import { WorkerClient } from '@holepunchto/keet-worker-compute/client'

const worker = new WorkerClient()
const buffer = await worker.heicToJpg(path)
```
