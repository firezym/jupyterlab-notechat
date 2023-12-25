import { NotebookPanel } from '@jupyterlab/notebook'

// 自定义弹出通知界面，在toolbar的下方弹出
export const showCustomNotification = async (
    message: string,
    panel: NotebookPanel,
    timeout: number = 2000
  ): Promise<void> => {
    // 假设 `panel` 是当前的 NotebookPanel 实例
    const toolbar = panel.toolbar.node
    const toolbarRect = toolbar.getBoundingClientRect()
  
    const notification = document.createElement('div')
    notification.className = 'notification'
    notification.textContent = message
    // 设置在工具栏底部
    notification.style.top = `${toolbarRect.bottom}px`
  
    document.body.appendChild(notification)
  
    let timeoutId: number | null = null;
  
    const removeNotification = () => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification)
      }
    }
  
    // 重新启动倒计时
    const restartTimeout = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(removeNotification, timeout);
    }
  
    // 鼠标悬停时清除倒计时
    notification.addEventListener('mouseenter', () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    })
  
    // 鼠标离开时重新开始倒计时
    notification.addEventListener('mouseleave', restartTimeout)
  
    // 开始初始倒计时
    restartTimeout()
  }