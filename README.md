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

const data = await worker.createImagePreview({ path, maxWidth, maxHeight })
```

Manually instantiate one or multiple workers:

```js
import { WorkerClient } from 'bare-media/client'

const worker = new WorkerClient()
const data = await worker.createImagePreview({ path, maxWidth, maxHeight })
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
import { createImagePreview } from 'bare-media/worker/media.js'

const data = await createImagePreview({ path, maxWidth, maxHeight })
```

## API

> See [schema.js](shared/spec/schema.js) for the complete reference of parameters

### createImagePreview()

Create a preview from a media file

| Property    | Type   | Description                                                               |
| ----------- | ------ | ------------------------------------------------------------------------- |
| `path`      | string | Path to the input file. Either `path`, `httpLink` or `buffer` is required |
| `httpLink`  | string | Http link to the input file                                               |
| `buffer`    | object | Bytes of the input file                                                   |
| `mimetype`  | string | Media type of the input file. If not provided it will be detected         |
| `maxWidth`  | number | Max width for the generated preview                                       |
| `maxHeight` | number | Max height for the generated preview                                      |
| `maxFrames` | number | Max frames for the generated preview in case the file is animated         |
| `maxBytes`  | number | Max bytes for the generated preview                                       |
| `format`    | string | Media type for the generated preview. Default `image/webp`                |
| `encoding`  | string | `base64` or nothing for buffer                                            |

### createVideoPreview()

Create a preview from a video file

| Property     | Type    | Description                                                               |
| ------------ | ------- | ------------------------------------------------------------------------- |
| `path`       | string  | Path to the input file. Either `path`, `httpLink` or `buffer` is required |
| `httpLink`   | string  | Http link to the input file                                               |
| `buffer`     | object  | Bytes of the input file                                                   |
| `mimetype`   | string  | Media type of the input file. If not provided it will be detected         |
| `maxWidth`   | number  | Max width for the generated preview                                       |
| `maxHeight`  | number  | Max height for the generated preview                                      |
| `maxBytes`   | number  | Max bytes for the generated preview                                       |
| `timestamp`  | number  | Timestamp in milliseconds to extract the preview from                     |
| `percent`    | number  | Percentage (0-100) of the video duration to extract the preview from      |
| `animated`   | boolean | If true, creates an animated preview (default: `false`)                   |
| `frameCount` | number  | Number of frames for animated preview (default: `10`)                     |
| `format`     | string  | Media type for the generated preview. Default `image/webp`                |
| `encoding`   | string  | `base64` or nothing for buffer                                            |

### decodeImage()

Decode an image to RGBA

| Property   | Type   | Description                                                               |
| ---------- | ------ | ------------------------------------------------------------------------- |
| `path`     | string | Path to the input file. Either `path`, `httpLink` or `buffer` is required |
| `httpLink` | string | Http link to the input file                                               |
| `buffer`   | object | Bytes of the input file                                                   |
| `mimetype` | string | Media type of the input file. If not provided it will be detected         |

### cropImage()

Crop an image

| Property   | Type   | Description                                                               |
| ---------- | ------ | ------------------------------------------------------------------------- |
| `path`     | string | Path to the input file. Either `path`, `httpLink` or `buffer` is required |
| `httpLink` | string | Http link to the input file                                               |
| `buffer`   | object | Bytes of the input file                                                   |
| `mimetype` | string | Media type of the input file. If not provided it will be detected         |
| `left`     | number | Offset from left edge                                                     |
| `top`      | number | Offset from top edge                                                      |
| `width`    | number | Width of the region to crop                                               |
| `height`   | number | Height of the region to crop                                              |
| `format`   | string | Media type for the cropped image. Default same as the input image         |

### Helpers

The worker client instance exposes helpers to check for supported media types.

#### isImageSupported(mimetype)

Returns `true` if the mimetype is a supported image format (e.g. `image/jpeg`, `image/png`, `image/webp`, etc).

#### isVideoSupported(mimetype)

Returns `true` if the mimetype is a supported video format (e.g. `video/mp4`, `video/webm`, etc).

#### isMediaSupported(mimetype)

Returns `true` if the mimetype is either a supported image or video format.

## License

Apache-2.0
