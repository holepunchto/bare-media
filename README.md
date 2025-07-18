# keet-compute

Worker for handling heavy tasks outside Keet's main process

## Install

```
npm i keet-compute
```

## Usage

```js
import worker from '@holepunchto/keet-compute'

const data = await worker.createPreview({ path, mimetype, maxWidth, maxHeight })
```

or manually instantiate one or multiple workers:

```js
import { WorkerClient } from '@holepunchto/keet-compute/client'

const worker = new WorkerClient()
const data = await worker.createPreview({ path, mimetype, maxWidth, maxHeight })
```

> NOTE: A worker spawns when an operation is requested and it stays running until the parent process is killed. If you need to spawn it earlier it's also possible by calling `worker.run()`. 

Handle close event:

```js
import worker from '@holepunchto/keet-compute'

worker.onClose = () => {
  // worker closed unexpectedly
}

````

## API

| Method              | Parameters                                              | Return Value        | Description
|---------------------|---------------------------------------------------------|---------------------|----------------------------------------
| `createPreview`     | `path, mimetype, maxWidth, maxHeight, format, encoding` | `metadata, preview` | Create a preview from a media file
| `createPreviewAll`  | `path, mimetype, maxWidth, maxHeight, format`           | `metadata, preview` | Create all 3 previews from a media file

> See [schema.js](shared/spec/schema.js) for the complete reference of parameters
