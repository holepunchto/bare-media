# bare-media

A set of media apis for Bare

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

> NOTE: A worker spawns when an operation is requested and it stays running until the parent process is killed.

Terminate the worker:

```js
worker.close()

worker.onClose = () => {
  // worker terminated
}
```

Call the methods directly without a worker:

```js
import { createPreview } from 'bare-media/worker/media.js'

const data = await createPreview({ path, maxWidth, maxHeight })
```

## API

> See [schema.js](shared/spec/schema.js) for the complete reference of parameters

### createPreview()

Create a preview from a media file

| Property    | Type   | Description                                                       |
| ----------- | ------ | ----------------------------------------------------------------- |
| `path`      | string | Path to the input file                                            |
| `mimetype`  | string | Media type of the input file. If not provided it will be detected |
| `maxWidth`  | number | Max width for the generated preview                               |
| `maxHeight` | number | Max height for the generated preview                              |
| `maxFrames` | number | Max frames for the generated preview in case the file is animated |
| `maxBytes`  | number | Max bytes for the generated preview                               |
| `format`    | string | Media type for the generated preview. Default `image/webp`        |
| `encoding`  | string | `base64` or nothing for buffer                                    |

### decodeImage()

Decode an image to RGBA

| Property   | Type   | Description                                                       |
| ---------- | ------ | ----------------------------------------------------------------- |
| `path`     | string | Path to the input file. Either this or `httpLink` is required     |
| `httpLink` | string | Http link to the input file                                       |
| `mimetype` | string | Media type of the input file. If not provided it will be detected |

## License

Apache-2.0
