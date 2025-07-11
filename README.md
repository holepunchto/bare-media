# keet-worker-compute

(WIP)

Worker for handling heavy tasks outside Keet's main process

## Install

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

> NOTE: A worker spawns when an operation is requested and it stays running until the parent process is killed. If you need to spawn it earlier it's also possible by calling `worker.run()`. 

## API

| Method              | Parameters                          | Return Value        | Description
|---------------------|-------------------------------------|---------------------|----------------------------------------
| `createPreview`     | `path, maxSize, mimetype, encoding` | `metadata, preview` | Create a preview from a media file
| `createPreviewAll`  | `path, maxSize, mimetype`           | `metadata, preview` | Create all 3 previews from a media file

> See [schema.js](shared/spec/schema.js) for the complete reference of parameters
