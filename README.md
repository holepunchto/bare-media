# bare-media

All the media things

## Install

```
npm i bare-media
```

## Usage

From a single worker:

```js
import worker from 'bare-media'

const data = await worker.createPreview({ path, maxWidth, maxHeight })
```

Manually instantiate one or multiple workers:

```js
import { WorkerClient } from 'bare-media/client'

const worker = new WorkerClient()
const data = await worker.createPreview({ path, maxWidth, maxHeight })
```

> NOTE: A worker spawns when an operation is requested and it stays running until the parent process is killed. If you need to spawn it earlier it's also possible by calling `worker.run()`. 

Handle close event:

```js
import worker from 'bare-media'

worker.onClose = () => {
  // worker closed unexpectedly
}

```

You can also call the utilities directly without using a worker:

```js
import { createPreview } from 'bare-media/worker/media.js'

const data = await worker.createPreview({ path, maxWidth, maxHeight })
```

## API

| Method              | Parameters                                              | Return Value        | Description
|---------------------|---------------------------------------------------------|---------------------|----------------------------------------
| `createPreview`     | `path, mimetype, maxWidth, maxHeight, format, encoding` | `metadata, preview` | Create a preview from a media file
| `createPreviewAll`  | `path, mimetype, maxWidth, maxHeight, format`           | `metadata, preview` | Create all 3 previews from a media file
| `decodeImage`       | `httpLink, mimetype`                                    | `metadata, data`    | Decode an image to RGBA

> See [schema.js](shared/spec/schema.js) for the complete reference of parameters
