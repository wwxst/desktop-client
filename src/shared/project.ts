export interface ProjectDirectories {
  text: string
  audio: string
  subtitles: string
  materials: string
  output: string
  cache: string
  backups: string
  batches: string
  logs: string
}

export interface ProjectSummary {
  id: string
  name: string
  rootDirectory: string
  createdAt: string
  updatedAt: string
}

export interface ProjectManifest extends ProjectSummary {
  version: 1
  directories: ProjectDirectories
}

export interface ProjectListResponse {
  success: boolean
  message: string
  projects: ProjectSummary[]
}

export interface ProjectDirectorySelectionResponse {
  success: boolean
  message: string
  canceled: boolean
  directoryPath: string | null
  directoryName: string | null
}

export interface ProjectCreateRequest {
  name: string
  rootDirectory: string
}

export interface ProjectCreateResponse extends ProjectListResponse {
  project: ProjectSummary | null
}
