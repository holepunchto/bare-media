# keet-worker-compute

Worker for handling heavy tasks outside Keet's main process

```
npm i keet-worker-compute
```

## Usage

```js
import { WorkerClient } from '@holepunchto/keet-worker-compute'

const client = new WorkerClient()
const buffer = await client.heicToJpg(path)
```


