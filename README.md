# bare-media

A set of media apis for Bare

## Install

```
npm i bare-media
```

## Usage

Image:

```js
import { image } from 'bare-media'

const preview = image(path)
  .decode({ maxFrames })
  .resize({ maxWidth, maxHeight })
  .encode('image/webp')
```

Video:

```js
import { video } from 'bare-media'

const frames = video(path)
  .extractFrames({ frameNum })
```

Each method can also be used independently:

```js
const rgba1 = image.decode(buffer, { maxFrames })
const rgba2 = video.extractFrames(fd, { frameNum })
````

## Image API

### decode()

Decode an image to RGBA

| Parameter         | Type   | Description                                                               |
| -----------      | ------ | ------------------------------------------------------------------------- |
| `buffer`         | string | The encoded image |
| `opts.maxFrames` | number | Max number for frames to decode in case of animated images |

### encode()

Encodes an image to a specific format

| Parameter         | Type   | Description                                                               |
| -----------      | ------ | ------------------------------------------------------------------------- |
| `buffer`         | string | The rgba image |
| `mimetype`       | string | The mimetype of the output image |
| `opts.maxBytes`  | number | Max bytes for the encoded image (reduces quality or fps in case of animated images) |

### crop()

Encodes an image to a specific format

| Parameter         | Type   | Description                                                               |
| -----------      | ------ | ------------------------------------------------------------------------- |
| `buffer`         | string | The rgba image |
| `opts.left`  | number | Offset from left edge |
| `opts.top`  | number | Offset from top edge|
| `opts.width`  | number | Width of the region to crop |
| `opts.height`  | number | Height of the region to crop |

### resize()

Encodes an image to a specific format

| Parameter         | Type   | Description                                                               |
| -----------      | ------ | ------------------------------------------------------------------------- |
| `buffer`         | string | The rgba image |
| `opts.maxWidth`  | number | Max width of the output rgba |
| `opts.maxHeight` | number | Max height of the output rgba |

## Video API

### extractFrames()

Extracts frames from a video in RGBA

| Parameter         | Type   | Description                                                               |
| -----------      | ------ | ------------------------------------------------------------------------- |
| `fd`         | number | File descriptor |
| `opts.frameNum` | number | Number of the frame to extract |

## Helpers

The library also exposes helpers to check for supported media types.

### isImageSupported(mimetype)

Returns `true` if the mimetype is a supported image format (e.g. `image/jpeg`, `image/png`, `image/webp`, etc).

### isVideoSupported(mimetype)

Returns `true` if the mimetype is a supported video format (e.g. `video/mp4`, `video/webm`, etc).

### isMediaSupported(mimetype)

Returns `true` if the mimetype is either a supported image or video format.

## License

Apache-2.0
