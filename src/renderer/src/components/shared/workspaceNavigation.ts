export type MenuKey = 'workspace' | 'projects' | 'materials' | 'tasks' | 'history' | 'settings'

export interface MenuItem {
  key: MenuKey
  label: string
  description: string
}

export const workspaceMenuItems: readonly MenuItem[] = [
  {
    key: 'workspace',
    label: '工作台',
    description: '当前任务工作区'
  },
  {
    key: 'projects',
    label: '项目',
    description: '管理本地项目'
  },
  {
    key: 'materials',
    label: '素材',
    description: '管理视频和音频素材'
  },
  {
    key: 'tasks',
    label: '任务',
    description: '查看自动化任务'
  },
  {
    key: 'history',
    label: '历史记录',
    description: '查看已完成任务'
  },
  {
    key: 'settings',
    label: '设置',
    description: '客户端相关设置'
  }
]
