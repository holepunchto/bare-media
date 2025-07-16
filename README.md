# keet-compute

(WIP)

Worker for handling heavy tasks outside Keet's main process

## Install

```
npm i keet-compute
```

## Usage

```js
import worker from '@holepunchto/keet-compute'

const data = await worker.createPreview({ path, mimetype, size })
```

or manually instantiate one or multiple workers:

```js
import { WorkerClient } from '@holepunchto/keet-compute/client'

const worker = new WorkerClient()
const data = await worker.createPreview({ path, mimetype, size })
```

> NOTE: A worker spawns when an operation is requested and it stays running until the parent process is killed. If you need to spawn it earlier it's also possible by calling `worker.run()`. 

## API

| Method              | Parameters                               | Return Value        | Description
|---------------------|------------------------------------------|---------------------|----------------------------------------
| `createPreview`     | `path, mimetype, size, format, encoding` | `metadata, preview` | Create a preview from a media file
| `createPreviewAll`  | `path, mimetype, size, format`           | `metadata, preview` | Create all 3 previews from a media file

> See [schema.js](shared/spec/schema.js) for the complete reference of parameters
