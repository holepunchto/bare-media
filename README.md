# bare-media

A set of media APIs for Bare

## Install

```
npm i bare-media
```

## Usage

Image:

```js
import { image } from 'bare-media'

const preview = await image(path)
  .decode({ maxFrames })
  .resize({ maxWidth, maxHeight })
  .encode({ mimetype: 'image/webp' })
```

Video:

```js
import { video } from 'bare-media'

const frames = video(path).extractFrames({ frameIndex })
```

Each method can also be used independently:

```js
const rgba = await image.decode(buffer, { maxFrames })
```

## Image API

### decode()

Decode an image to RGBA

| Parameter        | Type   | Description                                               |
| ---------------- | ------ | --------------------------------------------------------- |
| `buffer`         | object | The encoded image                                         |
| `opts.maxFrames` | number | Max number of frames to decode in case of animated images |

### encode()

Encodes an image to a specific format

| Parameter       | Type   | Description                                                                         |
| --------------- | ------ | ----------------------------------------------------------------------------------- |
| `buffer`        | object | The rgba image                                                                      |
| `opts.mimetype` | string | The mimetype of the output image                                                    |
| `opts.maxBytes` | number | Max bytes for the encoded image (reduces quality or fps in case of animated images) |
| `opts...`       | any    | Additional encoder-specific options                                                 |

### crop()

Crop an image

| Parameter     | Type   | Description                  |
| ------------- | ------ | ---------------------------- |
| `buffer`      | object | The rgba image               |
| `opts.left`   | number | Offset from left edge        |
| `opts.top`    | number | Offset from top edge         |
| `opts.width`  | number | Width of the region to crop  |
| `opts.height` | number | Height of the region to crop |

### resize()

Resize an image

| Parameter        | Type   | Description                   |
| ---------------- | ------ | ----------------------------- |
| `buffer`         | object | The rgba image                |
| `opts.maxWidth`  | number | Max width of the output rgba  |
| `opts.maxHeight` | number | Max height of the output rgba |

### slice()

Limits an animated image to a subset of frames. If the image is not animated, it returns the same rgba.

| Parameter    | Type   | Description                                                              |
| ------------ | ------ | ------------------------------------------------------------------------ |
| `buffer`     | object | The rgba image                                                           |
| `opts.start` | number | Frame index at which to start extraction. Default 0.                     |
| `opts.end`   | number | Frame index at which to end extraction. Defaults to end of the animation |

### read()

Read an image from a file path, URL, or buffer.

| Parameter | Type   | Description                                 |
| --------- | ------ | ------------------------------------------- |
| `input`   | object | File path, http(s) URL, or raw image buffer |

### save()

Write an encoded image buffer to a file.

| Parameter  | Type   | Description                              |
| ---------- | ------ | ---------------------------------------- |
| `filename` | string | Destination file path                    |
| `buffer`   | object | Encoded image buffer                     |
| `opts`     | object | Options passed through to `fs.writeFile` |

## Video API

### extractFrames()

Extracts frames from a video in RGBA

| Parameter         | Type   | Description                    |
| ----------------- | ------ | ------------------------------ |
| `fd`              | number | File descriptor                |
| `opts.frameIndex` | number | Number of the frame to extract |

### transcode()

Transcode a media file to a different format

| Parameter     | Type   | Description                                                         |
| ------------- | ------ | ------------------------------------------------------------------- |
| `fd`          | number | File descriptor                                                     |
| `opts.format` | string | Output format name (e.g., `mp4`, `webm`, `matroska`). Default `mp4` |
| `opts.width`  | number | Width of the output video                                           |
| `opts.height` | number | Height of the output video                                          |

**Supported formats**: `mp4` (VP9+Opus), `webm` (VP8+Opus), `matroska`/`mkv` (VP9+Opus)

#### Example

```javascript
import { video } from 'bare-media'

// Using pipeline
for await (const chunk of video('input.mkv').transcode({
  format: 'mp4',
  width: 1280,
  height: 720
})) {
  console.log('Received chunk:', chunk.buffer.length)
}

// Using standalone function with file descriptor
import fs from 'bare-fs'

const fd = fs.openSync('input.mkv', 'r')
for await (const chunk of video.transcode(fd, {
  format: 'mp4',
  width: 1280,
  height: 720
})) {
  console.log('Received chunk:', chunk.buffer.length)
}
fs.closeSync(fd)
```

## Supported Types

Helpers to check supported media types are exposed in `bare-media/types`:

- `supportedImageMimetypes`: list of supported image mimetypes.
- `supportedVideoMimetypes`: list of supported video mimetypes.
- `isImageSupported(mimetype)`: returns `true` if the mimetype is a supported image format.
- `isVideoSupported(mimetype)`: returns `true` if the mimetype is a supported video format.
- `isMediaSupported(mimetype)`: returns `true` if the mimetype is either a supported image or video format.

## License

Apache-2.0
