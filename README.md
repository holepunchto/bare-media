# keet-worker-compute

(WIP)

Worker for handling heavy tasks outside Keet's main process

```
npm i keet-worker-compute
```

## Usage

```js
import worker from '@holepunchto/keet-worker-compute'

const data = await worker.createPreview({ path, maxSize })
```

or manually instantiate one or multiple workers:

```js
import { WorkerClient } from '@holepunchto/keet-worker-compute/client'

const worker = new WorkerClient()
const data = await worker.createPreview({ path, maxSize })
```

> A worker spawns when an operation is requested and it stays running until the parent process is killed. If you need to spawn it earlier it's also possible by calling `worker.run()`. 
