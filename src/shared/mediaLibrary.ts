export type GlobalMediaKind = 'video' | 'audio' | 'image'

export type GlobalMediaAvailability = 'available' | 'missing'

export interface GlobalMediaAsset {
  id: string
  name: string
  sourcePath: string
  kind: GlobalMediaKind
  sizeBytes: number
  fileModifiedAt: string
  importedAt: string
  availability: GlobalMediaAvailability
  tags: string[]
}

export interface GlobalMediaLibraryResponse {
  success: boolean
  message: string
  assets: GlobalMediaAsset[]
}

export interface GlobalMediaImportResponse extends GlobalMediaLibraryResponse {
  canceled: boolean
  importedCount: number
  duplicateCount: number
  unsupportedCount: number
}

export interface GlobalMediaRelocationResponse extends GlobalMediaLibraryResponse {
  canceled: boolean
}
