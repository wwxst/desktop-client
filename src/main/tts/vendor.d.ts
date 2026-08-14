declare module 'unbzip2-stream' {
  import type { Transform } from 'node:stream'

  function createBzip2Stream(): Transform
  export default createBzip2Stream
}

declare module 'tar-stream' {
  import type { Readable, Writable } from 'node:stream'

  export interface Headers {
    name: string
    type?: string
    mode?: number
  }

  export interface Extract extends Writable {
    on(
      event: 'entry',
      listener: (header: Headers, stream: Readable, next: () => void) => void
    ): this
  }

  export function extract(): Extract
}
