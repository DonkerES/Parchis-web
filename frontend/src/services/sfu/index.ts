import { MediasoupCallClient } from './mediasoupCallClient'
import { MockCallClient } from './mockCallClient'
import type { CallClient } from './types'

export * from './types'

const useMock = import.meta.env.VITE_SFU_MOCK === 'true'

export const callClient: CallClient = useMock
  ? new MockCallClient()
  : new MediasoupCallClient()
