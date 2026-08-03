import type { JSX } from 'react'
import { useEffect, useMemo, useReducer, useRef } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import FunctionPanel from './FunctionPanel'
import ParameterPanel from './ParameterPanel'
import PlayerPanel from './PlayerPanel'
import Timeline from './Timeline'
import {
  createInitialEditorProjectState,
  editorProjectReducer,
  selectActiveAsset,
  type CanvasAspectRatio,
  type DraftRow,
  type MediaAsset
} from './editorProject'
import './VideoEditorWorkspace.css'

/**
 * 视频编辑工作区：上方为功能、播放和参数区域，下方为横跨三块的时间线。
 */
function VideoEditorWorkspace(): JSX.Element {
  const [project, dispatch] = useReducer(editorProjectReducer, undefined, () =>
    createInitialEditorProjectState(crypto.randomUUID())
  )
  const mediaUrlsRef = useRef(new Set<string>())
  const addedMediaIds = useMemo(
    () => new Set(project.clips.map((clip) => clip.assetId)),
    [project.clips]
  )
  const activeAsset = selectActiveAsset(project)

  useEffect(() => {
    const mediaUrls = mediaUrlsRef.current

    return () => {
      mediaUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const handleImportMedia = (assets: MediaAsset[]): void => {
    assets.forEach((asset) => {
      mediaUrlsRef.current.add(asset.url)
      dispatch({ type: 'assets/imported', asset })
    })
  }

  const handleMediaReady = (mediaId: string, duration: number): void => {
    dispatch({ type: 'asset/ready', assetId: mediaId, duration })
  }

  const handleMediaError = (mediaId: string): void => {
    dispatch({ type: 'asset/failed', assetId: mediaId, error: '无法预览该视频' })
  }

  const handleAddMedia = (mediaId: string): void => {
    dispatch({ type: 'timeline/assetAdded', assetId: mediaId })
  }

  const handleSelectClip = (clipId: string): void => {
    dispatch({ type: 'timeline/clipSelected', clipId })
  }

  const handleUpdateRow = (rowId: string, updates: Partial<Omit<DraftRow, 'id'>>): void => {
    dispatch({ type: 'draft/rowUpdated', rowId, changes: updates })
  }

  const handleAddRow = (afterRowId: string): void => {
    dispatch({ type: 'draft/rowAdded', rowId: crypto.randomUUID(), afterRowId })
  }

  const handleDeleteRow = (rowId: string): void => {
    dispatch({ type: 'draft/rowDeleted', rowId })
  }

  const handleAspectRatioChange = (aspectRatio: CanvasAspectRatio): void => {
    dispatch({ type: 'aspectRatio/selected', aspectRatio })
  }

  return (
    <section className="studio-workspace" aria-label="剪辑工作区">
      <Group
        className="studio-workspace__rows"
        orientation="vertical"
        resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
      >
        <Panel id="workspace-top" defaultSize="68" minSize={280}>
          <div className="studio-workspace__top">
            <Group
              className="studio-workspace__columns"
              orientation="horizontal"
              resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
            >
              <Panel
                id="function-panel"
                defaultSize={148}
                minSize={112}
                maxSize={240}
                groupResizeBehavior="preserve-pixel-size"
              >
                <FunctionPanel
                  mediaItems={project.assets}
                  addedMediaIds={addedMediaIds}
                  onImportMedia={handleImportMedia}
                  onMediaReady={handleMediaReady}
                  onMediaError={handleMediaError}
                  onAddMedia={handleAddMedia}
                />
              </Panel>

              <Separator
                id="function-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整功能区宽度"
              />

              <Panel id="player-panel" minSize={220}>
                <PlayerPanel
                  key={activeAsset ? `${activeAsset.id}:${activeAsset.status}` : 'empty-player'}
                  activeAsset={activeAsset}
                  selectedRatio={project.aspectRatio}
                  onAspectRatioChange={handleAspectRatioChange}
                  onMediaError={handleMediaError}
                />
              </Panel>

              <Separator
                id="parameter-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整参数区宽度"
              />

              <Panel
                id="parameter-panel"
                defaultSize={180}
                minSize={140}
                maxSize={300}
                groupResizeBehavior="preserve-pixel-size"
              >
                <ParameterPanel />
              </Panel>
            </Group>
          </div>
        </Panel>

        <Separator
          id="workspace-timeline-resize-handle"
          className="studio-workspace__row-resize-handle"
          aria-label="调整时间线高度"
        />

        <Panel id="workspace-timeline" defaultSize="32" minSize={176} maxSize="55">
          <div className="studio-workspace__timeline">
            <Timeline
              clips={project.clips}
              assets={project.assets}
              activeClipId={project.activeClipId}
              rows={project.draftRows}
              onSelectClip={handleSelectClip}
              onUpdateRow={handleUpdateRow}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
            />
          </div>
        </Panel>
      </Group>
    </section>
  )
}

export default VideoEditorWorkspace
